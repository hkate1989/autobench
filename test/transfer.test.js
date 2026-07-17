import test from "node:test";
import assert from "node:assert/strict";

import { runDevelopmentAndTransfer } from "../src/cli.js";
import { AutoBenchOptimizer, Environment } from "../src/core.js";

const policy = ({
  name,
  queryBudget = 1,
  unknownHandling = "reject",
  run = async () => ({ predictions: [], unknowns: [], queries: [] }),
}) => ({ name, queryBudget, unknownHandling, run });

const descriptor = (registeredPolicy, overrides = {}) => ({
  name: registeredPolicy.name,
  queryBudget: registeredPolicy.queryBudget,
  unknownHandling: registeredPolicy.unknownHandling,
  learnedFromIteration: 1,
  status: "learned",
  ...overrides,
});

const resultFor = (taskId, policyName, f1) => ({
  taskId,
  policy: policyName,
  predictions: [],
  metrics: { precision: f1, recall: f1, f1 },
  failureAnalysis: {
    candidateOmission: [],
    falsePositives: [],
    unknownRejected: [],
    queryCount: 0,
    queries: [],
  },
});

const recordingEnvironment = ({ scores, calls, frozenStates = [] }) => ({
  task: { id: "unseen" },
  async evaluate(candidate) {
    calls.push(candidate.name);
    frozenStates.push(Object.isFrozen(candidate));
    return resultFor("unseen", candidate.name, scores[candidate.name] ?? 0);
  },
});

test("unseen transfer follows the optimizer's runtime policy output", async t => {
  const direct = policy({ name: "direct_search" });
  const policyX = policy({ name: "policy_x", queryBudget: 2 });
  const policyY = policy({
    name: "policy_y",
    queryBudget: 3,
    unknownHandling: "targeted_followup",
  });
  const policyRegistry = {
    direct_search: direct,
    policy_x: policyX,
    policy_y: policyY,
  };

  for (const learned of [policyX, policyY]) {
    await t.test(`transfers ${learned.name}`, async () => {
      const calls = [];
      const frozenStates = [];
      const development = {
        baseline: resultFor("development", "direct_search", 0.5),
        trials: [],
        learnedPolicy: descriptor(learned),
      };
      const run = await runDevelopmentAndTransfer({
        optimizer: { optimize: async () => development },
        policyRegistry,
        createUnseenEnvironment: () =>
          recordingEnvironment({
            scores: { direct_search: 0.2, [learned.name]: 0.8 },
            calls,
            frozenStates,
          }),
      });

      assert.deepEqual(calls, ["direct_search", learned.name]);
      assert.deepEqual(frozenStates, [false, true]);
      assert.equal(run.learnedPolicy.name, learned.name);
      assert.equal(run.freezeBoundary.policy.name, learned.name);
      assert.equal(run.unseen.frozenPolicyResult.policy, learned.name);
    });
  }
});

test("a retained baseline is frozen and transferred without a fallback intervention", async () => {
  const direct = policy({ name: "direct_search" });
  const preselectedWinner = policy({
    name: "broad_discovery_with_targeted_followup",
    queryBudget: 20,
    unknownHandling: "targeted_followup",
  });
  const policyRegistry = {
    direct_search: direct,
    broad_discovery_with_targeted_followup: preselectedWinner,
  };
  const calls = [];
  const development = {
    baseline: resultFor("development", "direct_search", 1),
    trials: [],
    learnedPolicy: descriptor(direct, {
      learnedFromIteration: null,
      status: "baseline_retained",
    }),
    selectedIntervention: null,
  };

  const run = await runDevelopmentAndTransfer({
    optimizer: { optimize: async () => development },
    policyRegistry,
    createUnseenEnvironment: () =>
      recordingEnvironment({ scores: { direct_search: 0.4 }, calls }),
  });

  assert.deepEqual(calls, ["direct_search", "direct_search"]);
  assert.equal(run.learnedPolicy.name, "direct_search");
  assert.equal(run.freezeBoundary.baselineRetained, true);
  assert.equal(run.unseen.qualitativeTransferDelta, 0);
  assert.ok(!calls.includes("broad_discovery_with_targeted_followup"));
});

test("the freeze boundary prevents unseen evaluation from mutating development state", async () => {
  const direct = policy({ name: "direct_search" });
  const learned = policy({ name: "policy_x", queryBudget: 2 });
  const policyRegistry = { direct_search: direct, policy_x: learned };
  const development = {
    baseline: resultFor("development", "direct_search", 0.5),
    trials: [{ iteration: 1, decision: "KEEP" }],
    learnedPolicy: descriptor(learned),
    stopReason: "first_improvement_kept",
  };
  const before = structuredClone(development);
  let optimizeCalls = 0;
  let unseenCreates = 0;
  const calls = [];

  const run = await runDevelopmentAndTransfer({
    optimizer: {
      async optimize() {
        optimizeCalls += 1;
        return development;
      },
    },
    policyRegistry,
    createUnseenEnvironment: () => {
      unseenCreates += 1;
      return recordingEnvironment({
        scores: { direct_search: 0.25, policy_x: 0.5 },
        calls,
      });
    },
  });

  assert.equal(optimizeCalls, 1);
  assert.equal(unseenCreates, 1);
  assert.deepEqual(calls, ["direct_search", "policy_x"]);
  assert.deepEqual(development, before);
  assert.strictEqual(run.development, development);
  assert.ok(Object.isFrozen(run.learnedPolicy));
  assert.ok(Object.isFrozen(run.freezeBoundary));
  assert.ok(Object.isFrozen(run.freezeBoundary.policy));
  assert.deepEqual(run.development.trials, [{ iteration: 1, decision: "KEEP" }]);
  assert.ok(!Object.hasOwn(run.unseen, "trials"));
  assert.ok(!Object.hasOwn(run.unseen, "decision"));
  assert.ok(!Object.hasOwn(run.unseen, "learnedPolicy"));
});

test("an unseen failure preserves the completed development result and frozen policy", async () => {
  const direct = policy({ name: "direct_search" });
  const learned = policy({ name: "policy_x", queryBudget: 2 });
  const development = {
    baseline: resultFor("development", "direct_search", 0.5),
    trials: [{ iteration: 1, decision: "KEEP" }],
    learnedPolicy: descriptor(learned),
    stopReason: "first_improvement_kept",
  };
  const before = structuredClone(development);
  let optimizeCalls = 0;
  const calls = [];

  const run = await runDevelopmentAndTransfer({
    optimizer: {
      async optimize() {
        optimizeCalls += 1;
        return development;
      },
    },
    policyRegistry: { direct_search: direct, policy_x: learned },
    createUnseenEnvironment: () => ({
      task: { id: "unseen" },
      async evaluate(candidate) {
        calls.push(candidate.name);
        if (candidate.name === "policy_x") throw new Error("unseen search unavailable");
        return resultFor("unseen", candidate.name, 0.25);
      },
    }),
  });

  assert.equal(optimizeCalls, 1);
  assert.deepEqual(calls, ["direct_search", "policy_x"]);
  assert.deepEqual(development, before);
  assert.deepEqual(run.development, before);
  assert.deepEqual(run.learnedPolicy, descriptor(learned));
  assert.ok(Object.isFrozen(run.learnedPolicy));
  assert.equal(run.unseen.status, "failed");
  assert.equal(run.unseen.baseline.metrics.f1, 0.25);
  assert.deepEqual(run.unseen.error, {
    stage: "unseen_frozen_policy_evaluation",
    name: "Error",
    message: "unseen search unavailable",
  });
  assert.ok(!Object.hasOwn(run.unseen, "frozenPolicyResult"));
  assert.ok(!Object.hasOwn(run.unseen, "decision"));
});

const makeDevelopmentPolicies = () => ({
  direct_search: policy({
    name: "direct_search",
    async run(task) {
      return task.id === "development"
        ? { predictions: ["A"], unknowns: [], queries: ["direct"] }
        : { predictions: ["U1"], unknowns: [], queries: ["direct"] };
    },
  }),
  broad_discovery_then_verify: policy({
    name: "broad_discovery_then_verify",
    queryBudget: 2,
    async run(task) {
      return task.id === "development"
        ? { predictions: [], unknowns: ["A", "B"], queries: ["broad"] }
        : { predictions: [], unknowns: [], queries: ["broad"] };
    },
  }),
  broad_discovery_with_targeted_followup: policy({
    name: "broad_discovery_with_targeted_followup",
    queryBudget: 20,
    unknownHandling: "targeted_followup",
    async run(task) {
      return task.id === "development"
        ? { predictions: ["A", "B"], unknowns: [], queries: ["targeted"] }
        : { predictions: ["U1", "U2"], unknowns: [], queries: ["targeted"] };
    },
  }),
});

const runWithUnseenGroundTruth = async unseenGroundTruth => {
  const policyRegistry = makeDevelopmentPolicies();
  const events = [];
  const developmentOptimizer = new AutoBenchOptimizer({
    environment: new Environment({
      task: { id: "development", groundTruth: ["A", "B"] },
      search: {},
    }),
    policies: policyRegistry,
  });
  const optimizer = {
    async optimize() {
      events.push("development:start");
      const result = await developmentOptimizer.optimize();
      events.push("development:complete");
      return result;
    },
  };

  const run = await runDevelopmentAndTransfer({
    optimizer,
    policyRegistry,
    createUnseenEnvironment: () => {
      events.push("unseen:create");
      return new Environment({
        task: { id: "unseen", groundTruth: unseenGroundTruth },
        search: {},
      });
    },
  });

  return { run, events };
};

test("changing unseen ground truth cannot affect development decisions or learned policy", async () => {
  const first = await runWithUnseenGroundTruth(["U1", "U2"]);
  const second = await runWithUnseenGroundTruth(["Z"]);

  assert.deepEqual(first.events, [
    "development:start",
    "development:complete",
    "unseen:create",
  ]);
  assert.deepEqual(second.events, first.events);
  assert.deepEqual(first.run.development, second.run.development);
  assert.deepEqual(first.run.learnedPolicy, second.run.learnedPolicy);
  assert.deepEqual(
    first.run.development.trials.map(trial => trial.decision),
    ["REJECT", "KEEP"],
  );
  assert.notEqual(
    first.run.unseen.frozenPolicyResult.metrics.f1,
    second.run.unseen.frozenPolicyResult.metrics.f1,
  );
});

test("a descriptor that drifts from registered behavior is rejected before unseen access", async () => {
  const direct = policy({ name: "direct_search" });
  const learned = policy({ name: "policy_x", queryBudget: 2 });
  let unseenAccessed = false;

  await assert.rejects(
    runDevelopmentAndTransfer({
      optimizer: {
        optimize: async () => ({
          learnedPolicy: descriptor(learned, { queryBudget: 99 }),
        }),
      },
      policyRegistry: { direct_search: direct, policy_x: learned },
      createUnseenEnvironment: () => {
        unseenAccessed = true;
        return recordingEnvironment({ scores: {}, calls: [] });
      },
    }),
    /does not match registered behavior/,
  );

  assert.equal(unseenAccessed, false);
});

test("descriptor identity and learned-state contradictions are rejected before unseen access", async t => {
  const direct = policy({ name: "direct_search" });
  const candidate = policy({ name: "policy_x", queryBudget: 2 });

  const assertRejectedBeforeUnseen = async (learnedPolicy, policyRegistry, pattern) => {
    let unseenAccessed = false;
    await assert.rejects(
      runDevelopmentAndTransfer({
        optimizer: { optimize: async () => ({ learnedPolicy }) },
        policyRegistry,
        createUnseenEnvironment: () => {
          unseenAccessed = true;
          return recordingEnvironment({ scores: {}, calls: [] });
        },
      }),
      pattern,
    );
    assert.equal(unseenAccessed, false);
  };

  await t.test("registry key and executable identity differ", () =>
    assertRejectedBeforeUnseen(
      descriptor(candidate),
      {
        direct_search: direct,
        policy_x: { ...candidate, name: "policy_y" },
      },
      /does not match executable policy identity/,
    ));

  await t.test("candidate claims baseline retention", () =>
    assertRejectedBeforeUnseen(
      descriptor(candidate, {
        learnedFromIteration: null,
        status: "baseline_retained",
      }),
      { direct_search: direct, policy_x: candidate },
      /learned intervention must have learned status/,
    ));

  await t.test("baseline claims a learned iteration", () =>
    assertRejectedBeforeUnseen(
      descriptor(direct, { status: "learned" }),
      { direct_search: direct },
      /retained baseline must have baseline_retained status/,
    ));

  await t.test("descriptor declares an unregistered behavior version", () =>
    assertRejectedBeforeUnseen(
      descriptor(candidate, { version: "v2" }),
      { direct_search: direct, policy_x: candidate },
      /does not match registered behavior for version/,
    ));
});
