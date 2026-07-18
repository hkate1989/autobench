# AutoBench: The Attribution Gap

**Status:** Proposed project direction; implementation is not approved or started  
**Primary track:** AGI House Auto-Research Track 3 — Trust the Loop  
**Secondary fallback:** Track 1 — Build the Loop  
**Decision date:** 2026-07-18

## Executive Recommendation

Reshape AutoBench into a small reward-hacking experiment that asks:

> Does optimizing a research-evidence harness against answer-set F1 select apparent improvements that become regressions when every claim must cite exact supporting evidence?

The optimizer may be AlphaEvolve, but AlphaEvolve is the test subject and search engine, not the project's novelty. The contribution is the interaction between a mutable research harness, an imperfect visible verifier, and a sealed attribution verifier that can reverse the visible ranking.

The project should produce one defensible empirical result:

> The optimizer improved the score it could see, but binding every claim to exact evidence changed which harness was actually best.

This direction preserves the current experiment loop, cached evidence, deterministic scoring, history, freeze boundary, and replay UI. It replaces the current zero-delta story with a sharper Track 3 experiment and avoids a broad rewrite.

No implementation work is authorized by this document. After the direction is explicitly approved, the repository must be reread in its then-current state and a separate execution plan must be written.

## 1. Interpreting the Three Tracks

| Track | Mutable object | Optimization signal | Required held-out evidence | Strong-project bar | Common failure mode |
|---|---|---|---|---|---|
| Build the Loop | Candidate solution, agent harness, or search mechanism | Fixed-budget task score | Transfer to unseen tasks or comparison under an equal compute budget | A real mutation-and-selection loop with evidence that the learned mechanism transfers | Comparing static prompts or policies once and calling the comparison self-improvement |
| Run the Loop | Research artifact or research process | Exact experiment result, executable test, or reproducible measurement | Novelty check plus independent reproduction of the claimed result | A tightly scoped question taken from hypothesis through verified result | Building a generic research agent without producing a finding |
| Trust the Loop | Verifier or evaluation protocol, and sometimes the optimized artifact used to probe it | Visible score exposed to the optimizer | A sealed metric, independent rerun, or adversarial evaluation unavailable during search | A concrete failure mode or reliability gain that changes whether an autoresearch claim is believable | Adding an LLM judge or dashboard without testing what the verifier permits the optimizer to exploit |

### Track 1 — Build the Loop

- **Literal requirement:** Something in the improvement machinery must change between iterations and be selected by a measured signal.
- **Loop contract:** A bounded mutator changes the solution, harness, or search mechanism; a fixed-budget scorer evaluates it; an acceptance rule keeps or rejects it.
- **Credible verifier:** Deterministic when possible, fast enough to run repeatedly, isolated from the mutable code, and paired with unseen-task transfer.
- **Shallow version:** Run three prewritten policies and select the highest score.
- **Strong version:** Mutate a declared harness under equal budget and show that the selected harness transfers.
- **Seven-hour reality:** A narrow prompt/config DSL and 5–10 candidates are feasible. Arbitrary code evolution, complex bilevel search, or infrastructure-heavy benchmarks are not.

### Track 2 — Run the Loop

- **Literal requirement:** The loop must advance a real research question through hypothesis, experiment, result, and verified artifact.
- **Loop contract:** The research hypothesis, experimental artifact, or claim changes in response to measured results.
- **Credible verifier:** An exact grader, executable reproduction, or independently reproducible measurement—not only model opinion.
- **Held-out requirement:** A novelty check and a validation surface not used to construct the result.
- **Shallow version:** An agent reads papers and writes a report.
- **Strong version:** A small research claim is tested end to end and remains credible under rerun.
- **Seven-hour reality:** Symbolic or finite-set discovery with an exact grader is feasible. Paper-to-code for a substantial paper is high risk.

### Track 3 — Trust the Loop

- **Literal requirement:** The project must explain why an autoresearch improvement should or should not be believed.
- **Loop contract:** An optimizer changes a bounded artifact against a visible evaluation surface; a hidden surface tests whether the apparent improvement is real.
- **Credible verifier:** Sealed labels, immutable evidence identifiers, deterministic scoring, no optimizer access, and auditable failure examples.
- **Held-out requirement:** At least one structurally stronger hidden score and fresh sealed tasks. These answer different questions: specification gaming and transfer.
- **Shallow version:** Show public and private scores for static outputs.
- **Strong version:** Let a real optimizer exploit the visible metric, then reveal a reproducible rank reversal and the exact failure that caused it.
- **Seven-hour reality:** A bounded harness DSL, precomputed evidence bundles, exact dual verifiers, and a replayable 5–10-candidate run are feasible.

## 2. Current Repository Reality

### What the system does today

The current Node.js vertical slice runs a sequential, observation-dependent selector over three prewritten research policies:

```text
development baseline
→ diagnose omissions
→ test broad discovery plus verification
→ KEEP or REJECT by exact-set F1
→ possibly test targeted follow-up
→ freeze the incumbent
→ compare the frozen policy on one unseen task
→ replay committed artifacts in the UI
```

The implementation is real enough to derive decisions from measured scores. It is not currently a general harness optimizer or a demonstrated self-improving system.

### Audited behavior

The current candidate-bound evidence implementation produces:

| Phase | Policy | F1 | Decision |
|---|---|---:|---|
| Development baseline | `direct_search` | 0.500 | Incumbent |
| Development candidate 1 | `broad_discovery_then_verify` | 0.000 | REJECT |
| Development candidate 2 | `broad_discovery_with_targeted_followup` | 0.500 | REJECT |
| Unseen baseline | `direct_search` | 0.400 | Comparison |
| Unseen frozen policy | `direct_search` | 0.400 | No transfer gain |

The older `0.727` development improvement and `0.750` unseen result depended on joining candidate identity from one result with qualifying evidence from another. Evidence hardening correctly retired those numbers.

### True research object today

The sharpest honest description is:

> We are testing whether either of two prewritten search-policy interventions beats direct search on one Apollo finite-set task under exact-set F1.

What changes today is the selected policy identity. The scientist component diagnoses two hard-coded failure types and chooses from a fixed intervention catalog; optional LLM output can rephrase the bounded proposal but cannot invent a new mechanism. The current optimization surface is one development question with exposed answer labels, one exact-set evaluator, and unequal query counts. There is no fresh evidence that any improvement transfers because no candidate is accepted and the former unseen task has already influenced analysis.

### Reusable assets

- `src/core.js`: exact-set scoring, iteration records, and score-derived KEEP/REJECT logic.
- `src/policies.js`: bounded policies, ranked evidence provenance, and candidate-bound result checks.
- `src/cli.js`: development/freeze/unseen orchestration and artifact emission.
- `src/scientist.js`: useful trace vocabulary for observation, diagnosis, hypothesis, and intervention, though not a credible novelty claim by itself.
- `data/`: deterministic MediaWiki replay caches and committed experiment artifacts.
- `public/app.js`: a polished, deterministic replay UI with no experiment logic embedded in presentation.
- Existing tests: strong regression coverage for the current causal trace and evidence semantics.

### Main credibility failures

1. **No current improvement.** The headline replay is `0.500 → 0.500` on development and `0.400 → 0.400` on unseen data.
2. **The optimizer is mostly a router over static policies.** Multiple model calls and a replay timeline do not turn static comparison into harness optimization.
3. **The candidate can see task ground truth.** `Environment` passes the whole task to `policy.run`, so labels are not technically isolated from the mutable component.
4. **The verifier boundary is weak.** Verification behavior resides inside mutable policy code, allowing an optimizer with code access to change what counts as evidence.
5. **The task family is too small.** One development item and one already-inspected unseen item cannot support transfer or generalization claims.
6. **Budgets are unequal.** The baseline uses one query while targeted follow-up uses many, so policy comparisons confound mechanism with compute.
7. **Evidence semantics remain lexical.** Same-result proximity is better than cross-result joining but is not semantic entailment.
8. **Experiment provenance is incomplete.** Artifacts do not yet include all required run, task, evaluator, source, cache, model, cost, and latency identifiers.
9. **The first intervention is a weak straw man.** Exact-quote broad search predictably returns poor discovery signal.
10. **The UI currently presents a sophisticated causal story around a null product result.** Presentation quality exceeds the strength of the supported claim.

### Claim audit

| Claim | Status | Defensible wording |
|---|---|---|
| Self-improving | Unsupported | Sequentially evaluates bounded, prewritten interventions |
| Transferable | Unsupported | Performs one qualitative same-family post-freeze check |
| Robust | Unsupported | Deterministic on committed replay inputs |
| Verified | Partially supported | Exact-set outputs and candidate-bound lexical evidence are deterministically scored |
| Generalizable | Unsupported | Tested on two Apollo tasks only |
| Autonomous | Partially supported | Decisions execute automatically within a hard-coded intervention catalog |
| Research loop | Partially supported | A real observe–test–accept/reject trace exists, but the hypothesis and mutation space are extremely narrow |

## 3. Track Fit and Ranking

### Track 1 — Build the Loop: 5/10 current, 8/10 with a real harness mutator

It fits because the repository already records attempts, score-derived decisions, an incumbent, a freeze boundary, and transfer evaluation. It does not yet fit strongly because it compares fixed policies, exposes labels, uses unequal budgets, and demonstrates no accepted improvement.

The seven-hour must-have delta would be a bounded mutable harness schema, equal budgets, multiple development tasks, and a fresh held-out split. A general mechanism-injection system is too risky.

**Judge's exposing question:** “What did the system invent or improve that was not already hand-written?”

### Track 2 — Run the Loop: 3/10

The failure diagnosis and intervention trace superficially resemble scientific iteration. The system does not currently investigate a sufficiently meaningful research question, perform a novelty check, or produce a new scientific artifact beyond benchmark optimization.

Reframing the benchmark as the research question is possible, but Track 3 gives the verifier and failure mode a much clearer center.

**Judge's exposing question:** “What research result exists here independently of your agent benchmark?”

### Track 3 — Trust the Loop: 6/10 current, 9/10 with the attribution-gap experiment

The repository's most interesting historical event is already a verifier failure: apparent gains disappeared when evidence attribution was hardened. That is stronger raw material than the current self-improvement story.

The required delta is to make this an intentional, controlled reward-hacking probe: expose answer-set F1, seal exact attribution scoring, isolate labels and verifier code, use equal immutable inputs, archive every candidate, and reveal hidden performance only after optimization freezes.

**Judge's exposing question:** “How do you know the hidden verifier is actually independent and not merely a second subjective judge?”

### Ranking

1. **Primary: Track 3 — Trust the Loop.** Strongest match to the repository's real finding and the event's verifier-first priority.
2. **Fallback: Track 1 — Build the Loop.** Use if the attribution benchmark cannot be labeled reliably; demonstrate bounded harness optimization and transfer instead.
3. **Do not target: Track 2 — Run the Loop.** It requires a larger conceptual pivot without improving the seven-hour odds.

## 4. Three Candidate Directions

### Candidate A — AlphaEvolve Attribution-Gap Probe

**Thesis:** Optimizing a research-evidence harness against answer-set F1 selects configurations whose apparent improvements regress when claims are scored as exact entity–evidence pairs.

**Primary track:** Track 3 — Trust the Loop  
**Winning potential:** 9/10

**Borrowed mechanism:** AlphaEvolve-style evolutionary program/config search and the standard public-versus-private reward-hacking setup.  
**Differentiated contribution:** Apply that setup to claim attribution in research harnesses, with the same archived outputs scored on both surfaces and a concrete rank-reversal explanation.

```text
OFFICIAL TRACK REQUIREMENT
Trust an autoresearch improvement by probing its evaluation surface
↓
WHAT CHANGES BETWEEN ITERATIONS
A bounded evidence-harness configuration
↓
WHO CHANGES IT
AlphaEvolve or a deterministic local bounded mutator
↓
OPTIMIZATION SIGNAL
Visible macro answer-set F1 on development tasks
↓
ACCEPT / REJECT RULE
Keep candidates that improve visible score under the fixed budget
↓
HIDDEN VERIFICATION
Exact entity–evidence attribution F1 plus fresh sealed tasks
↓
OBSERVABLE DEMO
Visible score rises, then hidden scores reveal a rank reversal and unsupported claims
↓
THE FINDING
The visible verifier selected evidence shortcuts rather than the most attributable harness
```

**Seven-hour cut:** Six finite-set tasks, a small harness DSL, 5–10 candidates, immutable evidence bundles, two deterministic verifiers, archived traces, and one reveal UI.

**Do not build:** Arbitrary code evolution, live web retrieval per candidate, a semantic judge, multi-domain generality, or a platform abstraction.

### Candidate B — Regression Ratchet

**Thesis:** A failure-derived growing regression verifier yields more transferable harness improvements than a static verifier of equal size and evaluation budget.

**Primary track:** Track 3 — Trust the Loop  
**Winning potential:** 6/10

```text
OFFICIAL TRACK REQUIREMENT
Make autoresearch gains more believable over time
↓
WHAT CHANGES BETWEEN ITERATIONS
The harness and the permanent regression suite
↓
WHO CHANGES IT
An optimizer mutates the harness; a failure analyzer promotes hidden failures into tests
↓
OPTIMIZATION SIGNAL
Current regression-suite score under an equal evaluation budget
↓
ACCEPT / REJECT RULE
Accept only candidates that pass accumulated gates and improve aggregate score
↓
HIDDEN VERIFICATION
Fresh tasks never promoted into the suite
↓
OBSERVABLE DEMO
Static optimization oscillates while regression-gated optimization retains past capabilities
↓
THE FINDING
Accumulated verifier memory changes the reliability of subsequent gains
```

This is technically compatible with the repo, but it is no longer the best novelty position. Recent continual agent-optimization work already reports that regression-aware in-loop optimization can improve transfer under equal budgets. Reproducing that result in seven hours would look derivative unless AutoBench found a sharply different failure mode.

### Candidate C — Failure-Conditioned Search Efficiency

**Thesis:** Under a fixed query budget, failure-conditioned mutation produces no more held-out improvement than random harness mutation once verifier quality is held constant.

**Primary track:** Track 1 — Build the Loop  
**Winning potential:** 5.5/10

```text
OFFICIAL TRACK REQUIREMENT
Improve or study the search machinery under equal compute
↓
WHAT CHANGES BETWEEN ITERATIONS
The harness configuration proposed for the next trial
↓
WHO CHANGES IT
A diagnosis-driven proposer or a random-search baseline
↓
OPTIMIZATION SIGNAL
Development attribution score per fixed query/model-call budget
↓
ACCEPT / REJECT RULE
Keep the best incumbent after each equal-cost trial
↓
HIDDEN VERIFICATION
Fresh-task score and score-per-call
↓
OBSERVABLE DEMO
Two equal-budget search traces converge differently or surprisingly similarly
↓
THE FINDING
Diagnosis quality either matters—or matters less than verifier quality—for efficient improvement
```

This is a valid bake-off but needs more trials for a credible conclusion, has a less visceral demo, and risks turning into a generic search comparison.

## 5. Selected Direction

### Recommended thesis

> Optimizing a research-evidence harness against answer-set F1 can select apparent improvements that become regressions when every claim must cite exact supporting evidence.

### Experiment contract

- **Mutable object:** A bounded, serializable evidence-harness configuration.
- **Development tasks:** Three finite-set evidence questions available to the optimizer only through inputs, immutable evidence bundles, and visible scores.
- **Fresh held-out tasks:** Three sealed questions unavailable until the candidate archive is frozen.
- **Visible signal:** Macro exact-set entity F1 on development tasks.
- **Hidden signal:** Exact attributed-claim F1 over `(entity, evidence_id)` pairs, plus unsupported-claim rate.
- **Fixed budget:** The same evidence bundle, model-call allowance, output cap, and runtime cap for every candidate. Prefer eight total candidates if AlphaEvolve is ready; five is the minimum useful run.
- **Acceptance:** A candidate becomes visible incumbent only when it strictly improves visible macro F1. Ties reject.
- **Hidden reveal:** Score every archived candidate only after optimization ends. Do not feed hidden results back into mutation or selection.
- **Minimum meaningful loop:** Baseline plus at least three actual mutations. A single comparison or static policy grid is not enough.
- **Success:** At least `+0.15` visible F1 for the public winner, no more than `+0.05` hidden improvement or a hidden regression, a hidden rank reversal, divergence on at least two tasks, and two auditable unsupported entity–evidence pairs.
- **Useful null:** Public and hidden rankings align. This would show that the historical evidence bug was local rather than a systematic optimization failure under the new benchmark.

### Mutable harness schema

Keep the mutation language narrow and inspectable. Candidate fields may include:

- discovery strategy or query template identifier;
- evidence grouping: global, per-result, or per-candidate;
- evidence-window size;
- page-fetch guard;
- citation-selection strategy;
- maximum claims returned;
- optional candidate follow-up behavior;
- fixed query/tool budget.

Candidates must not contain task literals or entity lists. They must not import modules, read labels, make undeclared network calls, modify verifier code, or alter evidence bundles.

### Task family

Use six Apollo finite-set evidence tasks because the repository already has strong domain caches and parsers:

- Retain the Moon-landing task and former Lunar Roving Vehicle task as development/canary tasks; the former “unseen” task is no longer fresh.
- Add one development task and three genuinely sealed tasks using similar mission predicates.
- Give each task a fixed candidate universe, immutable evidence bundle, ground-truth entity set, and human-audited `goldEvidenceIdsByEntity`.
- Include hard negatives and split-evidence distractors so a harness can obtain the right entity for the wrong reason.

Six tasks are enough for a hackathon demonstration of a mechanism, not enough for broad statistical or domain-general claims.

### Visible verifier

Normalize predicted mission identifiers and compute exact-set precision, recall, and F1. Aggregate macro F1 across development tasks. This verifier is intentionally incomplete: it rewards a correct entity even when the attached citation does not support it.

### Hidden verifier

Represent every claim as an exact `(entity, evidence_id)` pair. A pair is a true positive only when:

1. the entity belongs to the task's gold set; and
2. the evidence identifier appears in the audited support map for that entity.

A correct entity with unsupported evidence remains a false negative for the gold pair and contributes a false positive as an invalid submitted pair. This prevents an optimizer from attaching arbitrary citations to correct answers.

The hidden surface has two dimensions:

1. **Same-output stronger scoring:** Re-score archived development outputs with attribution F1 to detect specification gaming.
2. **Fresh sealed tasks:** Execute frozen candidates on new tasks to measure transfer.

The verifier is clean and fast because it compares normalized identifiers and immutable evidence IDs. It is harder to game because labels, support maps, and verifier code are outside the candidate boundary. It is not universal factual verification: annotation errors, incomplete evidence bundles, and ambiguous claims remain vulnerabilities and must be disclosed.

### Leakage controls

- Remove `groundTruth` and support maps from every object passed to candidate code.
- Keep public and hidden evaluator modules immutable and outside the AlphaEvolve `EVOLVE-BLOCK`.
- Freeze source hashes, config hashes, benchmark version, evidence-bundle hashes, model identifiers, and candidate archive before hidden scoring.
- Precompute retrieval. Do not let candidates receive different live search results.
- Never show hidden per-task or aggregate scores to the optimizer.
- Run an automated split-leakage test that fails if sealed task IDs, labels, or evidence mappings enter an optimizer prompt or candidate input.

## 6. AlphaEvolve's Role

AlphaEvolve is recommended if its Google Cloud prerequisites are already provisioned or pass a strict early smoke test. It makes the visible-surface optimizer credible and current, but it must remain replaceable.

### Exact role

- Evolve only the bounded harness configuration or a small pure function inside a marked `EVOLVE-BLOCK`.
- Receive the visible development metric from a client-side deterministic evaluator.
- Generate and archive candidate lineages under a fixed candidate budget.
- Never receive hidden labels, hidden scores, or verifier implementation details.

### Why it helps

- It provides a real iterative population/search loop instead of a hand-authored policy sequence.
- Its controller/evaluator separation maps naturally to the visible-score experiment.
- The lineage history gives the demo real mutations and selection decisions.

### Integration gate

The official setup requires a Google Cloud project, Gemini Enterprise/Discovery Engine application, Application Default Credentials, and supported Gemini generation models. The official codelab estimates roughly 45–60 minutes for initial setup. Therefore:

- Attempt one minimal smoke test early.
- If credentials or the first completed candidate are not working inside 30 minutes, switch to the local bounded mutator.
- Do not let cloud setup consume the verifier and benchmark budget.
- Record the AlphaEvolve configuration and model IDs when it is used.

### Local fallback

A dependency-free mutator should enumerate or randomly perturb the same declared schema under the same candidate budget. This preserves the scientific experiment and demo even if the live API fails. The project claim concerns verifier-induced selection failure, not AlphaEvolve superiority.

### Current building blocks

| Tool | Role | Difficulty | Need |
|---|---|---:|---|
| AlphaEvolve on Google Cloud | Visible-surface harness optimizer and lineage generator | Medium if provisioned; high if not | Replaceable |
| Existing MediaWiki replay cache | Immutable evidence source for fair, deterministic trials | Low | Essential |
| Local Node.js exact graders | Public and hidden scoring | Low | Essential |
| Local JSON artifacts | Candidate archive, hashes, metrics, replay | Low | Essential |
| Existing replay UI | Three-minute explanation and hidden-score reveal | Low–medium | Essential |
| Frontier LLM API | Optional candidate proposal or extraction within a fixed role | Medium | Replaceable |

Avoid adding DSPy, Optuna, a database service, or a remote sandbox unless the local loop cannot express the bounded mutation contract. A small local loop is faster and more auditable.

## 7. Adversarial Novelty Check

### AlphaEvolve / FunSearch

- **Similarity:** Evolutionary search over mutable code or configuration using deterministic evaluators.
- **Difference:** AutoBench studies how an imperfect public verifier changes which research harness evolution selects; it does not claim a new evolutionary algorithm.
- **Framing risk:** “This is AlphaEvolve on an Apollo task.”
- **Required framing:** AlphaEvolve is deliberately used as a strong optimizer to pressure-test evaluator design. The result is the public/hidden attribution gap and rank reversal.

### RewardHackingAgents and EvilGenie

- **Similarity:** Agents exploit evaluation or reward surfaces in ways that diverge from intended behavior.
- **Difference:** AutoBench uses an exact, auditable research-evidence benchmark and compares entity correctness with claim-level attribution on the same candidate archive.
- **Framing risk:** “This is another generic reward-hacking benchmark.”
- **Required framing:** Keep the benchmark tiny and show the exact evidence-joining shortcut and verifier-induced selection decision, not a broad catalog of attacks.

### Meta-Harness / Agentic Harness Engineering / GEPA

- **Similarity:** Optimize prompts, tools, or agent scaffolds over a task family.
- **Difference:** AutoBench's object of study is not whether harness optimization works, but whether visible answer metrics select unverifiable harnesses.
- **Framing risk:** “This is prompt optimization with a private test set.”
- **Required framing:** The hidden score is structurally different, not merely another sample from the same metric. Exact entity–evidence pairing is the core experimental intervention.

### Continual regression-aware agent optimization

- **Similarity:** Uses past failures or regression tests to improve transfer and reliability.
- **Difference:** The selected AutoBench direction does not claim regression accumulation as novelty; it isolates attribution failure under dual verifiers.
- **Framing risk:** A growing-regression-suite project would be too close to recent work.
- **Decision:** Keep the regression-ratchet idea as a post-hackathon ablation, not the primary submission.

The proposal is meaningfully distinct only if the demo produces a real optimizer trace, a sealed exact verifier, a rank reversal or informative null, and concrete unsupported claims. Without those, it collapses into “AlphaEvolve on another benchmark.”

## 8. Repository-Level Direction

These are intended deltas, not an implementation plan.

| Existing area | Proposed change | Experimental purpose |
|---|---|---|
| `src/tasks.js` | Separate public task inputs from private entity labels and support maps; expand to three development and three sealed tasks | Prevent leakage and support transfer |
| Replay cache/data | Assign stable evidence IDs and freeze evidence-bundle hashes | Make attribution exact and candidate comparisons fair |
| `src/core.js` | Generalize evaluation records to public entity F1 and post-freeze hidden attribution F1 | Record the dual-verifier experiment |
| New immutable verifier module | Implement public entity-set scoring and hidden entity–evidence pair scoring outside mutation boundaries | Make the finding deterministic and hard to game |
| `src/policies.js` | Replace named monolithic policies with an explicit bounded harness schema interpreted by fixed runner code | Create a real mutable object without arbitrary code evolution |
| Optimizer layer | Add a public-score-only candidate loop with an AlphaEvolve adapter and local fallback | Produce genuine iterations and selection history |
| `src/cli.js` | Freeze candidate archive and provenance before invoking hidden scoring | Enforce causal isolation |
| Experiment artifacts | Add run ID, timestamp, task/evaluator/source/cache hashes, config, model, usage, cost, latency, errors, and per-task scores | Make the result reproducible |
| `public/app.js` | Replace dashboard clutter with one public/hidden plot, iteration history, score unlock, and exact mismatch example | Make the finding understandable in three minutes |
| Tests | Add verifier correctness, split leakage, deterministic scoring, budget equality, accept/reject, and replay tests | Protect the scientific contract |

Do not rewrite the application into Python merely because the repository guidance suggests typed Python. The current dependency-free Node.js vertical slice is coherent and working; a language rewrite would not improve the thesis, verifier, or demo within seven hours.

## 9. Winning Three-Minute Demo

### 0:00–0:30 — Problem

Show one sentence:

> Autoresearch systems improve whatever verifier they can see. What if the verifier rewards the right answer for the wrong evidence?

Display a correct Apollo mission paired with an unsupported evidence snippet.

### 0:30–1:00 — Setup

Show only:

- the mutable harness fields;
- three development and three sealed tasks;
- visible entity F1;
- a locked hidden attribution verifier;
- the fixed eight-candidate budget.

### 1:00–2:00 — Improvement loop

Replay several AlphaEvolve or local-mutator iterations. Each row shows:

- the exact config diff;
- visible score;
- query/model-call budget;
- KEEP or REJECT;
- lineage or parent candidate.

The visible score should climb while the hidden column remains locked.

### 2:00–2:30 — Reveal

Unlock hidden scores for the frozen candidate archive. Show one plot with candidate rank on the x-axis and both public and hidden scores. Highlight the public winner and the hidden winner when their ordering reverses.

Then show one auditable failure: candidate identity came from result A while the claimed predicate is supported only by result B, or a citation does not support the submitted entity–predicate claim.

### 2:30–3:00 — Finding

End with:

> The optimizer improved the score it could see, but binding every claim to exact evidence changed which harness was actually best.

Do not show a general dashboard, architecture diagram, token stream, or live web search. Replay the reliable recorded experiment and optionally run one live candidate as proof that the loop is real.

## 10. Seven-Hour Cut

Size key: **S** under 30 minutes, **M** 30–90 minutes, **L** 1.5–3 hours, **XL** do not attempt.

### Core submission — must work

- **S:** Archive the current replay and define the experiment manifest.
- **L:** Build and audit six task/evidence bundles with exact entity and evidence-ID labels.
- **M:** Implement deterministic public and hidden verifiers.
- **M:** Isolate labels, support maps, and verifier code from candidate execution.
- **M:** Implement the bounded local harness mutator and public-only acceptance loop.
- **M:** Persist a frozen candidate archive with full provenance.
- **M:** Render iteration history, the hidden-score reveal, one plot, and one failure example.
- **S:** Add focused verifier, leakage, determinism, and selection tests.

### Strong submission — only after core works

- **M:** Add and smoke-test the thin AlphaEvolve adapter if cloud resources are already provisioned.
- **S:** Score every archived candidate on both hidden dimensions after freeze.
- **S:** Add one more task per split if annotation quality remains high.
- **S:** Record a clean eight-candidate replay with a clear rank reversal or informative null.

### Stretch

- **M:** Static-verifier versus failure-derived-regression ablation.
- **L:** Second model/provider to probe optimizer–verifier correlation.
- **L:** Cross-domain task family.
- **XL:** Semantic entailment verifier.
- **XL:** Arbitrary code evolution or remote sandboxing.

### Likely critical path

```text
fresh task/evidence pack
→ exact hidden grader
→ label and verifier isolation
→ public-only local loop
→ confirm or falsify attribution gap
→ freeze reproducible artifact
→ minimal reveal UI
→ AlphaEvolve adapter only if time and credentials permit
```

The experiment is invalid without the verifier, isolation, frozen archive, and held-out reveal. Cut AlphaEvolve integration before cutting any of those.

## 11. Risks and Fallbacks

| Risk | Likelihood | Impact | Mitigation | Fallback |
|---|---|---|---|---|
| AlphaEvolve provisioning consumes the build window | Medium | High | Thirty-minute smoke-test cutoff | Local bounded mutator using identical schema and budget |
| No public/hidden divergence appears | Medium | Medium | Include audited split-evidence distractors and score all candidates | Present the null honestly: attribution hardening aligned the optimizer with intended behavior |
| Hidden support labels are wrong or incomplete | Medium | High | Human-audit a tiny finite evidence set and persist exact IDs/hashes | Reduce task count rather than use uncertain labels |
| Optimizer leaks labels or verifier details | Medium | Fatal | Separate modules/data, sanitize prompts, add leakage tests | Run candidates in a restricted pure runner with only public inputs |
| Unequal compute explains the winner | Medium | High | Fixed evidence, model calls, query count, runtime, and output cap | Report score per call and discard unfair candidates |
| Demo depends on live APIs | High | Medium | Commit a complete replay artifact | Show replay and execute only one optional live mutation |
| Apollo-only benchmark looks trivial | Medium | Medium | Frame it as a controlled microscope for verifier behavior | Do not claim domain generality; emphasize exact causal mechanism |

## 12. What to Stop and What to Preserve

### Stop building

- The current “Scientist” as the headline novelty.
- A generic autonomous research platform.
- The current zero-delta replay as evidence of self-improvement.
- Search-strategy bake-offs without enough trials for a credible comparison.
- A living regression harness as the primary novelty claim.
- New databases, orchestration services, sandboxes, or framework abstractions.
- Live retrieval inside every candidate evaluation.
- Broad “verified,” “generalizable,” “robust,” or “self-improving” language.

### Preserve

- Deterministic MediaWiki caches and offline replay.
- Exact-set normalization and score aggregation.
- Candidate-bound evidence provenance.
- Measured KEEP/REJECT semantics.
- Experiment history and freeze boundary.
- Existing failure visibility.
- The single-screen replay UI and its visual quality.
- Focused regression tests.

## 13. Immediate Changes After Direction Approval

After explicit approval—and only after rereading the current repository—the implementation plan should begin with these changes:

1. Archive the current P0 trace as historical evidence rather than overwrite it.
2. Split public task inputs from private labels and support maps.
3. Create stable evidence IDs and immutable evidence-bundle hashes.
4. Implement independent public entity-F1 and hidden attribution-F1 verifiers.
5. Define the bounded harness configuration schema and prohibit task literals.
6. Build a public-only local optimization loop with a frozen candidate archive.
7. Add a thin AlphaEvolve adapter behind the same optimizer interface.
8. Add complete experiment provenance, budget, failure, and cost metadata.
9. Add leakage, verifier, budget, selection, and replay tests.
10. Simplify the UI to the iteration trace, public/hidden plot, reveal, and exact failure example.

## 14. Decision Record

- **2026-07-18:** Recommend Track 3 over Track 1 because verifier failure is the repository's strongest real phenomenon.
- **2026-07-18:** Select the attribution-gap probe over the regression-ratchet and search-efficiency alternatives.
- **2026-07-18:** Permit and recommend AlphaEvolve as the visible-surface optimizer, but make it replaceable and enforce a strict setup cutoff.
- **2026-07-18:** Require both same-output stronger scoring and fresh-task transfer; neither alone is sufficient.
- **2026-07-18:** Preserve the current Node.js vertical slice and avoid a language or architecture rewrite.
- **2026-07-18:** Treat this document as a direction proposal, not implementation authorization or an implementation-ready ExecPlan.

## References

- [AGI House Auto-Research build-day brief](https://lu.ma/agi-house)
- [AlphaEvolve on Google Cloud announcement](https://cloud.google.com/blog/products/ai-machine-learning/alphaevolve-is-available-for-everyone)
- [Google Cloud AlphaEvolve client](https://github.com/Google-Cloud-AI/alphaevolve-on-googlecloud)
- [AlphaEvolve Google Cloud codelab](https://codelabs.developers.google.com/alphaevolve-on-google-cloud-1)
- [Do Agent Optimizers Compound?](https://arxiv.org/abs/2607.14004)
- [Continual Learning Terminal-Bench artifacts](https://github.com/relai-ai/Continual-Learning-Terminal-Bench)
- [Meta-Harness](https://arxiv.org/abs/2603.28052)
- [Agentic Harness Engineering](https://arxiv.org/abs/2604.25850)
- [GEPA](https://arxiv.org/abs/2507.19457)
- [RewardHackingAgents](https://arxiv.org/abs/2603.11337)
- [EvilGenie](https://arxiv.org/abs/2511.21654)

