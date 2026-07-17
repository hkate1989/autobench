import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { AutoBenchOptimizer, Environment } from "./core.js";
import { policies } from "./policies.js";
import { WikipediaSearch } from "./search.js";
import { tasks } from "./tasks.js";

const BASELINE_POLICY = "direct_search";
const BEHAVIOR_FIELDS = ["queryBudget", "unknownHandling", "version"];

const round = number => Number(number.toFixed(3));

const createSearch = () => new WikipediaSearch({ live: process.env.AUTOBENCH_REPLAY !== "1" });

const validateLearnedPolicyState = learnedPolicy => {
  const retainedBaseline = learnedPolicy.name === BASELINE_POLICY;
  if (retainedBaseline) {
    if (
      learnedPolicy.status !== "baseline_retained" ||
      learnedPolicy.learnedFromIteration != null
    ) {
      throw new Error(
        "A retained baseline must have baseline_retained status and no learned iteration",
      );
    }
    return;
  }

  if (
    learnedPolicy.status !== "learned" ||
    !Number.isInteger(learnedPolicy.learnedFromIteration) ||
    learnedPolicy.learnedFromIteration < 1
  ) {
    throw new Error(
      "A learned intervention must have learned status and a positive learned iteration",
    );
  }
};

export function freezeLearnedPolicy(learnedPolicy, policyRegistry) {
  if (!learnedPolicy?.name) {
    throw new Error("Development optimization must return a named learnedPolicy");
  }

  const registeredPolicy = policyRegistry[learnedPolicy.name];
  if (!registeredPolicy) {
    throw new Error(`Learned policy is not in the bounded policy registry: ${learnedPolicy.name}`);
  }
  if (registeredPolicy.name !== learnedPolicy.name) {
    throw new Error("Learned policy registry key does not match executable policy identity");
  }

  validateLearnedPolicyState(learnedPolicy);

  for (const field of BEHAVIOR_FIELDS) {
    const descriptorHasField = Object.hasOwn(learnedPolicy, field);
    const registeredHasField = Object.hasOwn(registeredPolicy, field);
    if (
      descriptorHasField !== registeredHasField ||
      (descriptorHasField && learnedPolicy[field] !== registeredPolicy[field])
    ) {
      throw new Error(
        `Learned policy descriptor does not match registered behavior for ${field}`,
      );
    }
  }

  const descriptor = Object.freeze({ ...learnedPolicy });
  const executable = Object.freeze({ ...registeredPolicy });

  return Object.freeze({ descriptor, executable });
}

export async function transferLearnedPolicy({
  development,
  createUnseenEnvironment,
  policyRegistry,
}) {
  if (!policyRegistry[BASELINE_POLICY]) {
    throw new Error(`${BASELINE_POLICY} baseline policy is required for unseen comparison`);
  }
  if (typeof createUnseenEnvironment !== "function") {
    throw new Error("A lazy unseen-environment factory is required");
  }

  const frozen = freezeLearnedPolicy(development?.learnedPolicy, policyRegistry);
  const freezeBoundary = Object.freeze({
    status: "frozen",
    source: "development.learnedPolicy",
    learnedFromIteration: frozen.descriptor.learnedFromIteration ?? null,
    baselineRetained: frozen.descriptor.status === "baseline_retained",
    policy: frozen.descriptor,
  });

  let stage = "unseen_environment_creation";
  let unseenEnvironment;
  let baseline;
  try {
    unseenEnvironment = await createUnseenEnvironment();
    stage = "unseen_baseline_evaluation";
    baseline = await unseenEnvironment.evaluate(policyRegistry[BASELINE_POLICY]);
    stage = "unseen_frozen_policy_evaluation";
    const frozenPolicyResult = await unseenEnvironment.evaluate(frozen.executable);

    return Object.freeze({
      learnedPolicy: frozen.descriptor,
      freezeBoundary,
      unseen: Object.freeze({
        status: "complete",
        label: "qualitative_same_family_transfer_sanity_check",
        taskId: unseenEnvironment.task?.id ?? baseline.taskId,
        baseline,
        frozenPolicyResult,
        qualitativeTransferDelta: round(
          frozenPolicyResult.metrics.f1 - baseline.metrics.f1,
        ),
      }),
    });
  } catch (error) {
    return Object.freeze({
      learnedPolicy: frozen.descriptor,
      freezeBoundary,
      unseen: Object.freeze({
        status: "failed",
        label: "qualitative_same_family_transfer_sanity_check",
        taskId: unseenEnvironment?.task?.id ?? baseline?.taskId ?? null,
        ...(baseline ? { baseline } : {}),
        error: Object.freeze({ stage, name: error.name, message: error.message }),
      }),
    });
  }
}

export async function runDevelopmentAndTransfer({
  optimizer,
  createUnseenEnvironment,
  policyRegistry,
}) {
  const development = await optimizer.optimize();
  const transfer = await transferLearnedPolicy({
    development,
    createUnseenEnvironment,
    policyRegistry,
  });

  return Object.freeze({ development, ...transfer });
}

const unseenRecord = run => {
  const record = {
    claim: "Qualitative same-family transfer sanity check; not statistical evidence of generalization.",
    taskId: run.unseen.taskId,
    developmentArtifact: "task-a.json",
    initializedWith: run.learnedPolicy.name,
    developmentLearnedPolicy: run.development.learnedPolicy,
    freezeBoundary: run.freezeBoundary,
    status: run.unseen.status,
  };

  if (run.unseen.status === "failed") {
    return {
      ...record,
      ...(run.unseen.baseline ? { baseline: run.unseen.baseline } : {}),
      error: run.unseen.error,
    };
  }

  return {
    ...record,
    baseline: run.unseen.baseline,
    learned: run.unseen.frozenPolicyResult,
    improvement: run.unseen.qualitativeTransferDelta,
  };
};

const persistRun = async run => {
  await mkdir("data/experiments", { recursive: true });
  await Promise.all([
    writeFile(
      "data/experiments/task-a.json",
      `${JSON.stringify(run.development, null, 2)}\n`,
    ),
    writeFile(
      "data/experiments/task-b.json",
      `${JSON.stringify(unseenRecord(run), null, 2)}\n`,
    ),
  ]);
};

export async function validate() {
  const environment = new Environment({ task: tasks.moonLandings, search: createSearch() });
  const results = [];
  for (const policy of Object.values(policies)) {
    results.push(await environment.evaluate(policy));
  }
  console.table(
    results.map(result => ({
      policy: result.policy,
      ...result.metrics,
      queries: result.failureAnalysis.queryCount,
    })),
  );
  if (!results.slice(1).some(result => result.metrics.f1 > results[0].metrics.f1)) {
    throw new Error("PHASE 0 GATE FAILED: no reproducible improvement");
  }
  return results;
}

export async function experiment() {
  const search = createSearch();
  const optimizer = new AutoBenchOptimizer({
    environment: new Environment({ task: tasks.moonLandings, search }),
    policies,
  });
  const run = await runDevelopmentAndTransfer({
    optimizer,
    policyRegistry: policies,
    createUnseenEnvironment: () => new Environment({ task: tasks.lunarRover, search }),
  });

  await persistRun(run);
  console.log(JSON.stringify(run, null, 2));
  return run;
}

export async function generalize() {
  return experiment();
}

export async function main(command = process.argv[2] ?? "validate") {
  if (command === "validate") return validate();
  if (command === "experiment") return experiment();
  if (command === "generalize") return generalize();
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
