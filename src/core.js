import { DeterministicScientist } from "./scientist.js";

const round = number => Number(number.toFixed(3));

const copyFailureAnalysis = failure => ({
  candidateOmission: [...(failure.candidateOmission ?? [])],
  falsePositives: [...(failure.falsePositives ?? [])],
  unknownRejected: [...(failure.unknownRejected ?? [])],
  queryCount: failure.queryCount ?? 0,
  queries: [...(failure.queries ?? [])],
});

const observationSnapshot = result => ({
  policy: result.policy,
  predictions: [...(result.predictions ?? [])],
  failureAnalysis: copyFailureAnalysis(result.failureAnalysis ?? {}),
});

const policySnapshot = policy => {
  const snapshot = { name: policy.name };
  if (policy.queryBudget !== undefined) snapshot.queryBudget = policy.queryBudget;
  if (policy.unknownHandling !== undefined) snapshot.unknownHandling = policy.unknownHandling;
  return snapshot;
};

const failureEvidenceExists = result => {
  const failure = result?.failureAnalysis ?? {};
  return Boolean(failure.unknownRejected?.length || failure.candidateOmission?.length);
};

const validateProposal = (proposal, interventions, policies) => {
  if (!proposal?.diagnosis?.code || !proposal?.diagnosis?.summary) {
    throw new Error("Scientist proposal requires a structured diagnosis");
  }
  if (!proposal.diagnosis.evidence || typeof proposal.diagnosis.evidence !== "object") {
    throw new Error("Scientist proposal requires diagnostic evidence");
  }
  if (!proposal?.hypothesis?.statement || !proposal?.hypothesis?.expectedEffect) {
    throw new Error("Scientist proposal requires a mechanism-based hypothesis");
  }
  if (!policies[proposal.intervention]) {
    throw new Error(`Scientist proposed unknown intervention: ${proposal.intervention}`);
  }
  if (!interventions.includes(proposal.intervention)) {
    throw new Error(`Scientist proposed out-of-catalog intervention: ${proposal.intervention}`);
  }
};

export class Environment {
  constructor({ task, search }) {
    this.task = task;
    this.groundTruth = task.groundTruth;
    this.search = search;
  }

  async evaluate(policy) {
    const run = await policy.run(this.task, this.search);
    const predicted = [...new Set(run.predictions)];
    const truth = new Set(this.groundTruth);
    const truePositives = predicted.filter(item => truth.has(item));
    const falsePositives = predicted.filter(item => !truth.has(item));
    const candidateOmission = this.groundTruth.filter(item => !predicted.includes(item));
    const precision = predicted.length ? truePositives.length / predicted.length : 0;
    const recall = truePositives.length / this.groundTruth.length;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      taskId: this.task.id,
      policy: policy.name,
      predictions: predicted,
      verificationVerdicts: (run.verificationVerdicts ?? []).map(verdict => ({
        ...verdict,
        candidatePage: verdict.candidatePage ? { ...verdict.candidatePage } : null,
        candidateBoundEvidence: verdict.candidateBoundEvidence
          ? { ...verdict.candidateBoundEvidence }
          : null,
      })),
      metrics: {
        precision: round(precision),
        recall: round(recall),
        f1: round(f1),
      },
      failureAnalysis: {
        candidateOmission,
        falsePositives,
        unknownRejected: run.unknowns,
        queryCount: run.queries.length,
        queries: run.queries,
      },
    };
  }
}

export class ResearchPolicy {
  constructor(spec) {
    Object.assign(this, spec);
  }

  run(task, search) {
    return this.execute(task, search);
  }
}

export class AutoBenchOptimizer {
  constructor({
    environment,
    policies,
    scientist = new DeterministicScientist(),
    maxTrials = 2,
  }) {
    if (!policies.direct_search) throw new Error("direct_search baseline policy is required");
    if (!Number.isInteger(maxTrials) || maxTrials < 1) {
      throw new Error("maxTrials must be a positive integer");
    }

    const interventions = scientist.interventions ?? Object.keys(policies).filter(name => name !== "direct_search");
    if (new Set(interventions).size !== interventions.length) {
      throw new Error("Scientist interventions must be unique");
    }
    for (const intervention of interventions) {
      if (intervention === "direct_search" || !policies[intervention]) {
        throw new Error(`Scientist intervention is not in the bounded policy registry: ${intervention}`);
      }
    }

    this.environment = environment;
    this.policies = policies;
    this.scientist = scientist;
    this.interventions = [...interventions];
    this.maxTrials = maxTrials;
  }

  async optimize() {
    const baselinePolicy = this.policies.direct_search;
    const baseline = await this.environment.evaluate(baselinePolicy);
    const trials = [];
    const testedInterventions = new Set();
    let incumbentPolicy = baselinePolicy;
    let incumbentResult = baseline;
    let observation = baseline;
    let stopReason = "max_trials_reached";
    let learnedFromIteration = null;

    for (let iteration = 1; iteration <= this.maxTrials; iteration += 1) {
      const availableInterventions = this.interventions.filter(
        intervention => !testedInterventions.has(intervention),
      );
      if (!availableInterventions.length) {
        stopReason = "catalog_exhausted";
        break;
      }

      const proposal = await this.scientist.propose({
        observation,
        incumbent: incumbentResult,
        history: trials,
        availableInterventions,
      });
      if (!proposal) {
        stopReason = failureEvidenceExists(observation)
          ? "no_available_hypothesis"
          : "no_actionable_diagnosis";
        break;
      }

      validateProposal(proposal, this.interventions, this.policies);
      if (testedInterventions.has(proposal.intervention)) {
        stopReason = "repeated_intervention_prevented";
        break;
      }
      if (!availableInterventions.includes(proposal.intervention)) {
        throw new Error(`Scientist proposed unavailable intervention: ${proposal.intervention}`);
      }
      testedInterventions.add(proposal.intervention);

      const beforeScore = incumbentResult.metrics.f1;
      const trialBase = {
        iteration,
        observation: observationSnapshot(observation),
        diagnosis: proposal.diagnosis.code,
        diagnosisSummary: proposal.diagnosis.summary,
        diagnosticEvidence: proposal.diagnosis.evidence,
        hypothesis: proposal.hypothesis.statement,
        expectedEffect: proposal.hypothesis.expectedEffect,
        intervention: proposal.intervention,
        scientistSource: proposal.source,
        incumbentPolicy: incumbentPolicy.name,
        beforeScore,
      };

      let experiment;
      try {
        experiment = await this.environment.evaluate(this.policies[proposal.intervention]);
      } catch (error) {
        trials.push({
          ...trialBase,
          experiment: {
            taskId: this.environment.task.id,
            policy: proposal.intervention,
            status: "failed",
            error: { stage: "experiment_execution", name: error.name, message: error.message },
          },
          afterScore: null,
          delta: null,
          decision: "REJECT",
          decisionReason: `experiment failed: ${error.name}: ${error.message}`,
        });
        stopReason = "experiment_failed";
        break;
      }

      const afterScore = experiment.metrics.f1;
      const delta = round(afterScore - beforeScore);
      const decision = afterScore > beforeScore ? "KEEP" : "REJECT";
      const decisionReason =
        decision === "KEEP"
          ? `after F1 ${afterScore.toFixed(3)} exceeded incumbent F1 ${beforeScore.toFixed(3)}`
          : `after F1 ${afterScore.toFixed(3)} did not exceed incumbent F1 ${beforeScore.toFixed(3)}`;

      trials.push({
        ...trialBase,
        experiment,
        afterScore,
        delta,
        decision,
        decisionReason,
      });

      if (decision === "KEEP") {
        incumbentPolicy = this.policies[proposal.intervention];
        incumbentResult = experiment;
        learnedFromIteration = iteration;
        stopReason = "first_improvement_kept";
        break;
      }

      observation = experiment;
    }

    const learned = incumbentPolicy.name !== baselinePolicy.name;
    const learnedPolicy = {
      ...policySnapshot(incumbentPolicy),
      learnedFromIteration,
      status: learned ? "learned" : "baseline_retained",
    };

    return {
      baseline,
      trials,
      learnedPolicy,
      stopReason,
      selectedIntervention: learned ? learnedPolicy.name : null,
      decision: learned ? "KEEP" : "REJECT",
    };
  }
}
