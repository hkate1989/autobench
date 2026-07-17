# AutoBench Evaluation Specification

## 1. Purpose

This document defines what "better" means.

AutoBench is only credible if the optimization target is explicit, reproducible, and difficult to game.

The evaluator is therefore a core product component, not an afterthought.

---

## 2. Primary Objective

For the initial research-agent demo, optimize for:

```text
Overall Quality Score
```

computed from a weighted set of dimensions.

Recommended dimensions:

| Dimension | Weight |
|---|---:|
| Factual correctness | 35% |
| Completeness | 25% |
| Evidence/citation support | 20% |
| Source quality | 10% |
| Instruction following | 10% |

Scores should be normalized to a 0–100 scale.

Example:

```text
overall =
0.35 * correctness
+ 0.25 * completeness
+ 0.20 * citation_support
+ 0.10 * source_quality
+ 0.10 * instruction_following
```

Latency and cost are secondary metrics, not part of the primary score unless explicitly configured.

---

## 3. Benchmark Structure

Each benchmark example should contain:

```json
{
  "id": "research_001",
  "question": "...",
  "rubric": [
    "...",
    "..."
  ],
  "metadata": {
    "topic": "...",
    "difficulty": "medium"
  }
}
```

Avoid benchmarks where the desired answer is purely stylistic.

Prefer questions where good research behavior is observable.

---

## 4. Recommended Demo Questions

Choose questions that benefit from:

- multiple sources
- fact synthesis
- uncertainty handling
- source quality judgment
- current or niche information

Avoid questions that can be answered perfectly from model memory in one sentence.

Good benchmark categories:

1. compare two technical approaches using evidence
2. summarize a recent research direction
3. investigate a company or project with conflicting claims
4. answer a question requiring source triangulation
5. produce a recommendation with explicit constraints

The live demo may show one question, while optimization runs on a larger hidden benchmark.

---

## 5. Split Strategy

Preferred:

```text
development set
→ used during optimization

held-out test set
→ used once for final comparison
```

For a very small demo:

- clearly label the benchmark as a development benchmark
- do not claim general improvement beyond that benchmark

Never tune directly against hidden evaluator outputs from the held-out test set.

---

## 6. Per-Dimension Rubrics

### 6.1 Factual Correctness

Score high when:

- major claims are factually supported
- no material contradictions appear
- uncertainty is expressed appropriately

Score low when:

- important facts are wrong
- claims exceed available evidence
- unsupported certainty is used

---

### 6.2 Completeness

Score high when:

- the answer addresses all major parts of the question
- important caveats are included
- the response provides enough context to act on

Score low when:

- major requested components are missing
- the answer stops at surface-level summary

---

### 6.3 Citation Support

Score high when:

- important factual claims are supported
- citations point to relevant evidence
- sources actually substantiate the claims made

Score low when:

- citations are decorative
- sources do not support the statement
- major factual claims are uncited

---

### 6.4 Source Quality

Score high when:

- primary sources are used where appropriate
- authoritative and recent sources are preferred
- multiple sources are used for contested claims

Score low when:

- low-quality aggregators dominate
- source selection is unrelated to the question
- outdated sources are used without justification

---

### 6.5 Instruction Following

Score high when:

- explicit user constraints are satisfied
- requested format is respected
- unnecessary content is avoided

Score low when:

- required sections are missing
- constraints are violated

---

## 7. Evaluator Output Schema

Each evaluation should return structured output.

Example:

```json
{
  "overall_score": 82.5,
  "dimension_scores": {
    "correctness": 90,
    "completeness": 80,
    "citation_support": 75,
    "source_quality": 85,
    "instruction_following": 80
  },
  "strengths": [
    "..."
  ],
  "weaknesses": [
    "..."
  ],
  "critical_errors": [],
  "evaluator_version": "v1"
}
```

Do not store only the final scalar score.

The demo becomes much stronger when users can see *why* the winner scored better.

---

## 8. Aggregate Metrics

For each configuration, report:

```text
mean overall score
median overall score
minimum score
dimension means
failure rate
mean latency
estimated cost
```

The primary ranking metric is mean overall score.

Recommended tie-breakers:

1. lower failure rate
2. lower latency
3. lower cost

Do not use tiny decimal score differences as strong evidence of superiority.

---

## 9. Minimum Improvement Threshold

A candidate should only be labeled a meaningful winner when:

```text
candidate_score >= baseline_score + 3 points
```

Recommended demo threshold: **+3 absolute points on a 100-point scale**.

This threshold is a heuristic for the demo, not a statistical guarantee.

If improvement is smaller, present it as:

```text
best observed candidate
```

rather than:

```text
meaningfully improved agent
```

---

## 10. Evaluator Stability

Keep constant during one optimization run:

- evaluator model
- evaluator prompt
- scoring rubric
- benchmark version
- aggregation logic

Every evaluation record must include evaluator version.

If any evaluator component changes, start a new comparison series.

---

## 11. Guarding Against Evaluator Gaming

Before accepting a winning configuration, inspect:

- the largest score gains
- the lowest-scoring examples
- one random example
- one example where baseline beat the winner

Look for:

- excessive verbosity
- keyword stuffing
- fake citations
- evaluator-specific phrasing
- answer format hacks

A winner that only games the rubric is not a valid product result.

---

## 12. Demo Comparison

For the live comparison, show:

```text
Baseline score: 71
Winner score:   84
Delta:          +13
```

Then show dimension deltas:

```text
Correctness        +8
Completeness       +14
Citation support   +22
Source quality     +9
Instruction        +4
```

Finally show the exact configuration diff.

Example:

```diff
- max_search_queries: 2
+ max_search_queries: 4

- planning_enabled: false
+ planning_enabled: true

- critique_pass: false
+ critique_pass: true
```

This connects the optimization decision to the observed improvement.

---

## 13. Acceptance Criteria

The evaluation system is ready when:

- identical stored outputs produce identical aggregate scores, or documented low evaluator variance
- every experiment has per-example scores
- failed runs are visible
- baseline and candidates use identical evaluation logic
- winning configuration can be explained through score breakdowns
- the UI can render baseline vs winner

---

## 14. Claims We Can Make

Safe demo claim:

> AutoBench automatically searched a bounded agent-configuration space and found a configuration that performed better on our benchmark.

Avoid claiming:

> AutoBench made the agent universally better.

Benchmark-specific improvement is enough for a strong demo.
