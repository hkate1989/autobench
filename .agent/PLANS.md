# PLANS.md

Use an ExecPlan for any task that spans multiple modules, introduces a new subsystem, or is expected to take more than one focused implementation step.

The purpose of an ExecPlan is to let another engineer—or a future Codex run—resume the work without reconstructing context.

---

## ExecPlan Template

Create plans under:

```text
plans/<short-name>.md
```

Use this structure.

```md
# <Plan title>

## Goal

One paragraph describing the user-visible or system-visible outcome.

## Why This Matters

Explain the product or demo value. Avoid implementation-only justification.

## Current State

Describe what exists now, including relevant files and interfaces.

## Target State

Describe the smallest complete end state.

## Non-Goals

Explicitly state what will not be built.

## Design

Describe:
- data flow
- module boundaries
- important interfaces
- state/persistence
- error handling

## Milestones

### Milestone 1 — <name>
- [ ] task
- [ ] task

Exit criteria:
- observable condition

### Milestone 2 — <name>
...

## Validation

List:
- unit tests
- integration tests
- manual demo steps

## Risks

List only concrete risks that could break correctness or the demo.

## Decisions

- YYYY-MM-DD: decision and reason

## Discoveries

Record unexpected findings discovered during implementation.

## Progress

- [ ] not started
- [~] in progress
- [x] complete
```

---

## Planning Rules

A good plan must be implementation-ready.

Do not write vague milestones such as:

- improve agent
- add optimization
- make UI better

Instead write observable tasks such as:

- add `AgentConfig` schema with prompt strategy and tool budget fields
- persist per-example evaluator scores
- implement exhaustive evaluation over six declared configurations
- render baseline vs winner score delta in the UI

---

## Scope Control

For every milestone, ask:

> Is this necessary to make the core AutoBench loop work or to make the demo understandable?

If not, defer it.

If implementation uncovers a better approach, update the plan before making a large directional change.

---

## Execution Rules

While implementing a plan:

1. Work milestone by milestone.
2. Keep the repository runnable after each milestone.
3. Mark progress as work completes.
4. Record important decisions.
5. Record surprises under `Discoveries`.
6. Do not silently expand scope.
7. Re-run the minimum end-to-end path after architecture changes.

---

## Hackathon Constraint

For the current AutoBench demo, prioritize this critical path:

```text
benchmark
→ baseline run
→ evaluator
→ candidate generation
→ candidate runs
→ winner selection
→ before/after report
→ demo UI
```

Anything outside this path is secondary.

A completed simple optimizer is more valuable than an unfinished sophisticated optimizer.
