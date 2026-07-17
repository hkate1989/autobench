import test from "node:test";
import assert from "node:assert/strict";

import { runDevelopmentAndTransfer } from "../src/cli.js";
import { AutoBenchOptimizer, Environment } from "../src/core.js";
import { policies } from "../src/policies.js";
import { WikipediaSearch } from "../src/search.js";
import { missionTitles, tasks } from "../src/tasks.js";

const replaySearch = () => new WikipediaSearch({ live: false });
const normalized = value => String(value).normalize("NFKC").replace(/\s+/gu, " ").trim();

const assertCandidateBoundEvidence = async (result, task, search) => {
  const accepted = result.verificationVerdicts.filter(verdict => verdict.verdict === "accepted");
  assert.deepEqual(
    accepted.map(verdict => verdict.candidate),
    result.predictions,
  );

  for (const verdict of accepted) {
    assert.equal(verdict.reasonCode, "candidate_bound_evidence_found");
    assert.ok(verdict.candidatePage);
    assert.ok(verdict.candidateBoundEvidence);
    const evidenceText = normalized(
      `${verdict.candidateBoundEvidence.title} ${verdict.candidateBoundEvidence.snippet}`,
    );
    assert.ok(missionTitles(evidenceText).includes(verdict.candidate));
    assert.match(evidenceText, new RegExp(task.verifyPhrase.source, task.verifyPhrase.flags));

    const replay = await search.search(verdict.query, verdict.searchLimit);
    assert.deepEqual(verdict.candidateBoundEvidence, {
      rank: verdict.candidateBoundEvidence.rank,
      ...replay.results[verdict.candidateBoundEvidence.rank - 1],
    });
  }
};

test("committed replay preserves baseline and rejects both development interventions", async () => {
  const search = replaySearch();
  const environment = new Environment({ task: tasks.moonLandings, search });

  const baseline = await environment.evaluate(policies.direct_search);
  const broad = await environment.evaluate(policies.broad_discovery_then_verify);
  const targeted = await environment.evaluate(policies.broad_discovery_with_targeted_followup);

  assert.equal(baseline.metrics.f1, 0.5);
  assert.deepEqual(baseline.predictions, ["Apollo 17", "Apollo 15"]);
  assert.deepEqual(baseline.failureAnalysis.candidateOmission, [
    "Apollo 11",
    "Apollo 12",
    "Apollo 14",
    "Apollo 16",
  ]);
  assert.deepEqual(baseline.failureAnalysis.falsePositives, []);

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
  assert.ok(
    broad.verificationVerdicts.every(
      verdict =>
        verdict.verdict === "rejected" &&
        verdict.reasonCode === "verification_results_empty" &&
        verdict.candidateBoundEvidence === null,
    ),
  );

  assert.deepEqual(targeted.predictions, ["Apollo 15", "Apollo 14"]);
  assert.deepEqual(targeted.metrics, { precision: 1, recall: 0.333, f1: 0.5 });
  assert.deepEqual(targeted.failureAnalysis.falsePositives, []);
  assert.deepEqual(targeted.failureAnalysis.candidateOmission, [
    "Apollo 11",
    "Apollo 12",
    "Apollo 16",
    "Apollo 17",
  ]);
  assert.deepEqual(
    targeted.verificationVerdicts
      .filter(verdict => verdict.verdict === "accepted")
      .map(verdict => verdict.candidate),
    ["Apollo 15", "Apollo 14"],
  );
  const apollo10 = targeted.verificationVerdicts.find(
    verdict => verdict.candidate === "Apollo 10",
  );
  assert.equal(apollo10.verdict, "rejected");
  assert.equal(apollo10.reasonCode, "candidate_bound_evidence_missing");
  assert.ok(apollo10.candidatePage);
  assert.equal(apollo10.candidateBoundEvidence, null);
  await assertCandidateBoundEvidence(targeted, tasks.moonLandings, search);
  assert.ok(targeted.metrics.f1 <= baseline.metrics.f1);
});

test("corrected targeted policy is perfect standalone on unseen replay", async () => {
  const search = replaySearch();
  const environment = new Environment({ task: tasks.lunarRover, search });

  const baseline = await environment.evaluate(policies.direct_search);
  const targeted = await environment.evaluate(policies.broad_discovery_with_targeted_followup);

  assert.deepEqual(baseline.predictions, ["Apollo 11", "Apollo 15"]);
  assert.deepEqual(baseline.metrics, { precision: 0.5, recall: 0.333, f1: 0.4 });
  assert.deepEqual(baseline.failureAnalysis.falsePositives, ["Apollo 11"]);
  assert.deepEqual(baseline.failureAnalysis.candidateOmission, ["Apollo 16", "Apollo 17"]);

  assert.deepEqual(targeted.predictions, ["Apollo 17", "Apollo 16", "Apollo 15"]);
  assert.deepEqual(targeted.metrics, { precision: 1, recall: 1, f1: 1 });
  assert.deepEqual(targeted.failureAnalysis.falsePositives, []);
  assert.deepEqual(targeted.failureAnalysis.candidateOmission, []);
  assert.deepEqual(
    targeted.predictions.filter(candidate => !baseline.predictions.includes(candidate)),
    ["Apollo 17", "Apollo 16"],
  );
  await assertCandidateBoundEvidence(targeted, tasks.lunarRover, search);
});

test("committed replay produces two measured REJECT decisions and retains baseline", async () => {
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
      after: 0.5,
      delta: 0,
      decision: "REJECT",
    },
  );
  assert.equal(targetedTrial.diagnosticEvidence.unknownRejectedCount, 11);
  assert.equal(targetedTrial.experiment.verificationVerdicts.length, 11);
  assert.deepEqual(result.learnedPolicy, {
    name: "direct_search",
    queryBudget: 1,
    unknownHandling: "reject",
    learnedFromIteration: null,
    status: "baseline_retained",
  });
  assert.equal(result.stopReason, "max_trials_reached");
});

test("real transfer uses the retained development baseline, not the better unseen policy", async () => {
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
      [0.5, "REJECT"],
    ],
  );
  assert.equal(run.development.learnedPolicy.name, run.learnedPolicy.name);
  assert.equal(run.learnedPolicy.name, "direct_search");
  assert.equal(run.learnedPolicy.status, "baseline_retained");
  assert.equal(run.freezeBoundary.source, "development.learnedPolicy");
  assert.equal(run.freezeBoundary.baselineRetained, true);
  assert.deepEqual(run.freezeBoundary.policy, run.learnedPolicy);
  assert.equal(run.unseen.baseline.metrics.f1, 0.4);
  assert.equal(run.unseen.frozenPolicyResult.policy, "direct_search");
  assert.equal(run.unseen.frozenPolicyResult.metrics.f1, 0.4);
  assert.equal(run.unseen.qualitativeTransferDelta, 0);
});
