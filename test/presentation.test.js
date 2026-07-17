import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildDemoModel, loadReplay, renderDemo } from "../public/app.js";

const readArtifacts = async () => {
  const [development, transfer] = await Promise.all([
    readFile("data/experiments/task-a.json", "utf8").then(JSON.parse),
    readFile("data/experiments/task-b.json", "utf8").then(JSON.parse),
  ]);
  return { development, transfer };
};

const retainedBaselineArtifacts = (development, transfer) => {
  const retainedPolicy = {
    name: "direct_search",
    queryBudget: 1,
    unknownHandling: "reject",
    learnedFromIteration: null,
    status: "baseline_retained",
  };
  return {
    development: {
      ...structuredClone(development),
      trials: [],
      learnedPolicy: retainedPolicy,
      selectedIntervention: null,
      decision: "REJECT",
    },
    transfer: {
      ...structuredClone(transfer),
      initializedWith: "direct_search",
      developmentLearnedPolicy: retainedPolicy,
      freezeBoundary: {
        status: "frozen",
        source: "development.learnedPolicy",
        learnedFromIteration: null,
        baselineRetained: true,
        policy: retainedPolicy,
      },
      learned: structuredClone(transfer.baseline),
      improvement: 0,
    },
  };
};

test("committed artifacts render the complete causal demo trace", async () => {
  const { development, transfer } = await readArtifacts();
  const model = buildDemoModel(development, transfer);

  assert.equal(model.baseline.policy, "direct_search");
  assert.equal(model.baseline.f1, 0.5);
  assert.deepEqual(model.baseline.predictions, ["Apollo 17", "Apollo 15"]);
  assert.deepEqual(model.baseline.omissions, [
    "Apollo 11",
    "Apollo 12",
    "Apollo 14",
    "Apollo 16",
  ]);
  assert.deepEqual(
    model.trials.map(trial => ({
      observation: trial.evidence.count,
      diagnosis: trial.diagnosis,
      intervention: trial.intervention,
      before: trial.beforeScore,
      after: trial.afterScore,
      delta: trial.delta,
      decision: trial.decision,
    })),
    [
      {
        observation: 4,
        diagnosis: "candidate_omission_high",
        intervention: "broad_discovery_then_verify",
        before: 0.5,
        after: 0,
        delta: -0.5,
        decision: "REJECT",
      },
      {
        observation: 11,
        diagnosis: "unknown_rejection_high",
        intervention: "broad_discovery_with_targeted_followup",
        before: 0.5,
        after: 0.727,
        delta: 0.227,
        decision: "KEEP",
      },
    ],
  );
  assert.equal(model.trials[0].nextObservation.count, 11);
  assert.equal(model.trials[1].result.precision, 0.8);
  assert.deepEqual(model.trials[1].result.falsePositives, ["Apollo 10"]);
  assert.deepEqual(model.freeze.policy, development.learnedPolicy);
  assert.equal(model.freeze.status, "frozen");
  assert.equal(model.unseen.baseline.f1, 0.4);
  assert.equal(model.unseen.learned.f1, 0.75);
  assert.equal(model.unseen.learned.precision, 0.6);
  assert.deepEqual(model.unseen.learned.falsePositives, ["Apollo 12", "Apollo 10"]);
  assert.equal(model.unseen.learned.policy, model.freeze.policy.name);
  assert.equal(model.unseen.delta, 0.35);
  assert.equal(model.unseen.exactPolicyTransferred, true);

  const markup = renderDemo(model);
  const stages = [
    "00 / BASELINE",
    "01 / EXPERIMENT",
    "02 / EXPERIMENT",
    "03 / LEARNED POLICY",
    "04 / UNSEEN TRANSFER",
  ];
  let priorIndex = -1;
  for (const stage of stages) {
    const index = markup.indexOf(stage);
    assert.ok(index > priorIndex, `${stage} must appear in causal order`);
    priorIndex = index;
  }

  for (const requiredText of [
    "0.500",
    "candidate_omission_high",
    "broad_discovery_then_verify",
    "0.000",
    "-0.500",
    "REJECT",
    "11 unknownRejected candidates",
    "unknown_rejection_high",
    "broad_discovery_with_targeted_followup",
    "0.727",
    "+0.227",
    "KEEP",
    "POLICY FREEZE BOUNDARY",
    "NO RE-OPTIMIZATION",
    "0.400",
    "0.750",
    "+0.350",
    "QUALITATIVE SANITY CHECK",
    "RESULT SET</span>Apollo 17 · Apollo 15",
    "PRECISION <strong>0.800</strong>",
    "FALSE POSITIVES <strong>Apollo 10</strong>",
    "P 0.600 · FP Apollo 12 · Apollo 10",
  ]) {
    assert.match(markup, new RegExp(requiredText.replace(/[+]/g, "\\+")));
  }
});

test("presentation handles retained baseline, failed trial, and failed transfer artifacts", async t => {
  const artifacts = await readArtifacts();

  await t.test("retained baseline", () => {
    const retained = retainedBaselineArtifacts(artifacts.development, artifacts.transfer);
    const markup = renderDemo(buildDemoModel(retained.development, retained.transfer));
    assert.match(markup, /No intervention kept/);
    assert.match(markup, /03 \/ BASELINE RETAINED/);
    assert.match(markup, /No policy change learned/);
    assert.match(markup, /direct_search/);
    assert.match(markup, /POLICY FREEZE BOUNDARY/);
  });

  await t.test("failed scientific trial", () => {
    const failed = retainedBaselineArtifacts(artifacts.development, artifacts.transfer);
    failed.development.trials = [
      {
        ...structuredClone(artifacts.development.trials[0]),
        experiment: {
          taskId: "development",
          policy: "broad_discovery_then_verify",
          status: "failed",
          error: {
            stage: "experiment_execution",
            name: "Error",
            message: "search unavailable",
          },
        },
        afterScore: null,
        delta: null,
        decision: "REJECT",
      },
    ];
    const markup = renderDemo(buildDemoModel(failed.development, failed.transfer));
    assert.match(markup, /FAILED/);
    assert.match(markup, /experiment_execution · search unavailable/);
    assert.match(markup, /03 \/ BASELINE RETAINED/);
    assert.match(markup, /No policy change learned/);
  });

  await t.test("failed unseen transfer", () => {
    const transfer = structuredClone(artifacts.transfer);
    transfer.status = "failed";
    delete transfer.learned;
    delete transfer.improvement;
    transfer.error = {
      stage: "unseen_frozen_policy_evaluation",
      name: "Error",
      message: "replay unavailable",
    };
    const markup = renderDemo(buildDemoModel(artifacts.development, transfer));
    assert.match(markup, /Frozen-policy evaluation failed/);
    assert.match(markup, /unseen_frozen_policy_evaluation · replay unavailable/);
    assert.match(markup, /Development decisions and the frozen policy remain unchanged/);
  });
});

test("replay loader rejects stale linkage and bypasses browser caches", async () => {
  const { development, transfer } = await readArtifacts();
  const staleTransfer = structuredClone(transfer);
  staleTransfer.learned.policy = "different_policy";
  assert.throws(
    () => buildDemoModel(development, staleTransfer),
    /did not execute the exact frozen policy/,
  );

  const mutableTransfer = structuredClone(transfer);
  mutableTransfer.freezeBoundary.status = "mutable";
  assert.throws(
    () => buildDemoModel(development, mutableTransfer),
    /has not crossed a frozen-policy boundary/,
  );

  const requests = [];
  const responses = new Map([
    ["/api/task-a", development],
    ["/api/task-b", transfer],
  ]);
  const model = await loadReplay(async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => structuredClone(responses.get(url)),
    };
  });

  assert.deepEqual(requests, [
    { url: "/api/task-a", options: { cache: "no-store" } },
    { url: "/api/task-b", options: { cache: "no-store" } },
  ]);
  assert.equal(model.unseen.exactPolicyTransferred, true);
});
