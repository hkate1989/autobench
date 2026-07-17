# AutoBench P0 Evaluation Specification

## 1. Purpose

This document defines what counts as improvement for the current exhaustive-search research task. P0 evaluates policies that return sets of Apollo mission identifiers; it does not evaluate synthesized prose answers.

The evaluator exists to support a controlled scientific decision:

```text
observed failure
→ bounded policy intervention
→ ground-truth measurement
→ KEEP or REJECT
```

Do not add nominal quality dimensions that the task output cannot genuinely measure.

---

## 2. Task and Ground Truth

The development task asks which Apollo missions successfully landed astronauts on the Moon. Its fixed ground-truth set is:

```text
Apollo 11
Apollo 12
Apollo 14
Apollo 15
Apollo 16
Apollo 17
```

The unseen same-family task asks which Apollo missions carried the Lunar Roving Vehicle. Its fixed ground-truth set is:

```text
Apollo 15
Apollo 16
Apollo 17
```

The development task may drive diagnosis, hypothesis selection, experiments, and KEEP/REJECT decisions. The unseen task is used only after the learned policy is frozen.

---

## 3. Primary Metric

The primary metric is exact-set F1 over normalized mission identifiers.

```text
true positives  = predicted missions present in ground truth
false positives = predicted missions absent from ground truth
false negatives = ground-truth missions absent from predictions

precision = true positives / predicted missions
recall    = true positives / ground-truth missions
F1        = 2 × precision × recall / (precision + recall)
```

Use `0` when a denominator is empty or both precision and recall are zero. Persist precision, recall, and F1 rounded consistently with the implementation.

F1 is the sole quality metric used for policy adoption because the task requires both exhaustive coverage and correct filtering. Precision and recall explain the tradeoff but do not override the F1 decision.

---

## 4. KEEP and REJECT

Each intervention is compared with the current incumbent policy on the same development task, ground truth, evaluator, and replay inputs.

```text
after F1 > incumbent F1  → KEEP
after F1 <= incumbent F1 → REJECT
```

Decisions must be computed from measured results. A policy name, catalog position, or expected replay outcome must never determine KEEP or REJECT independently of its score.

A rejected policy does not become the incumbent. Its structured failure analysis may become the next observation and motivate a different experiment.

A failed experiment is not assigned a synthetic F1 of zero. Record the execution error, use null after-score and delta fields, reject the intervention for adoption, and keep the failure distinct from a completed low-scoring experiment.

---

## 5. Failure Analysis

The scalar score decides adoption; structured failures decide what to investigate next.

Every completed evaluation records:

- `candidateOmission`: exact ground-truth missions missing from predictions
- `falsePositives`: exact predicted missions absent from ground truth
- `unknownRejected`: candidate missions discovered by a policy but rejected during verification
- `queryCount`: number of issued search queries
- `queries`: the issued query strings

These fields support concrete diagnoses:

| Observation | Diagnosis | Scientific use |
|---|---|---|
| Direct search omits correct missions | `candidate_omission_high` | Test whether broader candidate discovery recovers recall |
| A broad experiment discovers but rejects candidates | `unknown_rejection_high` | Test whether entity-level follow-up improves verification |

The trajectory must remain observation-dependent. Absence of the required failure evidence means the associated intervention must not be proposed automatically.

---

## 6. Controlled Comparison

Within one development run, keep constant:

- task and ground truth
- evaluator implementation and version
- committed MediaWiki replay inputs
- policy implementation associated with each named intervention

Each scientific trial records:

- observation and failure evidence
- diagnosis
- mechanism-based hypothesis
- bounded intervention
- incumbent policy
- before F1
- after F1
- signed delta
- KEEP/REJECT decision
- decision reason

Query count and latency may be reported as behavioral or operational diagnostics. They are not P0 adoption tie-breakers.

---

## 7. Phenomenon-Preservation Values

With the current committed caches and policies, replay must preserve:

| Phase | Policy | F1 | Expected scientific outcome |
|---|---|---:|---|
| Development baseline | `direct_search` | 0.500 | Diagnose omissions |
| Development experiment 1 | `broad_discovery_then_verify` | 0.000 | REJECT from measured regression |
| Development experiment 2 | `broad_discovery_with_targeted_followup` | 0.727 | KEEP from measured improvement |
| Unseen baseline | `direct_search` | 0.400 | Qualitative comparison only |
| Unseen frozen policy | `broad_discovery_with_targeted_followup` | 0.750 | Qualitative comparison only |

These values are regression expectations, not hard-coded decisions. Tests must evaluate policy outputs and derive decisions from measured scores.

An intentional change to tasks, caches, policies, normalization, or scoring may change these numbers, but it requires an explicit plan decision and a newly justified phenomenon baseline.

---

## 8. Development and Unseen Isolation

The unseen task must not influence:

- failure diagnosis
- hypothesis generation
- intervention selection
- KEEP/REJECT decisions
- learned-policy identity

Only after development experimentation ends may the system freeze the learned policy and run it unchanged on the unseen task.

The current unseen result is a qualitative same-family transfer sanity check. One task cannot establish statistical significance, broad generalization, or cross-domain transfer.

---

## 9. Reproducibility and Failures

Record a lightweight task/evaluator version with replay artifacts. Search or policy failures must remain visible with their stage, error name, and message. Missing replay caches must identify the failed query and must never trigger live network access in tests or required demo replay.

The required deterministic path must run without an API key. Optional LLM-generated hypothesis wording or selection cannot expand the bounded intervention catalog or change the evaluator.

---

## 10. P0 Acceptance

The evaluator portion of P0 is complete when offline tests demonstrate:

1. the exact development baseline, rejected experiment, and kept experiment scores;
2. KEEP/REJECT derived only from measured incumbent and intervention F1;
3. failure analysis containing the evidence used by the next diagnosis;
4. counterfactual trajectories that stop or change when omission or unknown-rejection evidence changes;
5. immediate freeze when the first intervention unexpectedly succeeds;
6. the exact unseen baseline and frozen-policy scores, with no unseen feedback into learning.
