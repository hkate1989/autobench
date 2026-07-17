# Seven-Hour End-to-End P0

## Goal

Turn the existing Node.js vertical slice into one reproducible, demoable AutoBench loop without replacing its working architecture:

benchmark → baseline → 3 bounded candidate strategies → deterministic evaluation → winner selection → held-out sanity check → one-screen before/after report

The required command remains AUTOBENCH_REPLAY=1 npm run experiment. It must use committed MediaWiki caches, persist one complete experiment artifact, and give the UI everything needed to explain which search strategy won and why.

## Why This Matters

The current repository already proves most of the technical path: fixed Apollo tasks, cached Wikipedia search, a baseline, two interventions, deterministic F1 scoring, an optimizer, persisted JSON, and a replay UI. P0 should make that loop complete and reproducible, not turn it into a generalized research-agent framework. The visible product claim is automated strategy optimization against a fixed benchmark.

## Current State

- The repository is tracked on `main`. This plan currently has uncommitted documentation edits; implementation must preserve them and any later user changes.
- package.json defines a dependency-free Node.js 20 project. Existing tests and replay commands pass.
- src/tasks.js contains the two fixed Apollo tasks already used by the demo:
  - apollo_moon_landings is the development benchmark used for strategy selection.
  - apollo_lunar_roving_vehicle is the single held-out example.
- src/policies.js contains the direct-search baseline and two bounded candidate strategies.
- src/search.js already provides live MediaWiki search plus deterministic cache replay. Existing targeted-follow-up queries for both tasks are committed.
- src/core.js already owns policy evaluation, precision/recall/F1 calculation, failure analysis, and optimizer decisions.
- src/cli.js already runs and persists development and held-out experiments, but through separate commands and two special-purpose artifacts.
- public/ and src/server.js already render a one-screen replay, but the page does not show a serializable strategy configuration, all three candidates, exact config differences, reproducibility metadata, or structured evidence.
- src/scientist.js is optional and is not connected to the current optimizer.
- docs/EVALUATION.md still describes a generic five-dimension, 0–100 weighted evaluator and a +3-point threshold. That conflicts with this P0 plan's task-specific F1 evaluator and must be reconciled before evaluator implementation begins.

## Target State

One replay command evaluates the baseline and exactly three declared candidate strategies on the existing development task, selects the highest-scoring eligible candidate using deterministic task correctness, then evaluates the baseline and selected candidate on the existing held-out task. It writes a self-contained run artifact and a latest artifact consumed by the UI.

The run artifact records:

- benchmark and evaluator versions
- backend identifier for MediaWiki search
- model: null
- baseline and candidate strategy configs
- development predictions, evidence, primary score, diagnostic metrics, latency, cost, status, and errors
- winner eligibility, ranking, selection reason, and exact config diff
- held-out baseline and winner results

The UI presents the development result as benchmark-specific optimization. The one held-out example is explicitly a qualitative sanity check, not evidence of statistical or cross-domain generalization.

## Non-Goals

- Natural-language answer synthesis or a new answer-generation pipeline.
- A five-dimension weighted evaluator or an overall quality score unrelated to the existing task metric.
- New benchmark questions, additional cache collection, or a 5–20 item benchmark during this build.
- Migrating to Python, adding dependencies, or introducing ResearchAgent, Evaluator, ExperimentRunner, or ExperimentStore class hierarchies.
- General-purpose config generation, exhaustive grids, model-proposed candidates, or wiring LLMScientist into P0.
- Statistical significance or universal-agent-improvement claims.
- A generic dashboard, per-question navigation, cost accounting beyond the known zero-cost backend value, or database persistence.

## Design

### Fixed visible flow

1. Use apollo_moon_landings as the only development example.
2. Evaluate direct_search as the baseline.
3. Evaluate exactly three candidate strategies declared in source order.
4. Score every completed run with deterministic task-correctness F1.
5. Exclude any candidate with a failed development example from winner selection while retaining its full failed record.
6. Select the best eligible candidate and compare its development score with the baseline.
7. Only after selection, run the baseline and selected candidate on apollo_lunar_roving_vehicle.
8. Persist and render the complete before/after record.

### Evaluator

The P0 evaluator remains inside the existing Environment evaluation path in src/core.js. No evaluator class or weighted dimension framework is added.

Primary optimization metric:

- taskCorrectnessF1: the existing set-based F1 over predicted Apollo missions and fixed ground truth.

Useful diagnostics:

- precision: fraction of predicted missions that are correct.
- coverage: recall under a demo-friendly name; fraction of expected missions found.
- evidenceSupport: fraction of predictions with at least one structured evidence record that contains the prediction and satisfies the task verification rule.
- queryCount, latencyMs, and estimatedCost.

There is no synthesized answer, no nominal correctness/completeness/citation/source/instruction score set, and no weighted overall score. docs/EVALUATION.md is the source of truth for these P0 semantics.

### Strategy set and configuration

Keep the existing policy objects. Add a small serializable config field to each policy rather than creating a separate AgentConfig subsystem. The bounded strategy set is:

| Role | Strategy | Existing work |
|---|---|---|
| Baseline | direct_search | Reuse unchanged behavior |
| Candidate 1 | broad_discovery_then_verify | Reuse existing behavior |
| Candidate 2 | broad_discovery_with_targeted_followup | Reuse existing behavior |
| Candidate 3 | broad_discovery_with_strict_targeted_followup | Add one stricter verification variant that reuses Candidate 2 queries and committed caches |

Each config exposes only behavior needed for the demo. The exact four immutable config snapshots are the P0 search space; there is no generic combinatorial generator:

| Strategy | queryBudget | discoveryMode | followUpMode | evidenceRule |
|---|---:|---|---|---|
| direct_search | 1 | direct | none | query-result mentions |
| broad_discovery_then_verify | 2 | broad | batch | candidate and verification signal within the batch evidence window |
| broad_discovery_with_targeted_followup | 20 | broad | per-candidate | candidate page exists and verification signal appears anywhere in that candidate query's results |
| broad_discovery_with_strict_targeted_followup | 20 | broad | per-candidate | one result contains both candidate identity and verification signal |

`queryBudget` is a hard upper bound, not a promise that every run issues that many queries. Config validation rejects duplicate strategy names, unknown fields, and runtime behavior that is not represented by one of these declared snapshots.

The strict third candidate is deliberately one intervention away from Candidate 2: it requires the candidate identity and task verification signal to occur in the same search result. It may win or lose based on the deterministic evaluator; the winner is never hard-coded.

### Minimal module changes

| Existing module | P0 action |
|---|---|
| src/tasks.js | Minimally add benchmark version, explicit development/held-out labels, evaluator version, and lightweight startup validation around the two existing tasks. Do not move tasks to JSON or add more examples. |
| src/policies.js | Preserve all current policy logic; attach serializable configs, expose the search snippets already used as structured evidence, and add only the strict third candidate. |
| src/search.js | Keep unchanged unless a tiny read-only result-normalization helper is needed. Preserve cache keys, replay behavior, and live fallback. |
| src/core.js | Extend Environment.evaluate records with evidence diagnostics, metadata, latency/status/errors, and candidate eligibility. Change AutoBenchOptimizer to evaluate all three candidates and rank eligible results instead of stopping at the first KEEP. |
| src/cli.js | Make experiment orchestrate development optimization and the post-selection held-out sanity check in one command; persist one homogeneous run artifact plus latest.json. Retain existing commands when cheap for compatibility. |
| src/server.js | Replace the two experiment API routes with one latest-run route while leaving static serving intact. |
| public/app.js and public/index.html | Adapt the existing one-screen UI to the P0 priority order; do not build new screens or client state. |
| public/styles.css | Reuse existing styling and add only styles required by the new cards/table/diff. |
| src/scientist.js | Leave unchanged and unused. |
| test/core.test.js | Extend the current tests rather than replacing the test setup; add another test file only if it materially improves readability. |

No new runtime abstraction is planned. A tiny helper module is allowed only if implementation shows that keeping artifact validation or persistence in cli.js makes it untestable.

### Structured policy result

Preserve predictions as the output being optimized. Extend the existing policy result only with evidence:

- predictions: unique mission identifiers
- evidence: records containing prediction, query, result title, and snippet
- unknowns: rejected candidate identifiers
- queries: issued query strings

Evidence is inspectable evaluator input, not a generated prose answer.

The evaluator derives `evidenceSupport` only from these records. A prediction is supported when at least one evidence record has the same normalized prediction identifier and its individual `title + snippet` satisfies that strategy's declared evidence rule. Concatenating unrelated results must not create support. Empty predictions produce evidence support `0`, not `1` or an undefined value.

### Runtime contracts

Implementation may keep these as plain validated objects; the names below define the serialized contract rather than requiring new classes:

```js
Policy.run(task, search) -> Promise<{
  predictions: string[],
  evidence: { prediction: string, query: string, title: string, snippet: string }[],
  unknowns: string[],
  queries: string[]
}>

Environment.evaluate(policy) -> Promise<ExperimentRecord>

AutoBenchOptimizer.optimize() -> Promise<{
  baseline: ExperimentRecord,
  candidates: ExperimentRecord[],
  selection: SelectionRecord
}>
```

`Environment.evaluate` catches policy/search execution errors and returns a failed experiment record. Declaration/validation errors remain fatal startup errors because running an invalid benchmark or search space would make the comparison untrustworthy.

### Experiment artifact

The top-level artifact contains:

- runId and createdAt
- benchmarkVersion and evaluatorVersion
- backend: wikipedia-mediawiki
- model: null
- promptVersion: null
- status and errors
- declared baseline and three candidate configs
- development baseline and candidate experiment records
- selected strategy, selection reason, score delta, and config diff
- heldOutSanityCheck with baseline and selected-strategy records

Each experiment record retains the current predictions, failure analysis, and queries while adding config, evidence, metrics, latencyMs, estimatedCost: 0, status, errors, and eligibleForSelection.

Canonical status values are `completed`, `failed`, and, at the top-level only, `completed_with_errors`. Canonical structured errors contain `stage`, `name`, and `message`; stack traces are not persisted or rendered. A completed record has numeric metrics and no errors. A failed record has `metrics: null`, retains any partial queries/evidence that are safely available, has at least one error, and is never eligible for selection.

Write a timestamped run file first, then atomically replace data/experiments/latest.json for the UI so the server cannot observe a partial JSON document. JSON remains sufficient; no database or generalized store is introduced. Search caches are immutable run inputs, not embedded copies; deterministic scores are reproducible while timestamps and measured latency may vary.

### Winner selection and failures

- Evaluate the baseline and all three candidates on identical development inputs with the same evaluator version.
- A candidate is eligible only when every development example completed successfully. In this P0 there is one development example, so any failure makes it ineligible.
- Failed examples receive status and structured errors, not a synthetic zero score.
- Failed experiments remain in the persisted candidate list and UI table with eligibleForSelection: false.
- Rank eligible candidates by taskCorrectnessF1, then evidenceSupport, then coverage, then lower query count, then stable declared order.
- Report a strategy as improved only when its development taskCorrectnessF1 is strictly greater than the baseline. Otherwise label it best observed candidate and do not claim improvement.
- The selected strategy is the highest-ranked eligible candidate even when it does not beat the baseline; `selection.outcome` distinguishes `improved`, `best_observed_no_improvement`, and `baseline_retained_no_eligible_candidate`. The baseline is used for the held-out comparison only in the last case.
- Held-out results never affect selection.

### Held-out interpretation

The single apollo_lunar_roving_vehicle comparison is an inspectable qualitative sanity check. The UI shows baseline and winner predictions, omissions, false positives, and evidence so viewers can see what changed. It must not use language such as generalizes, statistically significant, or universally better.

### Error handling

- Invalid benchmark metadata or duplicate/malformed configs fail before the loop starts.
- Policy/search failures become structured experiment errors with stage, error type, and message.
- Missing replay caches name the strategy and query.
- The optimizer continues evaluating later candidates after one candidate fails.
- If every candidate is ineligible, the baseline remains selected and the artifact/UI explain why.
- A held-out failure does not revise the development winner; it produces a failed held-out record and a top-level `completed_with_errors` status.
- Persistence failure is fatal and must not replace an existing valid latest.json.
- Tests use fake search results or committed replay caches and never require network or model access.

## Milestones

### Milestone 1 — Freeze benchmark, configs, and structured evidence

- [ ] Reconcile docs/EVALUATION.md with the P0 task-specific F1 metric, diagnostic definitions, strict failure eligibility, tie-breakers, outcome labels, and held-out sanity-check wording before evaluator code changes.
- [ ] Add benchmarkVersion, evaluatorVersion, and explicit development/held-out metadata to the two tasks in src/tasks.js.
- [ ] Add lightweight validation for the fixed task and strategy declarations.
- [ ] Attach serializable config snapshots to the baseline and existing candidates.
- [ ] Add broad_discovery_with_strict_targeted_followup as the third candidate using existing targeted queries and caches.
- [ ] Return structured evidence from policies without creating natural-language answers.
- [ ] Extend tests for fixed split metadata, config serialization, exactly three candidate configs, and evidence shape.

Exit criteria:

- Replay mode can execute the baseline and three declared candidates on Task A using existing caches, and every successful result contains predictions plus inspectable evidence.

### Milestone 2 — Deterministic scoring, failure eligibility, and ranking

- [ ] Extend Environment.evaluate with taskCorrectnessF1, precision, coverage, evidenceSupport, latency, status, errors, backend, and model metadata.
- [ ] Preserve failed results without assigning synthetic quality scores.
- [ ] Change AutoBenchOptimizer to evaluate all three candidates and exclude any failed candidate from selection.
- [ ] Implement deterministic ranking and exact baseline-to-winner config diff.
- [ ] Add tests for metric calculation, evidence support, all-candidate evaluation, deterministic tie-breaking, failed-candidate exclusion, and no-improvement behavior.

Exit criteria:

- One optimizer call returns the baseline, three visible candidate records, and a winner derived only from eligible development results.

### Milestone 3 — One command, one artifact, held-out sanity check

- [ ] Make npm run experiment run Task A optimization followed by Task B baseline-versus-winner evaluation.
- [ ] Ensure Task B is never read by the optimizer or used in winner selection.
- [ ] Persist the complete reproducibility fields and all failures in a timestamped JSON artifact and data/experiments/latest.json.
- [ ] Make latest.json replacement atomic and preserve the previous valid latest artifact if serialization or persistence fails.
- [ ] Keep backend set to wikipedia-mediawiki and model set to null throughout the artifact.
- [ ] Add one mocked or replay-backed end-to-end test covering baseline, three candidates, winner selection, held-out ordering, and artifact reload.

Exit criteria:

- AUTOBENCH_REPLAY=1 npm run experiment completes without network or API keys and produces one inspectable artifact for the exact P0 flow.

### Milestone 4 — Priority-ordered one-screen report and demo hardening

- [ ] Point the existing server and UI at latest.json.
- [ ] Show the baseline development score first.
- [ ] Show all three candidate scores/statuses, including ineligible failures.
- [ ] Show the winning strategy and exact configuration diff.
- [ ] Show the held-out baseline-versus-winner structured predictions, omissions, false positives, and evidence as the inspectable example of what improved.
- [ ] Keep metadata and secondary diagnostics available but visually subordinate.
- [ ] Commit one known-good replay artifact, update README.md and TASKS.md, and record implementation discoveries/progress here.
- [ ] Run all tests, the clean replay command, and a manual UI smoke check.

Exit criteria:

- In under 30 seconds, a viewer can identify the baseline score, compare three candidates, see the winning strategy/config change, and inspect the held-out before/after result without mistaking it for statistical generalization.

## Validation

### Automated

- Existing tests continue to pass.
- Task metadata validation rejects invalid splits or duplicate strategy names.
- All four configs round-trip through JSON.
- Deterministic scoring reproduces precision, coverage, F1, and evidence support from stored outputs.
- A failed candidate remains visible and cannot win even if other recorded fields are favorable.
- The optimizer evaluates exactly three candidates and selects via the documented ordering.
- Candidate order changes do not change ties except for the explicitly persisted declared-order index.
- Failed runs have null quality metrics and structured errors; no display or aggregation path coerces them to zero.
- A replay-backed or mocked full loop proves held-out execution happens only after development selection.
- A held-out failure leaves development selection unchanged and marks the overall artifact completed_with_errors.
- The persisted artifact reloads and contains backend: wikipedia-mediawiki and model: null.
- A simulated write failure leaves the previous latest.json readable.
- The server returns the latest artifact and static UI.

### Manual demo

1. Run npm test.
2. Run AUTOBENCH_REPLAY=1 npm run experiment.
3. Inspect data/experiments/latest.json for the baseline, three candidates, winner/config diff, failures, and held-out block.
4. Run npm run demo and verify the UI follows the required priority order.
5. Inspect the held-out predictions and evidence and confirm the copy calls it a qualitative sanity check.
6. Confirm no API key or network access is required.

## Risks

- The third strict candidate may score worse than Candidate 2; this is acceptable and can make the experiment history more credible. It must not be manually favored.
- Existing snippets can support a mission only indirectly. Evidence-support rules must remain deterministic and conservative, and the UI should show the underlying snippet.
- One development example is highly prone to overfitting. The product claim must stay limited to automated improvement on this fixed benchmark.
- One held-out example can reveal an obvious regression but cannot establish generalization.
- Measured latency varies and must not outrank task correctness.
- Broad refactoring would consume the build window and risk breaking the cached demo path; deviations from the listed module changes require a plan update first.

## Decisions

- 2026-07-16: Keep the existing Node modules and policy-oriented architecture; no Python migration or framework layer.
- 2026-07-16: Keep the current two Apollo tasks. Task A is development; Task B is one qualitative held-out sanity check.
- 2026-07-16: Optimize the existing set-based F1. Precision, coverage, and evidence support are diagnostics, not nominal weighted dimensions.
- 2026-07-16: Preserve structured predictions and expose source snippets as evidence; do not synthesize natural-language answers.
- 2026-07-16: Represent the external system as backend: wikipedia-mediawiki and model: null.
- 2026-07-16: Use the three explicit candidate strategies as the entire P0 search space and add only one new strict verification variant.
- 2026-07-16: Make any development failure disqualifying while preserving the failed record for the report.
- 2026-07-16: Keep LLMScientist out of P0.

## Discoveries

- The repository is tracked and the working tree was clean when this revision began; the previous untracked-files discovery was stale and has been removed.
- The evaluation specification has not yet been narrowed: its current five-dimension weighted objective conflicts with this plan and is now an explicit Milestone 1 documentation gate.
- Existing tests, replay validation, optimization, and held-out commands pass.
- Current Task A replay improves F1 from 0.500 to 0.727 with targeted follow-up; Task B moves from 0.400 to 0.750, but Task B is only a qualitative sanity check.
- The current optimizer stops after the first KEEP and therefore does not yet expose three comparable candidate experiments.
- The proposed strict third candidate can reuse the existing targeted-follow-up queries and committed cache files, avoiding new network-dependent fixture work.
- LLMScientist exists but is unused by the optimizer and is unnecessary for the visible P0 loop.

## Progress

- [x] Repository and referenced documentation inspected; current commands validated.
- [x] Seven-hour P0 scope revised around the existing vertical slice.
- [ ] P0 evaluation specification alignment not started.
- [ ] Milestone 1 implementation not started.
- [ ] Milestone 2 implementation not started.
- [ ] Milestone 3 implementation not started.
- [ ] Milestone 4 implementation not started.
