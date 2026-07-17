# Candidate-Bound Evidence Hardening

## Goal

Remove cross-result evidence leakage from the bounded verification policies. A candidate may be accepted only when one individual search result contains both the candidate identity and the qualifying task evidence, and every candidate verdict must persist the exact ranked result used to support it.

## Why This Matters

The current targeted-follow-up policy can combine an exact candidate page from one result with verification keywords from an unrelated result. That makes the score reproducible but the factual verdict unauditable. Correct evidence attribution is more important than preserving the current demo F1.

## Pre-Hardening State

Before this plan was executed, `src/policies.js` concatenated all targeted search results before testing `verifyPhrase`. `Environment.evaluate()` persisted predictions and failure analysis but dropped policy-level evidence provenance. The committed caches exposed false positives caused by this join.

## Target State

- Verification is performed per search result after deterministic text normalization.
- Candidate identity and qualifying evidence are matched within the same result, with bounded proximity.
- Targeted follow-up retains its existing exact-candidate-page guard.
- Policy outputs and experiment artifacts include one verdict per discovered candidate, the query, the reason, and exact ranked result snapshots used by the verdict.
- Development optimization and unseen transfer continue to derive policy selection only from measured development F1.

## Non-Goals

- Semantic entailment, negation detection, page fetching, or source-quality ranking.
- New policies, evaluator metrics, stores, services, or UI features.
- Preserving the previous `0.727` / `0.750` phenomenon when corrected evidence changes it.

## Design

Normalize Unicode and whitespace before matching. For each candidate, search each result independently for candidate identity and the task verification phrase within the existing bounded context. Persist `verificationVerdicts` on the policy run and pass it through `Environment.evaluate()` into the existing JSON artifacts. Each accepted verdict records the query plus the exact result rank, title, and snippet. Rejected verdicts record the missing condition; when same-result lexical evidence exists but a separate guard fails, that non-accepting evidence is retained for audit.

## Milestones

### Milestone 1 — Lock the invariant

- [x] Add a regression test that rejects split candidate/keyword evidence.
- [x] Add a test that accepts same-result evidence and retains the exact result.
- [x] Add a core test proving evidence survives into an environment result and scientific trial.

Exit criteria:

- The new policy regression fails against the old concatenated-result implementation.

### Milestone 2 — Harden and re-baseline

- [x] Implement the minimal per-result matcher and verdict trace.
- [x] Regenerate development and unseen artifacts through the real replay workflow.
- [x] Update replay, presentation, evaluation, and status documentation for measured outcomes.
- [x] Run focused tests, the full suite, and the replay experiment.

Exit criteria:

- No accepted verified candidate relies on two different search results.
- Artifacts retain exact verdict evidence.
- All measured score/entity changes are documented and tests pass offline.

## Validation

- Focused policy and core tests with an in-memory search seam.
- Committed-cache replay tests for development optimization and standalone unseen policy behavior.
- Full `npm test`.
- `AUTOBENCH_REPLAY=1 npm run experiment`.
- Artifact audit mapping every accepted candidate to its persisted evidence result.

## Risks

- Correct evidence binding may remove the development KEEP and therefore transfer the retained baseline.
- Wikipedia snippets use irregular whitespace; matching without normalization would create false rejections.
- Same-result lexical proximity is auditable but does not prove semantic entailment.

## Decisions

- 2026-07-16: Prefer auditable per-result evidence over preserving historic F1.
- 2026-07-16: Retain the targeted policy's exact-title page guard as an additional precision safeguard.
- 2026-07-16: Persist additive verdict provenance in existing artifacts; do not add a store or schema framework.

## Discoveries

- Correct same-result replay changes targeted development from `0.727` to `0.500`, making Experiment 2 a REJECT and retaining the baseline.
- The corrected targeted policy evaluated independently on unseen removes Apollo 12 and Apollo 10, producing `1.000`; the real transfer workflow still transfers the retained development baseline and therefore reports `0.400 → 0.400`.
- The historical `npm run phase0` improvement gate now exits non-zero because neither intervention beats development F1 `0.500`. This is an honest product-claim failure, not an execution or replay failure; the complete experiment workflow succeeds and persists baseline retention.
- Experiment 1's quoted verification query returns zero results. Its eleven verdicts now use `verification_results_empty` rather than implying that populated results lacked candidate evidence.
- The final deterministic suite contains 52 passing tests, including split-result rejection, bounded-context rejection, exact provenance persistence, rejected-verdict evidence retention, replay re-baselining, and retained-policy transfer.

## Progress

- [x] Milestone 1 complete.
- [x] Milestone 2 complete.
