# AutoBench

A deliberately narrow vertical slice that experimentally improves exhaustive web-research policies. It is not a platform.

## What is implemented

- Real MediaWiki search with committed response caches for deterministic replay
- Three manually specified policies and fixed Apollo ground truth
- Exactly three core abstractions: `Environment`, `ResearchPolicy`, `AutoBenchOptimizer`
- Failure-driven, one-intervention-at-a-time KEEP/REJECT loop
- Same-family unseen-task evaluation
- Optional constrained LLM Scientist with deterministic fallback
- One-screen replay UI backed by recorded JSON experiments

## Run

```sh
npm run phase0                 # live search when cache is missing
AUTOBENCH_REPLAY=1 npm run experiment
npm run generalize
npm test
npm run demo
```

Open http://localhost:4173. Set `OPENAI_API_KEY` only to opt into the LLM Scientist; it can select only the two hard-coded interventions and cannot execute code or change configuration.

## Scope of the claim

Only this claim is tested: experimentally discovered research strategies can improve performance on unseen tasks from the same task family. No cross-domain transfer is claimed.
