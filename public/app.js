const POLICY_FIELDS = [
  "name",
  "queryBudget",
  "unknownHandling",
  "learnedFromIteration",
  "status",
];

const escapeHtml = value =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const finiteNumber = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Replay artifact requires numeric ${label}`);
  return number;
};

const score = value => finiteNumber(value, "score").toFixed(3);
const signed = value => {
  const number = finiteNumber(value, "delta");
  return `${number >= 0 ? "+" : ""}${number.toFixed(3)}`;
};

const sameDescriptor = (left, right) =>
  POLICY_FIELDS.every(field => left?.[field] === right?.[field]);

const resultModel = (result, label) => {
  if (!result?.policy || !result?.metrics) {
    throw new Error(`Replay artifact is missing ${label}`);
  }
  return {
    policy: result.policy,
    f1: finiteNumber(result.metrics.f1, `${label} F1`),
    precision: finiteNumber(result.metrics.precision, `${label} precision`),
    recall: finiteNumber(result.metrics.recall, `${label} recall`),
    predictions: [...(result.predictions ?? [])],
    omissions: [...(result.failureAnalysis?.candidateOmission ?? [])],
    falsePositives: [...(result.failureAnalysis?.falsePositives ?? [])],
    unknownRejected: [...(result.failureAnalysis?.unknownRejected ?? [])],
  };
};

const evidenceModel = trial => {
  const evidence = trial.diagnosticEvidence ?? {};
  if (Number.isFinite(Number(evidence.unknownRejectedCount))) {
    return {
      count: Number(evidence.unknownRejectedCount),
      label: "unknownRejected candidates",
      items: [...(evidence.unknownRejected ?? [])],
    };
  }
  if (Number.isFinite(Number(evidence.candidateOmissionCount))) {
    return {
      count: Number(evidence.candidateOmissionCount),
      label: "candidate omissions",
      items: [...(evidence.candidateOmission ?? [])],
    };
  }
  return { count: 0, label: "observed failures", items: [] };
};

const trialModel = trial => {
  const experimentFailed =
    trial.experiment?.status === "failed" || trial.afterScore == null || trial.delta == null;
  const nextUnknowns = [...(trial.experiment?.failureAnalysis?.unknownRejected ?? [])];
  return {
    iteration: trial.iteration,
    observationPolicy: trial.observation?.policy ?? "unknown",
    evidence: evidenceModel(trial),
    diagnosis: trial.diagnosis,
    diagnosisSummary: trial.diagnosisSummary,
    hypothesis: trial.hypothesis,
    expectedEffect: trial.expectedEffect,
    intervention: trial.intervention,
    incumbentPolicy: trial.incumbentPolicy,
    beforeScore: finiteNumber(trial.beforeScore, "trial before score"),
    afterScore: experimentFailed ? null : finiteNumber(trial.afterScore, "trial after score"),
    delta: experimentFailed ? null : finiteNumber(trial.delta, "trial delta"),
    decision: trial.decision,
    decisionReason: trial.decisionReason,
    experimentFailed,
    result: experimentFailed ? null : resultModel(trial.experiment, "trial experiment result"),
    error: trial.experiment?.error ?? null,
    nextObservation:
      trial.decision === "REJECT" && nextUnknowns.length
        ? { count: nextUnknowns.length, label: "unknownRejected candidates" }
        : null,
  };
};

export function buildDemoModel(development, transfer) {
  if (!development?.baseline || !Array.isArray(development.trials)) {
    throw new Error("Development replay artifact is incomplete");
  }
  if (!development.learnedPolicy || !transfer?.freezeBoundary?.policy) {
    throw new Error("Replay artifact is missing the learned-policy freeze boundary");
  }
  if (transfer.freezeBoundary.status !== "frozen") {
    throw new Error("Replay artifact has not crossed a frozen-policy boundary");
  }

  const frozenPolicy = transfer.freezeBoundary.policy;
  if (!sameDescriptor(development.learnedPolicy, frozenPolicy)) {
    throw new Error("Development learned policy does not match the frozen descriptor");
  }
  if (
    transfer.developmentLearnedPolicy &&
    !sameDescriptor(development.learnedPolicy, transfer.developmentLearnedPolicy)
  ) {
    throw new Error("Transfer artifact is not linked to this development result");
  }

  const transferStatus = transfer.status ?? (transfer.learned ? "complete" : "failed");
  let unseen;
  if (transferStatus === "complete") {
    const baseline = resultModel(transfer.baseline, "unseen baseline result");
    const learned = resultModel(transfer.learned, "unseen frozen-policy result");
    if (learned.policy !== frozenPolicy.name) {
      throw new Error("Unseen result did not execute the exact frozen policy");
    }
    unseen = {
      status: "complete",
      baseline,
      learned,
      delta: finiteNumber(transfer.improvement, "unseen transfer delta"),
      claim: transfer.claim,
      exactPolicyTransferred: true,
    };
  } else {
    unseen = {
      status: "failed",
      baseline: transfer.baseline ? resultModel(transfer.baseline, "unseen baseline result") : null,
      error: transfer.error ?? { stage: "unseen_evaluation", message: "Transfer unavailable" },
      claim: transfer.claim,
      exactPolicyTransferred: false,
    };
  }

  return {
    baseline: resultModel(development.baseline, "development baseline result"),
    trials: development.trials.map(trialModel),
    learnedPolicy: { ...development.learnedPolicy },
    freeze: {
      status: transfer.freezeBoundary.status,
      source: transfer.freezeBoundary.source,
      baselineRetained: Boolean(transfer.freezeBoundary.baselineRetained),
      policy: { ...frozenPolicy },
    },
    unseen,
  };
}

const chips = items =>
  items.length
    ? `<div class="chip-list">${items
        .map(item => `<span class="chip">${escapeHtml(item)}</span>`)
        .join("")}</div>`
    : '<p class="empty-list">None</p>';

const renderBaseline = baseline => `
  <article class="stage-card baseline-card">
    <header class="card-header">
      <span class="step-index">00 / BASELINE</span>
      <span class="phase-tag">DEVELOPMENT</span>
    </header>
    <p class="field-label">RESEARCH POLICY</p>
    <h2 class="policy-name">${escapeHtml(baseline.policy)}</h2>
    <div class="hero-score">
      <strong>${score(baseline.f1)}</strong>
      <span>F1</span>
    </div>
    <div class="evidence-block">
      <p class="result-set"><span>RESULT SET</span>${escapeHtml(baseline.predictions.join(" · ") || "No predictions")}</p>
      <p class="field-label">OBSERVED FAILURE</p>
      <p class="evidence-count"><strong>${baseline.omissions.length}</strong> candidate omissions</p>
      ${chips(baseline.omissions)}
    </div>
  </article>`;

const renderTrial = trial => {
  const decision = String(trial.decision ?? "REJECT").toLowerCase();
  const after = trial.experimentFailed ? "FAILED" : score(trial.afterScore);
  const delta = trial.experimentFailed ? "—" : signed(trial.delta);
  return `
    <article class="stage-card trial-card decision-${escapeHtml(decision)}">
      <header class="card-header">
        <span class="step-index">0${escapeHtml(trial.iteration)} / EXPERIMENT</span>
        <span class="decision-badge">${escapeHtml(trial.decision)}</span>
      </header>
      <div class="observation-row">
        <span class="field-label">OBSERVATION</span>
        <strong>${escapeHtml(trial.evidence.count)}</strong>
        <span>${escapeHtml(trial.evidence.label)}</span>
      </div>
      <div class="reasoning-stack">
        <div>
          <p class="field-label">DIAGNOSIS</p>
          <p class="code-value">${escapeHtml(trial.diagnosis)}</p>
        </div>
        <div>
          <p class="field-label">HYPOTHESIS</p>
          <p class="hypothesis">${escapeHtml(trial.hypothesis)}</p>
        </div>
        <div>
          <p class="field-label">BOUNDED INTERVENTION</p>
          <p class="code-value intervention">${escapeHtml(trial.intervention)}</p>
        </div>
      </div>
      <div class="score-transition">
        <span><small>INCUMBENT</small><strong>${score(trial.beforeScore)}</strong></span>
        <span class="score-arrow" aria-hidden="true">→</span>
        <span><small>RESULT</small><strong>${after}</strong></span>
        <span class="trial-delta">${delta}</span>
      </div>
      ${
        trial.result && trial.decision === "KEEP"
          ? `<p class="result-quality"><span>RESULT SET ${escapeHtml(trial.result.predictions.join(" · ") || "None")}</span><span>PRECISION <strong>${score(trial.result.precision)}</strong></span><span>FALSE POSITIVES <strong>${escapeHtml(trial.result.falsePositives.join(" · ") || "None")}</strong></span></p>`
          : ""
      }
      ${
        trial.nextObservation
          ? `<p class="next-signal"><span>FAILED RESULT → NEXT OBSERVATION</span><strong>${trial.nextObservation.count} ${escapeHtml(trial.nextObservation.label)}</strong></p>`
          : ""
      }
      ${
        trial.experimentFailed
          ? `<p class="trial-error">${escapeHtml(trial.error?.stage)} · ${escapeHtml(trial.error?.message)}</p>`
          : ""
      }
    </article>`;
};

const renderNoTrials = model => `
  <div class="flow-arrow" aria-hidden="true">→</div>
  <article class="stage-card no-trials-card">
    <span class="step-index">01 / STOP</span>
    <h2>No intervention kept</h2>
    <p>No actionable diagnosis produced another experiment. The measured baseline is retained.</p>
    <p class="code-value">${escapeHtml(model.learnedPolicy.name)}</p>
  </article>`;

const renderFrozenPolicy = freeze => `
  <article class="freeze-card">
    <header class="card-header">
      <span class="step-index">03 / ${freeze.baselineRetained ? "BASELINE RETAINED" : "LEARNED POLICY"}</span>
      <span class="freeze-badge">${escapeHtml(freeze.status)}</span>
    </header>
    <p class="field-label">${freeze.baselineRetained ? "RETAINED POLICY DESCRIPTOR" : "EXACT POLICY DESCRIPTOR"}</p>
    <h2 class="policy-name">${escapeHtml(freeze.policy.name)}</h2>
    ${
      freeze.baselineRetained
        ? '<p class="retention-note">No policy change learned; the measured baseline crosses this boundary unchanged.</p>'
        : ""
    }
    <dl class="descriptor-grid">
      <div><dt>queryBudget</dt><dd>${escapeHtml(freeze.policy.queryBudget)}</dd></div>
      <div><dt>unknownHandling</dt><dd>${escapeHtml(freeze.policy.unknownHandling)}</dd></div>
      <div><dt>learnedFromIteration</dt><dd>${escapeHtml(freeze.policy.learnedFromIteration ?? "baseline")}</dd></div>
    </dl>
  </article>`;

const renderUnseen = unseen => {
  if (unseen.status === "failed") {
    return `
      <article class="unseen-card transfer-failed">
        <header class="card-header">
          <span class="step-index">04 / UNSEEN TRANSFER</span>
          <span class="phase-tag">UNAVAILABLE</span>
        </header>
        <h2>Frozen-policy evaluation failed</h2>
        <p class="trial-error">${escapeHtml(unseen.error.stage)} · ${escapeHtml(unseen.error.message)}</p>
        <p class="scope-note">Development decisions and the frozen policy remain unchanged.</p>
      </article>`;
  }

  return `
    <article class="unseen-card">
      <header class="card-header">
        <span class="step-index">04 / UNSEEN TRANSFER</span>
        <span class="phase-tag">QUALITATIVE SANITY CHECK</span>
      </header>
      <div class="unseen-heading">
        <div>
          <p class="field-label">SAME-FAMILY TASK</p>
          <h2>Does the learned policy travel?</h2>
        </div>
        <strong class="transfer-delta">${signed(unseen.delta)}</strong>
      </div>
      <div class="comparison-grid">
        <div class="comparison-result">
          <span>BASELINE</span>
          <strong>${score(unseen.baseline.f1)}</strong>
          <small>${escapeHtml(unseen.baseline.policy)} · SET ${escapeHtml(unseen.baseline.predictions.join(" · ") || "None")} · P ${score(unseen.baseline.precision)} · FP ${escapeHtml(unseen.baseline.falsePositives.join(" · ") || "None")}</small>
        </div>
        <span class="comparison-arrow" aria-hidden="true">→</span>
        <div class="comparison-result transferred-result">
          <span>FROZEN POLICY</span>
          <strong>${score(unseen.learned.f1)}</strong>
          <small>${escapeHtml(unseen.learned.policy)} · SET ${escapeHtml(unseen.learned.predictions.join(" · ") || "None")} · P ${score(unseen.learned.precision)} · FP ${escapeHtml(unseen.learned.falsePositives.join(" · ") || "None")}</small>
        </div>
      </div>
      <p class="scope-note">${escapeHtml(unseen.claim)}</p>
    </article>`;
};

export function renderDemo(model) {
  const experimentCards = model.trials.length
    ? model.trials
        .map(
          trial =>
            `<div class="flow-arrow" aria-hidden="true">→</div>${renderTrial(trial)}`,
        )
        .join("")
    : renderNoTrials(model);

  return `
    <section class="hero">
      <div>
        <p class="mono-label">AUTOMATED RESEARCH AGENT R&amp;D</p>
        <h1>Learn from failure.<br><em>Keep only what works.</em></h1>
      </div>
      <p class="hero-copy">A baseline fails. The Scientist diagnoses why. Ground truth decides which research strategy survives.</p>
    </section>

    <section class="development-section" aria-labelledby="development-title">
      <header class="section-header">
        <div>
          <p class="mono-label">DEVELOPMENT LOOP</p>
          <h2 id="development-title">Observation-dependent experiments</h2>
        </div>
        <p>APOLLO CREWED MOON LANDINGS</p>
      </header>
      <div class="development-flow">
        ${renderBaseline(model.baseline)}
        ${experimentCards}
      </div>
    </section>

    <section class="transfer-section" aria-label="Frozen learned policy and unseen transfer">
      ${renderFrozenPolicy(model.freeze)}
      <div class="freeze-gate">
        <span class="gate-line" aria-hidden="true"></span>
        <span class="gate-lock" aria-hidden="true">◇</span>
        <strong>POLICY FREEZE BOUNDARY</strong>
        <span>EXACT DESCRIPTOR</span>
        <span>NO RE-OPTIMIZATION</span>
      </div>
      ${renderUnseen(model.unseen)}
    </section>`;
}

export async function loadReplay(fetchImpl = fetch) {
  const [developmentResponse, transferResponse] = await Promise.all([
    fetchImpl("/api/task-a", { cache: "no-store" }),
    fetchImpl("/api/task-b", { cache: "no-store" }),
  ]);
  if (!developmentResponse.ok) {
    throw new Error(`Development replay unavailable (${developmentResponse.status})`);
  }
  if (!transferResponse.ok) {
    throw new Error(`Transfer replay unavailable (${transferResponse.status})`);
  }
  return buildDemoModel(await developmentResponse.json(), await transferResponse.json());
}

const renderError = error => `
  <section class="error-state">
    <p class="mono-label">REPLAY UNAVAILABLE</p>
    <h1>The recorded experiment could not be loaded.</h1>
    <p>${escapeHtml(error.message)}</p>
    <code>AUTOBENCH_REPLAY=1 npm run experiment</code>
  </section>`;

async function bootstrap() {
  const root = document.querySelector("#demo-root");
  try {
    root.innerHTML = renderDemo(await loadReplay());
    document.body.dataset.state = "ready";
  } catch (error) {
    root.innerHTML = renderError(error);
    document.body.dataset.state = "error";
  }
}

if (typeof document !== "undefined") bootstrap();
