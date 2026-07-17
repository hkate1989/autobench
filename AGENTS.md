# AGENTS.md

## Mission

Build **AutoBench**, a demoable system that automatically improves a research agent against a fixed benchmark.

The core product claim is:

> Given a task distribution, a baseline agent, an evaluation harness, and a bounded search space of agent configurations, AutoBench can run experiments, identify better configurations, and produce a reproducible before/after improvement report.

This repository is optimized for a short build session. Prefer a narrow, working vertical slice over a broad framework.

---

## Read This First

Before making non-trivial changes, read:

1. `docs/ARCHITECTURE.md`
2. `docs/EVALUATION.md`
3. `TASKS.md`

For work that spans multiple files or requires more than one implementation phase, also read:

4. `.agent/PLANS.md`

Do not start large refactors without first writing or updating an execution plan.

---

## Product Scope

### In scope

The demo must support one end-to-end loop:

1. Load a fixed benchmark of research questions.
2. Run a baseline research agent.
3. Score the outputs with a deterministic or rubric-based evaluator.
4. Generate candidate agent configurations from a bounded search space.
5. Evaluate candidate configurations on the same development benchmark.
6. Select the best candidate using aggregate metrics.
7. Run a final comparison against the baseline.
8. Display the experiment history and the winning configuration in a simple UI.

### Out of scope

Do not spend build-session time on:

- multi-user accounts
- authentication
- generalized plugin systems
- distributed execution
- arbitrary user-defined evaluators
- production observability stacks
- complex database migrations
- sophisticated RL algorithms
- autonomous code modification
- long-running background infrastructure
- framework-level abstractions without immediate demo value

If a feature does not improve the end-to-end demo, defer it.

---

## System Invariants

The following are non-negotiable.

### 1. Baseline and candidates must be comparable

Every candidate must be evaluated on the same benchmark inputs and scoring logic as the baseline.

### 2. Optimization must not see held-out test answers

Use a development split for search and a held-out split for final reporting whenever feasible.

### 3. Experiments must be reproducible

Every experiment record must include at minimum:

- config
- benchmark version
- model
- prompt/version identifier
- timestamp
- aggregate score
- per-example scores
- latency
- estimated cost when available

### 4. Failures must be visible

Do not silently convert failed runs into zeros without recording the failure reason.

### 5. Search space must be explicit

The optimizer may only mutate parameters defined in the declared search space.

### 6. Prefer simple optimization logic

For the demo, a transparent bounded search strategy is better than a complex optimizer that is difficult to explain.

Good defaults:

- grid search
- random search
- simple successive elimination
- heuristic proposal + evaluation

---

## Preferred Architecture

Keep the code organized around these concepts:

- `Benchmark`
- `AgentConfig`
- `ResearchAgent`
- `Evaluator`
- `ExperimentRunner`
- `Optimizer`
- `ExperimentStore`
- `Report/UI`

Favor plain typed Python and small modules over heavy framework abstractions.

Suggested structure:

```text
src/
  benchmark/
  agent/
  evaluation/
  experiments/
  optimization/
  ui/
tests/
```

The exact folders may differ if the existing repository already has a coherent structure.

---

## Coding Rules

### General

- Use Python type hints for public functions.
- Keep functions small and single-purpose.
- Prefer dataclasses or Pydantic models for structured experiment data.
- Separate orchestration from model/API calls.
- Keep prompts in named constants or prompt files rather than inline string fragments.
- Avoid hidden global state.
- Use explicit dependency injection for model clients where practical.

### Error handling

- Fail loudly for invalid benchmark or configuration data.
- Record recoverable model/API failures as structured experiment errors.
- Never swallow exceptions with a bare `except`.
- Retry only transient errors and cap retries.

### Logging

Log at least:

- experiment start/end
- config being evaluated
- benchmark item progress
- evaluator result
- aggregate result
- optimizer decision

Do not log secrets or full API keys.

---

## Testing Requirements

For every meaningful change, run the smallest relevant test set first.

Minimum test coverage should include:

- benchmark loading
- config serialization
- evaluator score aggregation
- optimizer candidate selection
- experiment persistence
- one mocked end-to-end optimization loop

External model calls should be mockable.

Do not require live API access for unit tests.

---

## Evaluation Discipline

`docs/EVALUATION.md` is the source of truth for what counts as improvement.

Before changing the agent, optimizer, or evaluator, ask:

1. What metric should move?
2. Why should this change move it?
3. Could this accidentally game the evaluator?
4. Is the comparison still fair?
5. Can the result be reproduced?

Never optimize only for aesthetics of the demo.

---

## Definition of Done

A change is done only when:

- implementation works locally
- tests pass
- no critical path is broken
- experiment output is inspectable
- relevant docs are updated
- `TASKS.md` reflects the new status

For the hackathon demo, the project is complete when a new viewer can see:

1. the baseline configuration
2. the benchmark
3. multiple candidate experiments
4. the selected winning configuration
5. a measurable before/after improvement
6. example outputs explaining why the winner is better

---

## Demo First Rule

When choosing between:

- more general vs more demoable
- more elegant vs more reliable
- more autonomous vs more understandable

choose the option that makes the improvement loop easiest to demonstrate and defend.

---

## Change Management

Before modifying architecture-level interfaces, check whether the change is necessary for the current milestone.

Avoid broad refactors late in the build.

Prefer incremental changes that keep the system runnable.

After completing a milestone:

1. update `TASKS.md`
2. record important decisions in the active execution plan
3. run the end-to-end demo path once
