# AutoBench

AutoBench is an automated R&D loop for research agents. It observes benchmark failures, diagnoses a concrete failure mode, forms a research-strategy hypothesis, runs a bounded intervention against ground truth, and makes a measured `KEEP` or `REJECT` decision.

It is a deliberately narrow, hackathon-ready vertical slice—not a generic benchmark platform or configuration-search tool.

## North Star

```text
observe failure
→ diagnose
→ hypothesize
→ run a controlled policy experiment
→ KEEP or REJECT from measured performance
→ repeat from the new observation
→ freeze the learned policy
→ test it unchanged on an unseen task
```

The experiment trajectory is outcome-dependent. If the expected failure evidence is absent, AutoBench stops or chooses a different intervention; if an intervention succeeds, it is kept and later experiments do not run.

## What is implemented

- Real MediaWiki search with committed response caches for deterministic offline replay
- Fixed Apollo exhaustive-search tasks with exact-set precision, recall, and F1 evaluation
- A bounded intervention catalog: direct-search baseline, broad discovery with batch verification, and broad discovery with targeted follow-up
- A first-class deterministic Scientist that converts observed failure evidence into structured diagnoses, mechanism-based hypotheses, and allowed interventions
- An optional constrained LLM Scientist path with deterministic fallback; the required CLI path remains API-free and deterministic
- An observation-driven optimizer with explicit incumbent state, scientific trial history, and measured `KEEP`/`REJECT` decisions
- A frozen transfer boundary that passes the optimizer-returned policy descriptor directly into unseen evaluation
- Counterfactual tests proving the loop is not a fixed policy sequence
- Inspectable JSON experiment records and a projection-ready, single-screen scientific-trace console

## Demonstrated scientific trace

With the committed MediaWiki caches, the development run reproduces:

```text
direct_search
F1 0.500
failure: 4 of 6 correct Moon-landing missions omitted

→ diagnosis: candidate omission
→ hypothesis: broaden discovery, then verify candidates in one batch
→ broad_discovery_then_verify
F1 0.000, delta -0.500
REJECT

→ new observation: 11 discovered candidates were rejected
→ hypothesis: verify each candidate with a targeted follow-up
→ broad_discovery_with_targeted_followup
F1 0.727, delta +0.227 versus the incumbent
KEEP
```

The same run then freezes the optimizer-returned descriptor and evaluates only `direct_search` and that exact frozen policy on the unseen task: F1 `0.400 → 0.750`. This is only a qualitative same-family transfer sanity check.

## Run

Requires Node.js 20 or newer. No package installation, network access, or API key is required for tests and cached replay.

```sh
npm test                              # full deterministic test suite
AUTOBENCH_REPLAY=1 npm run experiment # development R&D loop + frozen unseen transfer
AUTOBENCH_REPLAY=1 npm run generalize # legacy alias for the same complete replay
npm run phase0                        # live MediaWiki search only when a cache is missing
npm run demo                          # serve the recorded replay UI
```

Open <http://localhost:4173> after starting the demo server. `LLMScientist` is optional; the current CLI uses the deterministic Scientist.

### Three-minute demo

1. Run `npm run demo` and open <http://localhost:4173>. Replay mode is the reliable default and reads the committed artifacts.
2. Follow baseline F1 `0.500` and four omissions into the red `REJECT` experiment.
3. Show that its 11 rejected candidates become the next observation, producing the green `KEEP` experiment at F1 `0.727`.
4. Cross the visible policy-freeze boundary and point out “NO RE-OPTIMIZATION.”
5. Finish with the qualitative unseen comparison: `0.400 → 0.750`, delta `+0.350`.

To regenerate the artifacts before presenting, run `AUTOBENCH_REPLAY=1 npm run experiment`, then refresh the page. The UI does not duplicate or rerun experiment logic.

## Scope of the claim

The demonstrated claim is narrow: on one fixed Apollo development task, AutoBench used observed failures to choose sequential research-strategy experiments, rejected a regression, and kept an intervention that improved ground-truth F1 from `0.500` to `0.727`.

The `0.400 → 0.750` unseen result is an inspectable qualitative sanity check on one related task. It is not statistical evidence of generalization, cross-domain transfer, or universal agent improvement.
