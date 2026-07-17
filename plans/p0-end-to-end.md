# Smallest End-to-End P0

## Goal

Deliver one reproducible AutoBench command and one replayable UI that load a fixed versioned research benchmark, evaluate a baseline and a small declared set of candidate configurations on the development split, select the winner by the documented quality metric, compare baseline and winner once on a held-out split, persist the complete experiment history, and show the before/after result with one inspectable answer comparison.

## Why This Matters

The repository already demonstrates that a targeted Wikipedia search policy can improve Apollo-list F1, but it cannot yet support the product claim in `AGENTS.md`: the benchmark, configuration, evaluator, experiment record, selection rule, and UI are not connected through one reproducible P0 loop. This plan closes only those gaps needed for a defensible three-minute demo and retains cached replay so the demo survives network or model failure.

## Current State

- The project is dependency-free Node.js 20 with commands in `package.json`; `npm test`, replay validation, optimization, and generalization currently pass.
- `src/tasks.js` hard-codes two Apollo tasks and their ground truth. One acts as the optimization task and one as an unseen same-family task, but there is no benchmark loader, schema validation, benchmark version, rubric, or explicit split field.
- `src/policies.js` contains three named policy objects. They are useful bounded candidates, but there is no serializable `AgentConfig`, explicit search-space declaration, prompt version, model identifier, or proof that mutations are constrained to declared values.
- `src/search.js` provides real MediaWiki search with committed JSON caches and replay mode. It should remain the external research adapter and deterministic fallback path.
- `src/core.js` combines agent execution, exact-set F1 evaluation, failure diagnosis, and optimization. Results omit answer text, evidence/source records, timestamps, latency, cost, status, and structured errors.
- `src/scientist.js` can propose only two interventions, but it is not wired into the optimizer. It is optional and unnecessary for P0.
- `src/cli.js` uses separate `experiment` and `generalize` commands and overwrites two special-purpose JSON files. There is no single full-loop command or reloadable collection of homogeneous experiment records.
- `public/` replays those two files and shows F1 cards. It does not show a declared config, experiment history table, overall score/delta, dimension breakdown, exact config diff, or baseline-versus-winner answer.
- `test/core.test.js` covers only F1/error analysis and a two-step optimizer path. The minimum tests required by `AGENTS.md` are otherwise absent.
- `TASKS.md` has no completed P0 boxes even though parts of the current slice are reusable.

## Target State

`AUTOBENCH_REPLAY=1 npm run experiment` runs the complete offline P0 flow against committed search caches and writes one self-contained run artifact. The artifact contains a baseline development experiment, at least three candidate development experiments evaluated on identical examples and evaluator version, the selected configuration, and a held-out baseline/winner comparison. Each experiment records config, benchmark/model/prompt/evaluator versions, timestamp, aggregate and per-example dimension scores, answer/evidence/sources, latency, estimated cost when known, status, and structured errors. `npm run demo` loads the latest artifact and makes the benchmark-specific improvement legible on one screen. Live MediaWiki access remains an opt-in cache-filling path, not a requirement for tests or the demo.

The smallest benchmark is five Apollo research questions in one versioned JSON file: four development examples and one held-out example. This is enough to exercise aggregation and prevent direct optimization on the held-out answer while staying within the 5–20 example guidance. The product claim remains explicitly limited to this benchmark and task family.

## Non-Goals

- Migrating the working Node implementation to Python or introducing a framework.
- Calling an LLM in the required path; `LLMScientist` remains optional and out of the P0 loop.
- General-purpose benchmark authoring, evaluator plugins, databases, authentication, background workers, or parallel execution.
- Statistical significance, cross-domain generalization, sophisticated optimization, or automatic code/prompt generation.
- Arbitrary configurations beyond the declared curated search space.
- Live fetching during unit or integration tests.

## Design

### Data flow and module boundaries

1. Add `data/benchmarks/apollo-v1.json` containing benchmark metadata and five validated examples with `id`, `question`, `rubric`, `split`, task-specific search inputs, and expected facts.
2. Add `src/benchmark.js` to load and validate the JSON and return immutable `development` and `test` example lists plus `benchmarkVersion`. Invalid IDs, splits, rubrics, expected facts, or search fields fail before a run begins.
3. Add `src/config.js` with a serializable baseline `AgentConfig`, three curated candidate configs, and an explicit `SEARCH_SPACE`. Keep the useful current strategies as config-selected behavior: direct search, broad discovery/verification, and targeted follow-up. Reject undeclared fields and values.
4. Refactor policy execution behind `ResearchAgent.run(example, config)` in `src/agent.js`. Reuse `WikipediaSearch`; return an `AgentResult` containing synthesized answer text, predictions, cited evidence, normalized source records, query metadata, latency, estimated cost (`0` for MediaWiki-only runs), and structured errors. Keep prompt/strategy version constants named and persisted.
5. Add `src/evaluator.js` with evaluator version `apollo-deterministic-v1`. Compute the five dimensions required by `docs/EVALUATION.md` on a 0–100 scale and the fixed 35/25/20/10/10 weighted overall score. For this narrow factual-list benchmark, correctness/completeness derive from expected-fact precision/recall, citation support from claim-to-evidence coverage, source quality from successful MediaWiki source records and diversity, and instruction following from required answer/citation structure. Store strengths, weaknesses, and critical errors. Keep this deterministic and document that it is benchmark-specific, avoiding a fake claim of general semantic evaluation.
6. Split orchestration into `src/experiments.js` and `src/optimizer.js`. The runner evaluates one config over an explicit split, records failures rather than silently scoring them as ordinary zeros, aggregates mean/median/minimum overall, dimension means, failure rate, mean latency, and estimated cost, then persists through `src/store.js`. The optimizer evaluates the baseline and every curated candidate on the same development examples, ranks by mean overall, failure rate, latency, then cost, and labels a winner `meaningfully_improved` only at a +3 point delta. It evaluates only the selected config and baseline on the held-out split after selection.
7. Make `src/cli.js experiment` the single orchestration entry point and write `data/experiments/<run-id>.json` plus a small deterministic `data/experiments/latest.json` pointer/copy for the UI. Preserve a separate cache-fill/validation command if useful, but remove the need to manually chain `experiment` and `generalize` for the demo.
8. Update `src/server.js` and `public/` to render the latest complete artifact: baseline/best/test delta summary, development experiment table, winning config and diff, dimension deltas, failures, and one baseline/winner held-out answer with citations. The page must visibly label development selection versus held-out reporting and say “best observed candidate” when the +3 threshold is not met.

### Important interfaces

```js
loadBenchmark(file) -> {
  version,
  development: BenchmarkExample[],
  test: BenchmarkExample[]
}

ResearchAgent.run(example, config) -> Promise<AgentResult>

Evaluator.evaluate(example, agentResult) -> EvaluationResult

ExperimentRunner.run({ config, benchmarkVersion, split, examples })
  -> Promise<ExperimentResult>

Optimizer.optimize({ baselineConfig, candidateConfigs, development, test })
  -> Promise<OptimizationRun>

ExperimentStore.save(run) -> Promise<string>
ExperimentStore.loadLatest() -> Promise<OptimizationRun>
```

Use plain objects plus explicit validation functions rather than adding a schema dependency. Public functions receive and return documented serializable shapes.

### State and persistence

The top-level run artifact contains `runId`, `createdAt`, benchmark/evaluator versions, run status/errors, declared search space, development experiment IDs, selection decision/reason, and held-out comparison IDs. Each nested experiment contains the minimum reproducibility fields mandated by `AGENTS.md`, aggregate metrics, and per-example agent/evaluation records. JSON is sufficient for P0 and keeps cached fallback data inspectable and committable.

Search-cache files remain separate immutable inputs. Replaying the same cache and code versions must reproduce scores; timestamps and measured latency may differ and are not ranking-stability assertions.

### Error handling

- Benchmark/config schema errors abort before any experiments are written.
- A recoverable search/agent failure produces a failed per-example record with stage, error type, and message; aggregation reports failure rate and excludes missing quality scores from quality means while preventing a failed candidate from winning a complete candidate through the failure-rate tie-break/eligibility rule.
- A whole experiment is `completed`, `completed_with_errors`, or `failed`; partial results remain visible.
- Missing replay cache errors identify the example and query. Unit tests never make network calls.
- Persistence uses a temporary file followed by rename so the UI does not read a partially written latest artifact.

## Milestones

### Milestone 1 — Versioned benchmark, config, and research result

- [ ] Add the five-example Apollo v1 benchmark with four development and one held-out example, rubrics, expected facts, and search inputs.
- [ ] Implement benchmark loading/validation and split access in `src/benchmark.js`.
- [ ] Define the baseline, three curated candidates, allowed config values, model identifier (`mediawiki-search`), and named strategy/prompt versions in `src/config.js`.
- [ ] Implement `ResearchAgent` around the existing cached Wikipedia adapter and policy behavior, returning answer, citations/evidence, sources, queries, latency, cost, and errors.
- [ ] Add tests for valid/malformed benchmark loading, split isolation, config serialization/validation, agent result shape, and replay-cache failure visibility.

Exit criteria:
- One development example runs from a typed-by-contract config entirely in replay mode, and its complete serializable `AgentResult` includes inspectable evidence and reproducibility identifiers.

### Milestone 2 — Deterministic evaluation and experiment persistence

- [ ] Implement the versioned five-dimension deterministic evaluator and exact weighted overall score.
- [ ] Implement aggregate metrics, explicitly handling failed examples.
- [ ] Implement `ExperimentRunner` with progress logging and homogeneous experiment records.
- [ ] Implement atomic JSON `ExperimentStore` save/load-latest behavior.
- [ ] Add evaluator weighting/aggregation boundary tests, deterministic stored-output rescoring, failure-record tests, and experiment persistence round-trip tests.

Exit criteria:
- The baseline runs across all development examples, saves a reloadable experiment, and every example exposes answer/evidence plus dimension-level and overall scores; malformed inputs and failures remain visible.

### Milestone 3 — Bounded optimization and held-out comparison

- [ ] Implement candidate generation solely from the declared curated search space, excluding duplicate baseline configs.
- [ ] Evaluate baseline and at least three candidates on the identical development example IDs with the identical evaluator version.
- [ ] Rank by documented primary score and tie-breakers, save the selection reason/config, and apply the +3 meaningful-improvement label.
- [ ] After selection, run baseline and the selected config once on the held-out split without using held-out scores for selection.
- [ ] Wire the full flow to `npm run experiment` and produce a single latest optimization artifact.
- [ ] Add optimizer selection/tie-break/threshold tests and one fully mocked or replay-backed end-to-end optimization test that asserts split isolation and persisted history.

Exit criteria:
- `AUTOBENCH_REPLAY=1 npm run experiment` produces baseline + three candidates + winner + held-out comparison in one inspectable artifact, with no live network or API key and no hard-coded winning selection.

### Milestone 4 — One-screen report and demo hardening

- [ ] Serve the latest complete optimization artifact rather than the two legacy special-case files.
- [ ] Render baseline and best development scores, absolute delta and threshold label, experiment table, exact winning config/diff, dimension deltas, and statuses/errors.
- [ ] Render one held-out baseline-versus-winner answer comparison with evidence/citations and clearly label it as held-out reporting.
- [ ] Commit one known-good replay artifact and all required search caches as the API-failure fallback.
- [ ] Update `README.md`, `docs/EVALUATION.md` where the benchmark-specific deterministic rubric needs clarification, and check completed P0 items in `TASKS.md` only after their exit criteria pass.
- [ ] Run the clean replay optimization path, all tests, and the UI smoke test; record decisions/discoveries/progress in this plan.

Exit criteria:
- A new viewer can understand the baseline, multiple candidate experiments, selected config, benchmark-specific score change, dimension reasons, and a qualitative held-out comparison in under 30 seconds; the same page loads from committed cached output if external services fail.

## Validation

### Unit tests

- Benchmark loading accepts Apollo v1, rejects malformed records, and never mixes development/test examples.
- Configs round-trip through JSON and reject unknown keys or values outside `SEARCH_SPACE`.
- Agent replay returns answer, sources/evidence, latency/cost, and structured failures.
- Evaluator dimension weights produce the documented overall score and identical stored outputs rescore identically.
- Aggregation reports mean/median/minimum, dimension means, failure rate, latency, and cost correctly, including all-failed input.
- Store round-trips a complete experiment and does not expose partial writes.
- Optimizer candidate generation is bounded, ranking uses the documented tie-breakers, and +3 labeling is correct.

### Integration tests

- A fake search adapter drives one config through agent, evaluator, runner, and store without network access.
- A mocked/replay-backed full optimization asserts identical development IDs/evaluator versions for baseline and candidates, no held-out evaluation before selection, at least three recorded candidates, and a selected config derived from ranking.
- The server returns the latest valid artifact and static report assets.

### Manual demo steps

1. Run `npm test`.
2. Run `AUTOBENCH_REPLAY=1 npm run experiment` from a clean checkout and inspect `data/experiments/latest.json` for all required metadata and visible errors.
3. Run `npm run demo`, open the one-screen report, and verify the score summary, experiment table, config diff, dimension breakdown, and held-out answer comparison.
4. Temporarily run with live access unavailable and confirm both experiment replay and the committed fallback report still work.
5. Confirm the UI language does not claim universal improvement and uses “best observed candidate” if the development delta is below three points.

## Risks

- The existing committed caches cover only two task queries; three new development examples will require carefully chosen Apollo questions and new cache fixtures before offline P0 can pass.
- A deterministic evaluator can be gamed if dimensions merely duplicate exact-set F1. The dimension rules must be explicit and backed by evidence/source structure, while the UI must label the evaluator benchmark-specific.
- With only four development examples and one held-out example, results are illustrative rather than statistically strong. The claim must remain scoped to Apollo v1.
- Targeted follow-up currently admits false positives because snippets can mention verification phrases out of context. Evidence must be tied to each predicted claim or the citation-support metric will be misleading.
- Measured latency varies between runs. Ranking stability should rely on quality/failure differences first; latency is only a tie-breaker.
- Rewriting the working slice wholesale would jeopardize the demo. Each milestone must preserve replay tests and keep `npm run demo` runnable with the last known-good artifact.

## Decisions

- 2026-07-16: Keep Node.js and the existing MediaWiki/cache adapter. The preferred Python layout is advisory, while an incremental Node path is smaller and already runnable.
- 2026-07-16: Use a five-example Apollo v1 benchmark split 4/1. This is the minimum recommended benchmark size and establishes held-out discipline without expanding domains.
- 2026-07-16: Use a deterministic benchmark-specific evaluator rather than an LLM evaluator in P0. It makes replay and tests independent of API access while retaining the documented five dimensions.
- 2026-07-16: Use baseline plus three curated configs from an explicit search space. This satisfies the visible multiple-experiment requirement without a combinatorial grid.
- 2026-07-16: Persist JSON artifacts and a latest artifact for the UI. SQLite and generalized history querying are unnecessary for the demo.
- 2026-07-16: Keep `LLMScientist` outside the required P0 path. Model-proposed candidates are P1 and would weaken deterministic fallback.

## Discoveries

- The repository already has a coherent, dependency-free JavaScript vertical slice despite `AGENTS.md` suggesting typed Python; replacing it is not necessary for P0.
- All repository files are currently untracked in git, so implementation must preserve the user's working tree and avoid assuming any file has a committed baseline.
- Existing replay commands and both tests pass. The current demo records a development F1 gain from 0.500 to 0.727 and an unseen-task gain from 0.400 to 0.750, but those records omit most required reproducibility and evaluation fields.
- `LLMScientist` exists but is unused by `AutoBenchOptimizer`; the current optimizer is fully deterministic and policy-name-specific.
- `TASKS.md` accurately remains unchecked at the P0 level: reusable pieces exist, but none of its component exit criteria are complete as written.

## Progress

- [x] Repository and referenced documentation inspected; current commands validated.
- [x] Smallest P0 execution plan written.
- [ ] Milestone 1 not started.
- [ ] Milestone 2 not started.
- [ ] Milestone 3 not started.
- [ ] Milestone 4 not started.
