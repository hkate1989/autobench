# AutoBench Build Plan

## P0 — Must work for the demo

### 1. Repository skeleton
- [ ] Create core source folders
- [ ] Add typed shared data models
- [ ] Add config loading
- [ ] Add environment variable handling

Exit criteria:
- project imports successfully
- one test command runs

### 2. Benchmark
- [ ] Define `BenchmarkExample`
- [ ] Create 5–20 benchmark questions
- [ ] Add benchmark loader
- [ ] Add benchmark version
- [ ] Add dev/test split if feasible

Exit criteria:
- benchmark loads from one command
- malformed data fails validation

### 3. Baseline research agent
- [ ] Define `AgentConfig`
- [ ] Define `AgentResult`
- [ ] Implement baseline agent
- [ ] Capture sources/evidence
- [ ] Record latency and failures

Exit criteria:
- one benchmark question can run end to end

### 4. Evaluator
- [ ] Implement structured evaluator output
- [ ] Score all required dimensions
- [ ] Compute overall weighted score
- [ ] Persist evaluator version
- [ ] Add aggregation tests

Exit criteria:
- a stored agent output can be scored independently

### 5. Experiment runner
- [ ] Run one config across the benchmark
- [ ] Persist per-example outputs
- [ ] Persist per-example scores
- [ ] Compute aggregate metrics
- [ ] Add experiment status/error handling

Exit criteria:
- baseline experiment produces a saved result

### 6. Optimizer
- [ ] Define explicit search space
- [ ] Generate candidate configurations
- [ ] Run candidate experiments
- [ ] Rank candidates
- [ ] Select winner
- [ ] Save winning config

Exit criteria:
- one command produces baseline + candidates + winner

### 7. Demo UI
- [ ] Show baseline score
- [ ] Show best score and delta
- [ ] Show experiment table
- [ ] Show winning configuration
- [ ] Show one baseline-vs-winner answer comparison
- [ ] Show evaluator dimension breakdown

Exit criteria:
- a new viewer understands the product loop in under 30 seconds

### 8. End-to-end demo
- [ ] Run clean end-to-end flow
- [ ] Verify no hard-coded winning result
- [ ] Verify experiment history persists
- [ ] Pick one strong live example
- [ ] Prepare fallback cached results

Exit criteria:
- demo can survive an API failure using cached experiment results

---

## P1 — High-value improvements

- [ ] Add model-proposed candidate configs constrained by schema
- [ ] Add experiment caching
- [ ] Add parallel candidate evaluation
- [ ] Add cost tracking
- [ ] Add config diff view
- [ ] Add per-question drilldown
- [ ] Add failure analysis
- [ ] Add single-knob ablations

---

## P2 — Only if everything else is done

- [ ] User-editable benchmark
- [ ] Multiple agent backends
- [ ] Multiple evaluator presets
- [ ] Advanced search algorithms
- [ ] Remote experiment workers
- [ ] Authentication
- [ ] Hosted persistence

---

## Suggested Build Order

```text
Hour 1
benchmark + schemas + baseline

Hour 2
evaluator

Hour 3
experiment runner

Hour 4
optimizer

Hour 5
UI

Hour 6
end-to-end debugging

Hour 7
demo polish + backup path
```

Do not follow the hour labels rigidly.

Protect the critical path.

---

## Demo Checklist

Before presenting:

- [ ] baseline result is already available
- [ ] at least 3 candidate experiments are visible
- [ ] winner is not manually hard-coded
- [ ] score improvement is easy to see
- [ ] exact winning config is visible
- [ ] one qualitative output comparison is compelling
- [ ] cached fallback data is available
- [ ] live path takes less than a few minutes or is partially precomputed
