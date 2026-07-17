# Failure-Driven Research Agent R&D Loop — P0

## Goal

Make the existing AutoBench vertical slice visibly operate as an automated R&D loop for research agents:

```text
baseline research agent
→ analyze benchmark failures
→ identify a concrete failure mode
→ formulate a research-strategy hypothesis
→ apply a bounded policy intervention
→ run a controlled experiment
→ KEEP or REJECT from ground-truth performance
→ repeat when the hypothesis fails
→ freeze the learned policy
→ test that unchanged policy on an unseen task
```

P0 succeeds when one deterministic replay tells this story end to end: AutoBench diagnoses why direct search misses answers, rejects a plausible but unsuccessful broad-verification hypothesis, learns from that failed experiment, keeps a targeted-follow-up intervention that improves development F1, and transfers the frozen policy to an unseen same-family task for a qualitative sanity check.

The required product claim is:

> AutoBench diagnosed why a research agent was failing, tested research-strategy hypotheses against ground truth, kept what worked, and transferred the learned policy to an unseen task.

## Why This Matters

The product is not a benchmark loader, candidate ranker, or experiment database. Those mechanisms only make the R&D loop controlled and reproducible. The differentiated moment is that AutoBench uses observed failures to decide what research behavior to test next, treats rejected hypotheses as useful evidence, and produces a learned research policy rather than merely naming the highest row in a configuration table.

The repository already contains the first real phenomenon to preserve. With committed MediaWiki replay caches:

```text
Development task: Apollo crewed Moon landings

direct_search
F1 0.500
failure: four correct missions omitted

→ hypothesis: broaden discovery, then verify in one batch
→ broad_discovery_then_verify
F1 0.000, delta -0.500
REJECT
failure learned from experiment: discovered candidates are all rejected

→ hypothesis: verify each discovered candidate with a targeted follow-up
→ broad_discovery_with_targeted_followup
F1 0.727, delta +0.227 versus the incumbent baseline
KEEP

Unseen task: Apollo missions carrying the Lunar Roving Vehicle

direct_search F1 0.400
frozen learned policy F1 0.750
qualitative transfer delta +0.350
```

P0 should expose and automate this phenomenon before expanding the benchmark or generalizing the infrastructure.

## Current State

- The project is a dependency-free Node.js 20 vertical slice. `npm test`, the development replay, and the unseen-task replay pass without network or model access.
- `src/tasks.js` contains two fixed exhaustive-search tasks with exact mission-set ground truth:
  - `apollo_moon_landings` is the development task used for diagnosis and experimentation.
  - `apollo_lunar_roving_vehicle` is the unseen same-family transfer task.
- `src/policies.js` contains the full P0 bounded intervention catalog already needed for the observed loop:
  - `direct_search` is the baseline and initial incumbent.
  - `broad_discovery_then_verify` is the first intervention and currently produces a real rejected experiment.
  - `broad_discovery_with_targeted_followup` is the second intervention and currently produces a real kept experiment.
- `src/core.js` calculates precision, recall, F1, omissions, false positives, rejected unknowns, and query history. `AutoBenchOptimizer` now delegates diagnosis and hypothesis selection to a Scientist, keeps observation separate from incumbent state, records explicit scientific trials, and derives KEEP/REJECT solely from measured F1.
- `src/scientist.js` now provides the required deterministic two-entry failure-mode catalog plus the optional bounded LLM phrasing path with deterministic fallback. The optimizer uses the deterministic Scientist by default, so an API call remains optional.
- `src/cli.js` now exposes a small development-to-transfer boundary: it completes optimization, validates and freezes the returned `learnedPolicy` descriptor against the existing registry, and only then creates the unseen environment. The unseen path consumes that exact descriptor, including when the baseline is retained.
- One `npm run experiment` invocation now writes the unchanged development trace to `task-a.json` and an explicitly linked freeze boundary plus unseen comparison to `task-b.json`. No generic store or snapshot framework was added.
- The single-screen replay console now renders the committed causal trace in presentation order: baseline failure, red rejected hypothesis, revised observation, green kept hypothesis, exact frozen descriptor, no-reoptimization gate, and qualitative unseen comparison.
- `docs/EVALUATION.md`, the current-implementation note in `docs/ARCHITECTURE.md`, `TASKS.md`, and `README.md` now identify the failure-driven P0 loop and its narrow transfer claim. The older generic-platform material remains explicitly labeled historical context rather than being refactored during the demo milestone.

## Target State

`AUTOBENCH_REPLAY=1 npm run experiment` performs one bounded scientific run without network access or an API key:

1. Run `direct_search` on the development task and score it against fixed ground truth.
2. Analyze structured failures, not only the scalar score.
3. Ask a Scientist component for one diagnosis, mechanism-based hypothesis, and allowed intervention from the bounded catalog.
4. Run that intervention under the same task, search cache, and evaluator.
5. Record the before score, after score, delta, and a first-class `KEEP` or `REJECT` decision.
6. If rejected, retain the current incumbent, analyze the failed experiment for new information, and ask the Scientist for the next unused intervention.
7. On the first kept experiment, freeze that policy as `learnedPolicy`. If no intervention is kept, freeze the baseline and explain why.
8. Only after freezing, run the baseline and unchanged learned policy on the unseen task. The unseen result never feeds back into diagnosis, selection, or policy mutation.
9. Persist enough structured history to replay and explain the science, then render the loop in its causal order.

The expected P0 run contains two controlled experiments, not three pre-ranked candidates:

- Experiment 1 is motivated by baseline candidate omissions and is rejected by lower ground-truth F1.
- Experiment 2 is motivated by the rejected experiment's unknown-rejection pattern and is kept because it beats the current incumbent on ground-truth F1.

The run ends with one explicit frozen learned policy and one qualitative unseen-task comparison. Additional benchmark examples are optional follow-up work only after this loop is complete.

## Non-Goals

- A generic evaluation platform, configuration leaderboard, or exhaustive candidate search.
- Evaluating every policy up front and selecting the highest-scoring one without a causal diagnosis/hypothesis chain.
- Five-dimension quality scores that do not correspond to the exhaustive mission-retrieval task.
- Requiring an LLM or `OPENAI_API_KEY` for diagnosis, hypothesis generation, tests, replay, or the demo.
- Letting an LLM invent interventions, modify code, or escape the declared policy catalog.
- Expanding to a five-example benchmark before the existing two-task scientific loop works end to end.
- Claiming statistical significance, broad generalization, or cross-domain transfer from one unseen task.
- Migrating from Node.js, replacing the MediaWiki adapter, introducing a database, or building generalized runner/store/config class hierarchies.
- Natural-language answer synthesis, source-quality grading, user-defined evaluators, parallel execution, or advanced optimization algorithms.

## Design

### North Star loop and state transitions

The optimizer is an R&D-loop orchestrator, not a candidate ranker. It maintains four pieces of state:

- `incumbentPolicy`: the last policy accepted by ground-truth performance; initially `direct_search`.
- `observation`: the result whose failures should be diagnosed; initially the baseline, then the most recent experiment even if it was rejected.
- `history`: ordered scientific trials with diagnoses, hypotheses, interventions, results, and decisions.
- `unusedInterventions`: bounded catalog entries not yet tested in this run.

For each iteration:

```text
Scientist analyzes observation
→ proposes one unused bounded intervention
→ Environment evaluates it under controlled conditions
→ compare its F1 with incumbentPolicy F1
→ KEEP: replace incumbent and freeze for P0
→ REJECT: retain incumbent, make failed trial the next observation, repeat
```

This distinction matters after Experiment 1: the broad-verification policy is rejected and never becomes the incumbent, but its mass unknown-rejection pattern is valuable evidence for the next hypothesis. Experiment 2 is still adopted only if it beats the incumbent baseline.

P0 is deliberately bounded to at most two intervention experiments and freezes on the first `KEEP`. It also stops when there is no actionable diagnosis, no unused catalog intervention for that diagnosis, or an execution failure makes further scientific inference unsafe. This produces one visible repeat without turning the demo into open-ended autonomous search.

### Scientist component

`src/scientist.js` becomes the owner of scientific diagnosis and bounded hypothesis selection. `AutoBenchOptimizer` delegates those responsibilities instead of hard-coding them internally.

The required contract is conceptually:

```js
Scientist.propose({ observation, incumbent, history, availableInterventions })
  -> {
    source: "deterministic" | "llm" | "deterministic_fallback",
    diagnosis: {
      code: string,
      summary: string,
      evidence: object
    },
    hypothesis: {
      statement: string,
      expectedEffect: string
    },
    intervention: string
  } | null
```

The P0 default is a deterministic Scientist using an explicit failure-mode catalog. Preserve `LLMScientist` as an optional bounded proposal provider in the same module or behind the same contract. When enabled, it may phrase or choose among allowed catalog entries, but schema validation must reject invented interventions and deterministic fallback must preserve the offline path.

The deterministic catalog is:

| Observed failure mode | Evidence used | Research hypothesis | Bounded intervention |
|---|---|---|---|
| `candidate_omission_high` | Ground-truth omissions exist and the direct query returned too few valid missions | Separating broad candidate discovery from verification should recover omitted missions while verification protects precision | `broad_discovery_then_verify` |
| `unknown_rejection_high` | A broad experiment discovered candidates but placed them in `unknownRejected` instead of verifying them | Entity-level evidence is being lost in batch verification; a targeted query per candidate should recover valid missions while filtering invalid ones | `broad_discovery_with_targeted_followup` |

Diagnosis priority is contextual and deterministic:

1. If the observation contains rejected discovered candidates, diagnose `unknown_rejection_high`.
2. Otherwise, if it contains ground-truth omissions, diagnose `candidate_omission_high`.
3. Otherwise return no actionable hypothesis and stop.

The Scientist must cite concrete counts or identifiers from `failureAnalysis` in `diagnosis.evidence`; a label with no evidence is insufficient. Hypothesis text must state a mechanism and expected metric effect, not merely say that a policy name “improves F1.”

### Bounded interventions

Keep the three existing policies and their current behavior wherever possible. They are not peers to rank; they have roles in a sequential research program:

| Policy | Scientific role | Bounded behavior change |
|---|---|---|
| `direct_search` | Initial incumbent | One direct search query |
| `broad_discovery_then_verify` | Experiment for omission failure | Separate broad mission discovery from batch verification |
| `broad_discovery_with_targeted_followup` | Experiment for unknown-rejection failure | Verify each discovered mission with its own targeted follow-up |

No strict fourth policy or generic combinatorial search space is required for P0. Each intervention is tried at most once. The intervention catalog and policy registry must agree at startup; an unknown or duplicate intervention is a fatal declaration error.

### Controlled experiment and decision semantics

Every trial holds all variables constant except the selected policy intervention:

- same development task and ground truth
- same committed MediaWiki cache inputs
- same evaluator version and scoring logic
- same policy implementation for a named intervention
- no unseen-task result available to the Scientist or optimizer

Each persisted trial makes the scientific reasoning auditable:

```js
{
  iteration: 1,
  diagnosis: { code, summary, evidence },
  hypothesis: { statement, expectedEffect },
  intervention: "broad_discovery_then_verify",
  beforePolicy: "direct_search",
  beforeScore: 0.500,
  afterScore: 0.000,
  delta: -0.500,
  decision: "REJECT",
  decisionReason: "after F1 did not exceed incumbent F1",
  result: EnvironmentResult
}
```

Decision rules are intentionally simple:

- `KEEP` when the completed intervention's development F1 is strictly greater than the incumbent's development F1.
- `REJECT` when completed F1 is equal to or lower than the incumbent's F1.
- A failed experiment is visible as `status: "failed"`, has `afterScore: null` and `delta: null`, and is not silently scored as zero. It receives `decision: "REJECT"` with an execution-failure reason, then the run stops unless a clearly independent safe intervention remains.
- Precision, recall, query count, omissions, false positives, and rejected unknowns explain results but do not override the F1 decision.
- A rejected policy never becomes the incumbent. Its failure analysis may still motivate the next experiment.

The development run returns:

```js
{
  baseline: EnvironmentResult,
  trials: ScientificTrial[],
  learnedPolicy: {
    name: string,
    learnedFromIteration: number | null,
    status: "learned" | "baseline_retained"
  },
  stopReason: string
}
```

### Evaluator and failure analysis

Use only metrics that genuinely measure exhaustive mission retrieval:

- `precision = true positives / predictions`
- `recall = true positives / ground-truth missions`
- `f1` as the primary KEEP/REJECT metric
- exact `candidateOmission` identifiers
- exact `falsePositives` identifiers
- `unknownRejected` identifiers emitted by the policy
- query count and issued queries as behavioral diagnostics

Do not add nominal correctness, completeness, citation-support, source-quality, or instruction-following dimensions. The policies produce mission sets rather than synthesized research reports, so those dimensions would create false evaluator sophistication.

Version the task and evaluator lightly so the before/after comparison can be reproduced. Latency, backend, timestamp, and errors remain useful run metadata but are secondary to the causal experiment record. Update `docs/EVALUATION.md` during implementation so it no longer contradicts this P0 evaluator.

### Learned-policy freeze and unseen transfer

After a `KEEP`, serialize or otherwise snapshot the accepted policy identity and its bounded behavior fields as `learnedPolicy`. The unseen phase must receive that result programmatically; it must not hard-code `broad_discovery_with_targeted_followup`.

Transfer discipline:

1. Complete development diagnosis and all decisions.
2. Freeze `learnedPolicy`.
3. Load the unseen task only after the freeze boundary.
4. Run `direct_search` and the unchanged learned policy on the unseen task.
5. Report predictions, precision, recall, F1, omissions, and false positives.
6. Do not diagnose, propose, tune, KEEP, or REJECT using unseen results.

The expected replay comparison, `0.400 → 0.750`, is a phenomenon-preservation gate and a qualitative transfer sanity check. UI and documentation must not call it proof of generalization or statistical evidence. If no intervention is kept, transfer the retained baseline and clearly show that no learned policy change occurred.

### Minimal persistence

Persistence supports replay and explanation; it is not a P0 subsystem. Preserve the current JSON approach and avoid a generalized experiment store.

The implementation may keep `task-a.json` and `task-b.json` for UI compatibility or replace them with one latest-run artifact, whichever requires fewer changes. In either case, one `npm run experiment` invocation must connect them with a shared run identity and programmatic `learnedPolicy`, and the stored data must include:

- task/evaluator versions and timestamp
- baseline result and failure analysis
- ordered scientific trials
- for every trial: diagnosis, hypothesis, intervention, before score, after score, delta, decision, and reason
- frozen learned policy and stop reason
- unseen baseline and frozen-policy results
- structured execution errors

Do not let artifact schema work block the loop. Existing artifact routes may remain if they can represent the causal chain safely.

### UI priority

Adapt the existing one-screen replay into a causal R&D timeline. The primary visual sequence is:

```text
Baseline
→ Failure Diagnosis
→ Hypothesis
→ Experiment Result
→ REJECT
→ revised Failure Diagnosis
→ revised Hypothesis
→ Experiment Result
→ KEEP
→ Learned Policy
→ Unseen Task Result
```

Required visible details:

- Baseline predictions, F1, and the concrete omissions that triggered research.
- Diagnosis wording with evidence, such as “4 of 6 correct missions were omitted.”
- A mechanism-based hypothesis in plain language.
- The bounded policy intervention that tests the hypothesis.
- Before F1, after F1, signed delta, and prominent KEEP/REJECT badge.
- The rejected experiment remains visible rather than being hidden behind the winner.
- The frozen learned policy is explicitly named.
- The unseen baseline and frozen-policy result appear last, labeled “qualitative transfer sanity check.”

A generic experiment table, full queries, metadata, latency, config details, and persistence fields may appear below the primary timeline or behind disclosure controls. A dimension breakdown is omitted because the task has no legitimate dimension evaluator.

### Minimal module changes

| Existing module | P0 action |
|---|---|
| `src/tasks.js` | Keep both tasks; add only lightweight development/unseen and version metadata needed to enforce the freeze boundary. |
| `src/policies.js` | Preserve the three policies; optionally attach small serializable behavior descriptors so the learned policy can be frozen and shown. Do not add a fourth policy for candidate-count optics. |
| `src/search.js` | Keep MediaWiki and replay-cache behavior unchanged. |
| `src/scientist.js` | Make the Scientist contract first-class, add/retain deterministic catalog reasoning, and preserve the optional bounded LLM path with deterministic fallback. |
| `src/core.js` | Keep `Environment` evaluation and failure analysis; make `AutoBenchOptimizer` orchestrate the loop through a Scientist dependency, explicit trial records, incumbent state, and KEEP/REJECT transitions. |
| `src/cli.js` | Make one experiment command run development learning, freeze the returned policy, and then run the unseen comparison without hard-coding the winner. Keep legacy commands only when cheap. |
| `data/experiments/` | Retain inspectable JSON replay artifacts; extend only enough to store the causal scientific history and transfer linkage. |
| `src/server.js` | Preserve static serving and existing routes where possible. Change routes only if required by the chosen minimal artifact shape. |
| `public/` | Reorder and enrich the existing UI into the R&D timeline; do not build a generic dashboard. |
| `test/` | Extend the current small test suite around deterministic Scientist mappings, state transitions, phenomenon preservation, and unseen isolation. |
| `docs/EVALUATION.md`, `docs/ARCHITECTURE.md`, `TASKS.md`, `README.md` | Align P0 language with the failure-driven scientific loop after the implementation path is proven. |

### Error handling and bounded-stop behavior

- Invalid tasks, duplicate catalog interventions, or a Scientist proposal outside the policy registry fail before experiments run.
- Missing replay cache errors identify the policy and query and remain visible; tests never require live access.
- A malformed optional LLM response falls back to the deterministic Scientist and records the fallback source without changing the allowed intervention set.
- A policy execution failure is recorded as a failed trial, never converted to F1 zero, and cannot be kept.
- No actionable diagnosis, catalog exhaustion, repeated intervention, maximum two trials, first KEEP, or unrecoverable execution failure produces an explicit `stopReason`.
- Failure to run the unseen task does not revise the learned policy or development decisions; it makes the qualitative transfer result unavailable with a structured error.

## Milestones

### Milestone 1 — Prove and preserve the phenomenon

- [x] Treat the current committed-cache results as the P0 regression phenomenon: development baseline F1 `0.500`, broad batch-verification F1 `0.000`, targeted-follow-up F1 `0.727`, unseen baseline F1 `0.400`, and frozen targeted-follow-up F1 `0.750`.
- [x] Add a replay-backed regression test or deterministic fixture test that verifies the development sequence contains a real non-improving experiment followed by an improving experiment; do not hard-code a winning decision independently of measured scores.
- [x] Verify the first intervention's rejected result remains inspectable, including its omissions and `unknownRejected` evidence.
- [x] Verify the second intervention genuinely beats the incumbent under the same ground truth and evaluator.
- [x] Reconcile `docs/EVALUATION.md` with F1, precision, recall, and structured failure analysis before changing evaluator behavior.
- [x] Record any intentional cache, policy, task, or scoring change in this plan before accepting changed phenomenon numbers.

Exit criteria:

- Offline replay and tests reproduce one baseline, one evidence-backed REJECT, one evidence-backed KEEP, and the current unseen improvement without network access. Expanding the benchmark is not required.

### Milestone 2 — Automate diagnosis → hypothesis → experiment → KEEP/REJECT

- [x] Define the Scientist contract in `src/scientist.js` and implement the deterministic two-entry failure-mode catalog.
- [x] Preserve the optional bounded `LLMScientist` path behind the same output validation and deterministic fallback.
- [x] Move or delegate failure diagnosis and hypothesis selection from `AutoBenchOptimizer` to the Scientist component.
- [x] Replace generic hypotheses such as “policy improves F1” with mechanism-based statements and concrete diagnostic evidence.
- [x] Make `AutoBenchOptimizer` maintain incumbent, observation, history, unused interventions, and explicit stop reason.
- [x] Persist first-class trial fields: diagnosis, hypothesis, intervention, before policy/score, after score, delta, decision, decision reason, and result.
- [x] Implement strict score-driven state transitions: REJECT retains the incumbent and continues from the failed observation; KEEP replaces and freezes the incumbent.
- [x] Add tests for both catalog mappings, intervention allow-list validation, REJECT continuation, KEEP freeze, repeated-intervention prevention, no-actionable-failure stop, failed-trial handling, and deterministic fallback.

Exit criteria:

- One optimizer call explains why each experiment was selected, shows the measured REJECT/KEEP decision, and returns `broad_discovery_with_targeted_followup` as the learned policy only because its measured development F1 exceeds the incumbent.

### Milestone 3 — Freeze and test learned-policy transfer

- [x] Make `npm run experiment` execute the development R&D loop and consume its returned `learnedPolicy` for the unseen phase.
- [x] Remove the hard-coded learned policy from the unseen path.
- [x] Enforce that the unseen task is unavailable to the Scientist and optimizer until after the learned-policy freeze.
- [x] Run the unseen baseline and the exact frozen policy without further hypothesis generation or mutation.
- [x] Connect the development history and unseen comparison in the replay data with one run identity or an equally explicit linkage.
- [x] Add an integration test proving unseen ground truth cannot affect diagnosis, decisions, or the frozen policy.
- [x] Preserve the existing qualitative unseen phenomenon and label it accurately in artifacts and copy.

Exit criteria:

- A single offline command produces the complete scientific history, freezes the policy selected by development measurements, and then reports the unseen `0.400 → 0.750` comparison without hard-coded selection or test-set feedback.

### Milestone 4 — Make the R&D loop visually obvious

- [x] Rework the current UI hierarchy into the required Baseline → Diagnosis → Hypothesis → Experiment → Decision → Learned Policy → Unseen Result timeline.
- [x] Render concrete diagnostic evidence and mechanism-based hypothesis text, not only policy names.
- [x] Keep the real rejected experiment prominent and show before/after/delta beside each KEEP/REJECT decision.
- [x] Show the frozen learned policy as the output of development R&D, then place the qualitative unseen comparison after a visible freeze boundary.
- [x] Label the unseen result “qualitative transfer sanity check” and remove claims that imply demonstrated generalization.
- [x] Move generic tables, queries, metadata, and implementation details to a visually secondary position; omit invented evaluator dimensions.
- [x] Keep committed replay data as the demo fallback, update `README.md`, `docs/ARCHITECTURE.md`, `TASKS.md`, and this plan's discoveries/progress, then run the complete demo path once.

Exit criteria:

- In a three-minute demo, a new viewer can state the baseline failure, the first rejected hypothesis, what AutoBench learned from that rejection, why the second intervention was kept, which policy was frozen, and what happened on the unseen task.

## Validation

### Unit tests

- Precision, recall, F1, omissions, and false positives remain correct for exact mission sets.
- Scientist maps direct-search omissions to the broad-discovery hypothesis with concrete evidence.
- Scientist maps rejected unknowns to the targeted-follow-up hypothesis with concrete evidence.
- Scientist never returns an intervention outside the bounded policy registry and never repeats a tested intervention.
- Optional LLM absence, error, malformed output, or out-of-catalog output uses deterministic fallback.
- A lower or equal after-F1 produces `REJECT`, retains the incumbent, and records the signed delta.
- A higher after-F1 produces `KEEP`, replaces the incumbent, and freezes the learned policy.
- Failed experiments retain structured errors, null scores/delta, and cannot be kept.
- Stop reasons are explicit for first KEEP, no diagnosis, catalog exhaustion, repeat prevention, trial limit, and fatal execution failure.

### Integration and phenomenon tests

- Prove that the experimental trajectory is observation-dependent rather than a fixed policy sequence, using counterfactual branch tests: when the baseline has no omissions, the Scientist must not propose broad discovery; when the broad experiment has no `unknownRejected`, the Scientist must not automatically propose targeted follow-up; and when Experiment 1 unexpectedly improves on the incumbent, the loop must immediately `KEEP`, freeze that policy, and never run Experiment 2.
- Committed-cache replay reproduces `0.500 → 0.000 REJECT → 0.727 KEEP` on the development task.
- The second diagnosis is derived from the rejected experiment while the comparison incumbent remains `direct_search`.
- Trial records contain diagnosis, hypothesis, intervention, before score, after score, delta, decision, and decision reason.
- A single command passes the optimizer's returned learned policy into unseen evaluation rather than selecting by name in CLI code.
- The unseen task is not accessed until after development decisions and policy freeze.
- Committed-cache replay reproduces the qualitative `0.400 → 0.750` unseen comparison.
- Running without an API key or network produces the same policies, decisions, and deterministic scores.

### Manual three-minute demo

1. Run `AUTOBENCH_REPLAY=1 npm run experiment`.
2. Open `npm run demo` and identify the direct-search baseline and its four missed missions.
3. Follow the first diagnosis and broad-discovery hypothesis to the `-0.500 REJECT` result.
4. Show that AutoBench uses the rejected candidates to form the targeted-follow-up hypothesis.
5. Follow the second experiment to the `+0.227 KEEP` result and frozen policy.
6. Cross the visible freeze boundary and compare unseen-task F1 `0.400` with `0.750`.
7. State explicitly that the unseen result is a qualitative same-family transfer sanity check, not statistical evidence of generalization.

## Risks

- The existing first hypothesis fails dramatically. Hiding it would weaken the scientific story; changing policy behavior accidentally could also remove the real REJECT that makes the loop credible.
- The second intervention still produces false positives. The UI must show precision and false positives alongside improved F1 so the result remains defensible.
- Diagnosis rules can look like renamed policy routing if they omit evidence or mechanism. Every proposal must include observed failure data and a falsifiable expected effect.
- The optional LLM path can distract from the product if it becomes a requirement. The deterministic Scientist is the P0 scientific engine; the LLM is only an optional bounded proposer.
- One development and one unseen task are insufficient for statistical claims. Preserve the phenomenon and narrow claim before adding examples; do not let benchmark expansion block P0.
- Comparing interventions against inconsistent references would make deltas misleading. Every trial's `beforeScore` is the current incumbent's score, even when the most recent rejected trial supplies the next diagnosis.
- A hard-coded learned policy in the CLI would invalidate the transfer story. The unseen phase must consume the optimizer result.
- Broad infrastructure refactors could break the working replay path. Changes outside the listed modules require a plan update before implementation.

## Decisions

- 2026-07-16: Define AutoBench P0 as a failure-driven research-agent R&D loop, not a candidate configuration ranking system.
- 2026-07-16: Preserve the existing two-task replay phenomenon as the first completion gate; benchmark expansion is optional after the loop works.
- 2026-07-16: Treat the two existing non-baseline policies as sequential, diagnosis-motivated interventions rather than peers in a precomputed leaderboard.
- 2026-07-16: Make Scientist a first-class component with a deterministic required path and an optional bounded LLM path.
- 2026-07-16: Use exact-set F1 as the KEEP/REJECT metric; use precision, recall, omissions, false positives, rejected unknowns, and queries for diagnosis and explanation.
- 2026-07-16: Freeze on the first KEEP or after at most two interventions for the P0 demo.
- 2026-07-16: Compare every intervention with the current incumbent. A rejected experiment may supply the next diagnosis but never becomes the incumbent.
- 2026-07-16: Use the unseen task only after policy freeze and describe its result as a qualitative transfer sanity check.
- 2026-07-16: Preserve Node.js, MediaWiki replay caches, current policies, failure analysis, optimizer shell, JSON artifacts, and UI wherever possible.
- 2026-07-16: Lock phenomenon scores with replay-backed policy evaluations independent of optimizer routing, so later Scientist changes cannot mask a policy or cache regression.
- 2026-07-16: Let the optional LLM path rephrase only the single intervention already licensed by deterministic failure evidence; it cannot change the required observation-dependent trajectory or expand the catalog.
- 2026-07-16: Preserve current UI artifact compatibility by keeping `diagnosis` and `hypothesis` as display strings while recording their structure explicitly in `diagnosisSummary`, `diagnosticEvidence`, `expectedEffect`, and `observation`.
- 2026-07-16: Implement the development-to-unseen boundary in the existing CLI rather than adding a runner or store: optimizer output is validated against the policy registry, shallow-frozen as a serializable descriptor plus executable policy, and transferred by name and bounded behavior fields.
- 2026-07-16: Make unseen environment construction lazy and post-freeze. Transfer consumes `learnedPolicy.name`, never `selectedIntervention`, so a retained baseline is transferred without a fallback candidate.
- 2026-07-16: Keep `npm run generalize` only as a legacy alias for the same complete in-process development-and-transfer run. Reloading an old descriptor against potentially changed executable code would weaken the exact-freeze claim without a policy-versioning subsystem that P0 does not need.
- 2026-07-16: Treat unseen creation, baseline evaluation, and frozen-policy evaluation as transfer-only stages. A failure records structured stage/name/message data while preserving the completed development result and immutable freeze boundary; it never restarts optimization.
- 2026-07-16: Implement Milestone 4 entirely in the existing static frontend. The UI reads `task-a.json` and `task-b.json` through existing routes, builds a pure presentation model, and never duplicates evaluation, Scientist, optimizer, or transfer logic.
- 2026-07-16: Keep replay as the default demo mode. Optional regeneration uses the existing `AUTOBENCH_REPLAY=1 npm run experiment` command followed by a page refresh; no workflow-trigger endpoint or new backend service was added.
- 2026-07-16: Use a compact three-stage development row followed by the frozen-policy/unseen-transfer row so the complete causal story fits a 1440×900 projection frame while collapsing to a vertical flow on narrower screens.

## Discoveries

- The code already contains the desired scientific skeleton: baseline evaluation, structured failure analysis, deterministic diagnosis, bounded proposals, sequential trials, and KEEP/REJECT.
- The current test explicitly proves a rejected broad intervention followed by a kept targeted intervention; this is a more compelling demo story than evaluating and ranking extra candidates.
- The current development replay produces F1 `0.500`, `0.000`, and `0.727` in causal order. The rejected policy discovers candidates but rejects all of them, creating concrete evidence for targeted follow-up.
- The unseen replay produces F1 `0.400` for direct search and `0.750` for the exact optimizer-returned frozen policy; the Milestone 3 runtime boundary and Milestone 4 presentation-link validation both prevent independent UI selection.
- `src/scientist.js` is not dead weight: it already constrains proposals to the two real interventions and provides deterministic fallback. Its component boundary, not LLM dependence, is the part P0 should preserve and connect.
- The existing UI already renders baseline, trial decisions, and unseen results, so P0 needs a hierarchy and data-contract change rather than a new dashboard.
- The generic weighted evaluation specification does not fit a mission-set retrieval policy and should not drive P0 implementation.
- Milestone 1 required no changes to tasks, caches, policy behavior, normalization, or scoring. Independent replay tests reproduce all five expected F1 values and retain the broad experiment's 11 rejected candidates.
- The rejected broad experiment can safely become the next observation without becoming the incumbent: the real second trial records observation `broad_discovery_then_verify`, incumbent `direct_search`, and before score `0.500`.
- Counterfactual tests prove the trajectory is not `policy A → policy B → policy C`: no baseline omission stops immediately, no rejected unknowns prevents targeted follow-up, and an unexpectedly successful first intervention freezes immediately.
- The structured replay trace preserves the current UI's existing fields, so Milestone 2 required no UI changes.
- Independent review found and closed two fallback/error-shape gaps before acceptance: blank optional-LLM text now falls back deterministically, and failed experiments include an explicit `experiment_execution` stage.
- Final Milestones 1–2 validation passes 26 tests and the replay optimizer emits the exact measured `0.500 → 0.000 REJECT → 0.727 KEEP` trace with `first_improvement_kept` as its stop reason.
- Synthetic runtime tests prove that changing optimizer output from policy X to policy Y changes the unseen policy executed, while a baseline-retained result executes `direct_search` as both the comparison baseline and frozen transferred policy.
- Changing unseen ground truth changes unseen scores but leaves the real deterministic development diagnoses, `REJECT → KEEP` decisions, and learned descriptor byte-for-byte equivalent. The lazy factory is invoked only after development completes and descriptor validation succeeds.
- The combined committed-cache replay preserves the full development trace, freezes `broad_discovery_with_targeted_followup` from iteration 2, and then reproduces unseen F1 `0.400 → 0.750` with delta `+0.350`.
- Boundary review exposed malformed-descriptor and unseen-failure cases beyond the happy path. Registry identity, behavior fields, status, and learned iteration are now validated before unseen access; structured transfer failure tests prove development history and the frozen descriptor remain unchanged.
- The existing artifact schema already contained every field needed for the presentation. Milestone 4 required no core, policy, evaluator, workflow, server-route, or experiment-schema change.
- Focused presentation tests cover the committed causal trace, retained baseline, failed trial, failed transfer, frozen-policy linkage, and no-store replay loading. The complete suite now passes 46 tests.
- Headless browser inspection at 1600×1000 and 1440×900 confirmed that the real replay fits in one projection frame with distinct REJECT/KEEP treatments and an explicit no-reoptimization boundary. All five existing HTTP routes returned `200` with their expected content types.

## Progress

- [x] Re-reviewed architecture, evaluation, tasks, plan rules, implementation, tests, and replay artifacts.
- [x] Re-ran tests plus both committed-cache phenomena without network access.
- [x] Reframed the P0 execution plan around the automated R&D North Star.
- [x] Milestone 1 complete: evaluator specification aligned and offline phenomenon regression tests passing.
- [x] Milestone 2 complete: deterministic Scientist and observation-driven KEEP/REJECT loop implemented with counterfactual coverage.
- [x] Milestones 1–2 final validation complete: full test suite and replay-backed development optimization passing.
- [x] Milestone 3 complete: optimizer-returned policy freeze and unseen transfer boundary implemented, 40 tests passing, and the single-command replay reproducing the complete causal result.
- [x] Milestone 4 complete: replay-first scientific-trace console implemented, 46 tests passing, all demo routes healthy, and the full causal story verified at projection size.
