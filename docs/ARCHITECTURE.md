# AutoBench Architecture

> **Current P0 implementation:** AutoBench is a failure-driven R&D loop for research agents, implemented as a dependency-free Node.js vertical slice. The detailed generic-platform proposal later in this document is historical context, not the P0 runtime contract. See `plans/p0-end-to-end.md` and `docs/EVALUATION.md` for the authoritative behavior.

## Current P0 data flow

```text
development baseline
→ Scientist diagnoses observed failure evidence
→ one bounded intervention experiment
→ measured KEEP / REJECT
→ repeat from the latest observation when rejected
→ optimizer returns learnedPolicy
→ freeze exact descriptor
→ unseen baseline vs exact frozen policy, with no re-optimization
→ committed JSON artifacts
→ single-screen replay console
```

Current module boundaries are deliberately small:

- `src/core.js`: exact-set evaluation and the observation-dependent optimizer loop
- `src/scientist.js`: deterministic diagnosis, hypothesis, and bounded intervention selection
- `src/policies.js`: baseline plus the bounded intervention catalog
- `src/cli.js`: development-to-freeze-to-unseen orchestration and artifact writing
- `data/experiments/task-a.json`: development scientific trace
- `data/experiments/task-b.json`: explicit freeze boundary and unseen transfer result
- `src/server.js`: static files and read-only artifact routes
- `public/app.js`: pure artifact-to-presentation mapping and replay rendering; no experiment logic

The demo defaults to committed replay for reliability. `npm run demo` serves the console; `AUTOBENCH_REPLAY=1 npm run experiment` regenerates both source artifacts through the existing end-to-end workflow.

---

## Historical platform proposal

## 1. System Purpose

AutoBench is an optimization layer around an existing AI agent.

It does not attempt to build the world's best research agent directly.

Instead, it answers:

> Given a fixed benchmark and a defined set of choices about how an agent operates, which configuration performs best?

The system turns agent improvement from manual prompt tweaking into a structured experimental loop.

---

## 2. Core Loop

```text
                    ┌─────────────────────┐
                    │     Benchmark       │
                    │ questions + rubrics │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Baseline Agent     │
                    │      Config         │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Experiment Runner   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Evaluator       │
                    └──────────┬──────────┘
                               │
                     baseline score
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Optimizer       │
                    │ proposes candidates │
                    └──────────┬──────────┘
                               │
                 ┌─────────────┴─────────────┐
                 ▼                           ▼
        ┌─────────────────┐         ┌─────────────────┐
        │ Candidate A     │   ...   │ Candidate N     │
        └────────┬────────┘         └────────┬────────┘
                 │                           │
                 └─────────────┬─────────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Experiment Runner   │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │  Select Best Config │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Before/After Report │
                    └─────────────────────┘
```

---

## 3. Demo Story

The demo should communicate four ideas in under three minutes.

### Step 1 — "Here is the baseline"

Show:

- benchmark task
- baseline configuration
- baseline aggregate score
- one representative output

### Step 2 — "AutoBench explores alternatives"

Show candidate configurations such as:

- number of search queries
- source diversity requirement
- planning enabled/disabled
- critique pass enabled/disabled
- evidence extraction strategy
- synthesis prompt variant

The exact search space should remain small enough that the audience understands it.

### Step 3 — "The system runs experiments"

Show an experiment table:

| Run | Config | Score | Latency | Cost |
|---|---|---:|---:|---:|

### Step 4 — "It finds a better agent"

Show:

- winning configuration
- score delta
- baseline vs winner output
- evaluator breakdown

The key product moment is not "the answer looks nicer."

It is:

> "The system discovered a configuration that scores better under a reproducible benchmark."

---

## 4. Major Components

### 4.1 Benchmark

Responsibilities:

- load benchmark examples
- validate schema
- expose development/test splits
- attach evaluation rubrics or expected properties

Suggested schema:

```python
BenchmarkExample(
    id: str,
    question: str,
    rubric: list[str],
    metadata: dict,
)
```

The initial demo benchmark should contain approximately 5–20 examples.

Use fewer examples if model latency is high.

---

### 4.2 AgentConfig

Represents the tunable behavior of the research agent.

Example:

```python
AgentConfig(
    max_search_queries=4,
    require_source_diversity=True,
    planning_enabled=True,
    critique_pass=True,
    synthesis_prompt="v2",
)
```

The optimizer must only modify declared fields.

Do not let optimization mutate arbitrary code.

---

### 4.3 ResearchAgent

Interface:

```python
run(question: str, config: AgentConfig) -> AgentResult
```

`AgentResult` should contain:

- final answer
- cited evidence
- sources
- intermediate metadata
- latency
- usage/cost when available
- errors

The research implementation should be replaceable without changing the evaluator.

---

### 4.4 Evaluator

Interface:

```python
evaluate(
    example: BenchmarkExample,
    result: AgentResult,
) -> EvaluationResult
```

The evaluator should return dimension-level scores.

Example dimensions:

- factual correctness
- completeness
- citation support
- source quality
- instruction following

The evaluator must be versioned.

---

### 4.5 ExperimentRunner

Responsibilities:

1. execute one configuration over a benchmark split
2. collect per-example outputs
3. evaluate every result
4. aggregate metrics
5. persist the experiment

Interface:

```python
run_experiment(
    config: AgentConfig,
    benchmark: Benchmark,
) -> ExperimentResult
```

This component should contain no optimization logic.

---

### 4.6 Optimizer

For the first demo, use a bounded and explainable algorithm.

Recommended approach:

```text
baseline config
    ↓
generate predefined candidate configs
    ↓
evaluate all candidates
    ↓
rank by primary score
    ↓
break ties using latency/cost
    ↓
select winner
```

A slightly more agentic version may ask a model to propose candidate configurations, but proposals must still conform to the declared search space.

Avoid implementing RL or gradient-based optimization for the initial demo.

---

### 4.7 Experiment Store

For a hackathon, JSONL or SQLite is sufficient.

Each experiment should persist:

```text
experiment_id
created_at
benchmark_version
evaluator_version
model
config
aggregate_metrics
per_example_results
latency
cost
status
errors
```

The UI should be able to reload completed experiments.

---

### 4.8 UI

The UI exists to make the optimization loop legible.

Minimum useful screens:

#### A. Run Overview

- baseline score
- best score
- absolute delta
- relative delta

#### B. Experiment Table

- config
- score
- latency
- status

#### C. Comparison View

- question
- baseline output
- winner output
- evaluator breakdown

#### D. Winning Config

Show exactly what changed.

Do not build a generic dashboard platform.

---

## 5. Data Flow

```text
BenchmarkExample
      │
      ▼
ResearchAgent + AgentConfig
      │
      ▼
AgentResult
      │
      ▼
Evaluator
      │
      ▼
EvaluationResult
      │
      ▼
ExperimentResult
      │
      ├── persist
      │
      └── optimizer ranking
```

---

## 6. Recommended Search Space for the Demo

Use 3–5 knobs, each with 2–3 values.

Example:

```python
SEARCH_SPACE = {
    "max_search_queries": [2, 4],
    "planning_enabled": [False, True],
    "critique_pass": [False, True],
    "require_source_diversity": [False, True],
}
```

This gives at most 16 combinations.

If runtime is too slow, evaluate a curated subset.

The objective is not exhaustive search.

The objective is a credible automated improvement loop.

---

## 7. Primary API Boundaries

Prefer stable interfaces like:

```python
class ResearchAgent(Protocol):
    def run(
        self,
        question: str,
        config: AgentConfig,
    ) -> AgentResult:
        ...
```

```python
class Evaluator(Protocol):
    def evaluate(
        self,
        example: BenchmarkExample,
        result: AgentResult,
    ) -> EvaluationResult:
        ...
```

```python
class Optimizer(Protocol):
    def propose(
        self,
        history: list[ExperimentResult],
    ) -> list[AgentConfig]:
        ...
```

This keeps the demo extensible without overengineering.

---

## 8. Failure Modes

### Evaluator gaming

A candidate may learn to produce verbose answers that satisfy superficial rubric checks.

Mitigation:

- use multiple dimensions
- inspect examples manually
- keep evaluator prompts stable during a comparison

### Benchmark leakage

Optimization may overfit a tiny benchmark.

Mitigation:

- use a dev/test split when possible
- clearly label demo results as benchmark-specific

### Runtime explosion

Candidate count × benchmark size × research calls can become expensive.

Mitigation:

- small benchmark
- capped tool calls
- cached baseline runs
- limited candidate set
- optional parallelism

### Unclear causality

Changing many knobs at once makes the winner hard to interpret.

Mitigation:

- show config diffs
- keep search space small
- optionally include single-knob ablations

---

## 9. Non-Goals

The first version is not:

- a universal AutoML system
- an RL training framework
- an autonomous coding agent
- a production eval platform
- a benchmark marketplace

It is a credible proof that agent behavior can be optimized systematically through automated experimentation.

---

## 10. Success Criterion

The architecture succeeds when one command or UI action can produce:

```text
baseline experiment
+ candidate experiments
+ ranked results
+ winning configuration
+ reproducible comparison report
```

That complete loop is the product.
