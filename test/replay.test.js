import test from "node:test";
import assert from "node:assert/strict";

import { runDevelopmentAndTransfer } from "../src/cli.js";
import { AutoBenchOptimizer, Environment } from "../src/core.js";
import { policies } from "../src/policies.js";
import { WikipediaSearch } from "../src/search.js";
import { tasks } from "../src/tasks.js";

const replaySearch = () => new WikipediaSearch({ live: false });

test("committed replay preserves the development research phenomenon", async () => {
  const environment = new Environment({ task: tasks.moonLandings, search: replaySearch() });

  const baseline = await environment.evaluate(policies.direct_search);
  const broad = await environment.evaluate(policies.broad_discovery_then_verify);
  const targeted = await environment.evaluate(policies.broad_discovery_with_targeted_followup);

  assert.equal(baseline.metrics.f1, 0.5);
  assert.deepEqual(baseline.failureAnalysis.candidateOmission, [
    "Apollo 11",
    "Apollo 12",
    "Apollo 14",
    "Apollo 16",
  ]);

  assert.equal(broad.metrics.f1, 0);
  assert.deepEqual(broad.predictions, []);
  assert.deepEqual(broad.failureAnalysis.candidateOmission, tasks.moonLandings.groundTruth);
  assert.deepEqual(broad.failureAnalysis.unknownRejected, [
    "Apollo 17",
    "Apollo 16",
    "Apollo 13",
    "Apollo 12",
    "Apollo 11",
    "Apollo 10",
    "Apollo 7",
    "Apollo 15",
    "Apollo 14",
    "Apollo 8",
    "Apollo 9",
  ]);
  assert.ok(broad.metrics.f1 <= baseline.metrics.f1);

  assert.equal(targeted.metrics.f1, 0.727);
  assert.ok(targeted.metrics.f1 > baseline.metrics.f1);
});

test("committed replay preserves the qualitative unseen transfer phenomenon", async () => {
  const environment = new Environment({ task: tasks.lunarRover, search: replaySearch() });

  const baseline = await environment.evaluate(policies.direct_search);
  const frozenLearnedPolicy = await environment.evaluate(
    policies.broad_discovery_with_targeted_followup,
  );

  assert.equal(baseline.metrics.f1, 0.4);
  assert.equal(frozenLearnedPolicy.metrics.f1, 0.75);
  assert.ok(frozenLearnedPolicy.metrics.f1 > baseline.metrics.f1);
});

test("committed replay produces the measured scientific trial trace", async () => {
  const environment = new Environment({ task: tasks.moonLandings, search: replaySearch() });
  const result = await new AutoBenchOptimizer({ environment, policies }).optimize();

  assert.equal(result.baseline.metrics.f1, 0.5);
  assert.equal(result.trials.length, 2);

  const [broadTrial, targetedTrial] = result.trials;
  assert.deepEqual(
    {
      observation: broadTrial.observation.policy,
      diagnosis: broadTrial.diagnosis,
      intervention: broadTrial.intervention,
      incumbent: broadTrial.incumbentPolicy,
      before: broadTrial.beforeScore,
      after: broadTrial.afterScore,
      delta: broadTrial.delta,
      decision: broadTrial.decision,
    },
    {
      observation: "direct_search",
      diagnosis: "candidate_omission_high",
      intervention: "broad_discovery_then_verify",
      incumbent: "direct_search",
      before: 0.5,
      after: 0,
      delta: -0.5,
      decision: "REJECT",
    },
  );
  assert.equal(broadTrial.diagnosticEvidence.candidateOmissionCount, 4);

  assert.deepEqual(
    {
      observation: targetedTrial.observation.policy,
      diagnosis: targetedTrial.diagnosis,
      intervention: targetedTrial.intervention,
      incumbent: targetedTrial.incumbentPolicy,
      before: targetedTrial.beforeScore,
      after: targetedTrial.afterScore,
      delta: targetedTrial.delta,
      decision: targetedTrial.decision,
    },
    {
      observation: "broad_discovery_then_verify",
      diagnosis: "unknown_rejection_high",
      intervention: "broad_discovery_with_targeted_followup",
      incumbent: "direct_search",
      before: 0.5,
      after: 0.727,
      delta: 0.227,
      decision: "KEEP",
    },
  );
  assert.equal(targetedTrial.diagnosticEvidence.unknownRejectedCount, 11);
  assert.equal(result.learnedPolicy.name, "broad_discovery_with_targeted_followup");
  assert.equal(result.learnedPolicy.learnedFromIteration, 2);
  assert.equal(result.stopReason, "first_improvement_kept");
});

test("committed replay transfers the optimizer-returned frozen policy", async () => {
  const optimizer = new AutoBenchOptimizer({
    environment: new Environment({ task: tasks.moonLandings, search: replaySearch() }),
    policies,
  });
  let unseenCreated = false;
  const run = await runDevelopmentAndTransfer({
    optimizer,
    policyRegistry: policies,
    createUnseenEnvironment: () => {
      unseenCreated = true;
      return new Environment({ task: tasks.lunarRover, search: replaySearch() });
    },
  });

  assert.equal(unseenCreated, true);
  assert.deepEqual(
    run.development.trials.map(trial => [trial.afterScore, trial.decision]),
    [
      [0, "REJECT"],
      [0.727, "KEEP"],
    ],
  );
  assert.equal(run.development.learnedPolicy.name, run.learnedPolicy.name);
  assert.equal(run.learnedPolicy.name, "broad_discovery_with_targeted_followup");
  assert.equal(run.freezeBoundary.source, "development.learnedPolicy");
  assert.deepEqual(run.freezeBoundary.policy, run.learnedPolicy);
  assert.equal(run.unseen.baseline.metrics.f1, 0.4);
  assert.equal(run.unseen.frozenPolicyResult.policy, run.learnedPolicy.name);
  assert.equal(run.unseen.frozenPolicyResult.metrics.f1, 0.75);
  assert.equal(run.unseen.qualitativeTransferDelta, 0.35);
});
