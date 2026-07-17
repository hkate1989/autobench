import test from "node:test";
import assert from "node:assert/strict";

import { AutoBenchOptimizer, Environment } from "../src/core.js";

const task = { id: "t", groundTruth: ["A", "B"] };
const search = {};

const policy = (name, predictions, unknowns = [], calls = []) => ({
  name,
  async run() {
    calls.push(name);
    if (predictions instanceof Error) throw predictions;
    return { predictions, unknowns, queries: [name] };
  },
});

const policySet = ({
  baseline = ["A"],
  broad = [],
  broadUnknowns = ["A", "B"],
  targeted = ["A", "B"],
  targetedUnknowns = [],
  calls = [],
} = {}) => ({
  direct_search: policy("direct_search", baseline, [], calls),
  broad_discovery_then_verify: policy(
    "broad_discovery_then_verify",
    broad,
    broadUnknowns,
    calls,
  ),
  broad_discovery_with_targeted_followup: policy(
    "broad_discovery_with_targeted_followup",
    targeted,
    targetedUnknowns,
    calls,
  ),
});

const optimizer = (policies, options = {}) =>
  new AutoBenchOptimizer({
    environment: new Environment({ task, search }),
    policies,
    ...options,
  });

test("environment reports precision, recall, and omissions", async () => {
  const result = await new Environment({ task, search }).evaluate(policy("p", ["A", "X"]));
  assert.deepEqual(result.metrics, { precision: 0.5, recall: 0.5, f1: 0.5 });
  assert.deepEqual(result.failureAnalysis.candidateOmission, ["B"]);
});

test("optimizer rejects broad, learns from that observation, then keeps targeted", async () => {
  const result = await optimizer(policySet()).optimize();

  assert.equal(result.trials.length, 2);
  assert.deepEqual(
    result.trials.map(trial => [trial.intervention, trial.decision]),
    [
      ["broad_discovery_then_verify", "REJECT"],
      ["broad_discovery_with_targeted_followup", "KEEP"],
    ],
  );

  const [broadTrial, targetedTrial] = result.trials;
  assert.equal(broadTrial.observation.policy, "direct_search");
  assert.equal(broadTrial.diagnosis, "candidate_omission_high");
  assert.deepEqual(broadTrial.diagnosticEvidence.candidateOmission, ["B"]);
  assert.match(broadTrial.hypothesis, /broad candidate discovery/i);
  assert.equal(broadTrial.incumbentPolicy, "direct_search");
  assert.equal(broadTrial.beforeScore, 0.667);
  assert.equal(broadTrial.afterScore, 0);
  assert.equal(broadTrial.delta, -0.667);
  assert.match(broadTrial.decisionReason, /did not exceed/);

  assert.equal(targetedTrial.observation.policy, "broad_discovery_then_verify");
  assert.equal(targetedTrial.diagnosis, "unknown_rejection_high");
  assert.deepEqual(targetedTrial.diagnosticEvidence.unknownRejected, ["A", "B"]);
  assert.match(targetedTrial.hypothesis, /targeted follow-up/i);
  assert.equal(targetedTrial.incumbentPolicy, "direct_search");
  assert.equal(targetedTrial.beforeScore, 0.667);
  assert.equal(targetedTrial.afterScore, 1);
  assert.equal(targetedTrial.delta, 0.333);
  assert.match(targetedTrial.decisionReason, /exceeded/);

  assert.deepEqual(result.learnedPolicy, {
    name: "broad_discovery_with_targeted_followup",
    learnedFromIteration: 2,
    status: "learned",
  });
  assert.equal(result.stopReason, "first_improvement_kept");
});

test("complete baseline stops without proposing broad discovery", async () => {
  const calls = [];
  const result = await optimizer(policySet({ baseline: ["A", "B"], calls })).optimize();

  assert.deepEqual(calls, ["direct_search"]);
  assert.deepEqual(result.trials, []);
  assert.equal(result.learnedPolicy.name, "direct_search");
  assert.equal(result.learnedPolicy.status, "baseline_retained");
  assert.equal(result.stopReason, "no_actionable_diagnosis");
});

test("broad result without rejected unknowns does not trigger targeted follow-up", async () => {
  const calls = [];
  const result = await optimizer(policySet({ broadUnknowns: [], calls })).optimize();

  assert.deepEqual(calls, ["direct_search", "broad_discovery_then_verify"]);
  assert.equal(result.trials.length, 1);
  assert.equal(result.trials[0].decision, "REJECT");
  assert.equal(result.learnedPolicy.name, "direct_search");
  assert.equal(result.stopReason, "no_available_hypothesis");
});

test("successful first intervention freezes immediately and skips targeted follow-up", async () => {
  const calls = [];
  const result = await optimizer(
    policySet({ broad: ["A", "B"], broadUnknowns: [], calls }),
  ).optimize();

  assert.deepEqual(calls, ["direct_search", "broad_discovery_then_verify"]);
  assert.equal(result.trials.length, 1);
  assert.equal(result.trials[0].decision, "KEEP");
  assert.equal(result.learnedPolicy.name, "broad_discovery_then_verify");
  assert.equal(result.learnedPolicy.learnedFromIteration, 1);
  assert.equal(result.stopReason, "first_improvement_kept");
});

test("equal-scoring intervention is rejected", async () => {
  const calls = [];
  const result = await optimizer(
    policySet({ broad: ["B"], broadUnknowns: [], calls }),
  ).optimize();

  assert.equal(result.trials[0].beforeScore, 0.667);
  assert.equal(result.trials[0].afterScore, 0.667);
  assert.equal(result.trials[0].delta, 0);
  assert.equal(result.trials[0].decision, "REJECT");
  assert.equal(result.learnedPolicy.name, "direct_search");
});

test("failed experiment is rejected without a synthetic score", async () => {
  const policies = policySet({ broad: new Error("search unavailable") });
  const result = await optimizer(policies).optimize();

  assert.equal(result.trials.length, 1);
  assert.equal(result.trials[0].decision, "REJECT");
  assert.equal(result.trials[0].experiment.status, "failed");
  assert.equal(result.trials[0].experiment.error.stage, "experiment_execution");
  assert.equal(result.trials[0].afterScore, null);
  assert.equal(result.trials[0].delta, null);
  assert.match(result.trials[0].decisionReason, /search unavailable/);
  assert.equal(result.learnedPolicy.name, "direct_search");
  assert.equal(result.stopReason, "experiment_failed");
});

test("optimizer rejects out-of-catalog and prevents repeated Scientist interventions", async t => {
  const proposal = intervention => ({
    source: "test",
    diagnosis: { code: "test", summary: "test diagnosis", evidence: { count: 1 } },
    hypothesis: { statement: "test mechanism", expectedEffect: "test effect" },
    intervention,
  });

  await t.test("out-of-catalog proposal", async () => {
    const scientist = {
      interventions: ["broad_discovery_then_verify"],
      propose: () => proposal("broad_discovery_with_targeted_followup"),
    };
    await assert.rejects(
      optimizer(policySet(), { scientist }).optimize(),
      /out-of-catalog intervention/,
    );
  });

  await t.test("repeated proposal", async () => {
    const calls = [];
    const scientist = {
      interventions: [
        "broad_discovery_then_verify",
        "broad_discovery_with_targeted_followup",
      ],
      propose: () => proposal("broad_discovery_then_verify"),
    };
    const result = await optimizer(policySet({ calls }), { scientist }).optimize();
    assert.deepEqual(calls, ["direct_search", "broad_discovery_then_verify"]);
    assert.equal(result.trials.length, 1);
    assert.equal(result.stopReason, "repeated_intervention_prevented");
  });
});

test("optimizer reports trial-limit and catalog-exhaustion stops explicitly", async t => {
  await t.test("trial limit", async () => {
    const result = await optimizer(policySet(), { maxTrials: 1 }).optimize();
    assert.equal(result.trials.length, 1);
    assert.equal(result.trials[0].decision, "REJECT");
    assert.equal(result.stopReason, "max_trials_reached");
  });

  await t.test("catalog exhaustion", async () => {
    const result = await optimizer(
      policySet({ targeted: [], targetedUnknowns: ["A", "B"] }),
      { maxTrials: 3 },
    ).optimize();
    assert.equal(result.trials.length, 2);
    assert.deepEqual(result.trials.map(trial => trial.decision), ["REJECT", "REJECT"]);
    assert.equal(result.stopReason, "catalog_exhausted");
  });
});
