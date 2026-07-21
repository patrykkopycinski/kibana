---
change_id: daybreak-s1-pd5-watches-workflows
status: draft
created_at: 2026-07-09
source: clarification round 1 (post contextDocs-injection fix), 2026-07-09
---

# PD-5 Clarification Decisions

Answers to the 15 questions surfaced by `treadmill_run_clarification` on PD-5.
These are PRD-level decisions the demo prototype hides — recorded here so the
plan's design/tasks reference resolved requirements, not generator-inferred ones.

## Scope & motivation

**Q1 — Why/motivation for porting Watches + Workflows?**
PD-5 delivers the prototype's core *management* loop: an analyst configures a
Watch (a standing monitoring unit over alerts/streams), assigns Workflows
(trigger→skill→outcome) to it, and observes live status. This is the
critical-path gate for the "set up a watch" goal and the layer the triage slice
(PD-4) renders *output* of but cannot *configure*. Without it the analyst can
triage alerts but cannot shape what gets triaged.

**Q3 — Full server stores, or UI reading mocked data?**
Full server persistence. WATCHES/WORKFLOWS are static demo arrays in the
prototype (`throughline-app.js:2474`, `:2546`); a real port builds server
stores + routes + types mirroring PD-2's Evidence/Proposal pattern. No mocked
data ships (anti-pattern #65).

**Q10 — Dependency on PD-4's transport + public/ layer?**
Hard dependency. PD-5 reuses PD-4's `theme.ts`, app shell, typed HTTP client,
and hook patterns (`useWatch`/`useWorkflow` mirror `useProposals`). PD-5 adds
its own HTTP routes (`/api/daybreak/watch{es}`, `/api/daybreak/workflow{s}`)
following PD-4's route-registration convention (registered in `start()` only
when `config.enabled`).

**Q13 — Which surfaces in-scope vs deferred?**
In-scope: Watches list (`renderWatchesPage`), Watch detail/config
(`renderWatchDetail`), Workflows page (`renderWorkflowsPage`), AgentsHub
(`renderAgentsHubPage`). The coverage strip is in-scope *as a read-only
visualization* of watch windows. Deferred to follow-up plans: the full
hunt/skills/governance surfaces (PD-6/7/8).

## Persistence model

**Q2 — Dedicated stores + schema fields?**
Yes. Two stores mirroring PD-2:
- `WatchProperties`: `{ id, name, description, surface, sched { window, cadence, handoff, coverage }, autonomyTier, skillIds[], workflowIds[], status ('active'|'paused'|'draft'), createdAt, updatedAt }`.
- `WorkflowProperties`: `{ id, name, triggerType ('event'|'sched'), trigger (e.g. 'On alert · severity = critical'), skillId, outcome, gated (bool), surface, watchIds[], enabled, lastRunAt }`.

**Q8 — Schedule model: server or recomputed client-side?**
Server. `w.sched` is the source of truth on the `WatchProperties` record; the
client renders derived window/cadence/handoff/coverage from it. Recomputing
client-side would diverge across analysts and break the coverage strip.

**Q11 — HISTORY_LOG audit trail as a real store?**
Yes, but lightweight. Watch activity (workflow runs, status transitions,
autonomy changes) persists as an audit log reusing PD-2's `DecisionHistoryEntry`
shape — not a new pattern. Stored per-watch, queryable for the activity surface.

## Demo-vs-reality edge cases (the PRD-level decisions)

**Q4 — Conflict resolution: two workflows target the same alert?**
Priority ordering + operator visibility. Each Workflow carries a `priority`
integer; when two target the same alert, the higher-priority runs and the lower
is recorded as "superseded" in the audit trail. A tie on priority → **both**
run (they are independent skills) unless explicitly marked mutually exclusive
(future field). No silent first-wins — the audit trail always names what ran
and what was deferred and why.

**Q5 — Lifecycle: deactivate a watch mid-investigation?**
In-flight runs **complete**; no new runs are scheduled. A deactivated watch
(`status: 'paused'`) stops accepting new trigger events immediately, but any
workflow run already executing runs to its natural terminal state (Proposal
emitted / auto-resolved / errored). This is recorded in the audit trail as
"run completed post-deactivation". Rationale: killing a mid-flight agent run
risks orphaned Proposals and lost evidence context.

**Q6 — Deletion safety: orphaned workflow refs on a deleted watch?**
Fail-closed: a watch with active workflow runs or open Proposals in the last
24h **cannot** be hard-deleted; the API returns 422 with `missingRequirements:
['active-runs']` (reusing PD-2's `requireReadinessGate` shape). Deletion only
proceeds when the watch is `paused` AND has no in-flight runs. On successful
deletion, referencing workflows have the watch pruned from their `watchIds[]`
(a compensating update, not an orphan).

**Q7 — Permission/autonomy changes to a running watch?**
Re-evaluate on next trigger, not retroactively. Promoting a watch from
`auto-run` to `approval-required` takes effect on the *next* event; an
already-running action completes under its original autonomy level (audited).
This avoids mid-action permission flips that would leave a half-applied
response action. Retroactive downgrade (approval→auto) is explicitly
disallowed for the same reason.

**Q9 — Concurrency: multiple analysts edit one watch?**
Optimistic concurrency with `updatedAt` version tag. A PUT carrying a stale
`updatedAt` returns 409 Conflict; the client re-fetches and re-applies. Last-
writer-wins is rejected, not silently merged. (Same convention as PD-2 store
updates.) No heavyweight locking — watches are edited infrequently relative to
their read rate.

## Gating & empty states

**Q12 — Empty-state behavior (no runs / no workflows / no coverage)?**
Explicit empty states, never blank panels:
- No runs: "This watch hasn't fired yet. Configured trigger: {trigger}."
- No workflows: "No workflows assigned. Assign one to start monitoring."
- No coverage: "No schedule window covers the current time. The watch is dormant."
Each is assertable for the eval gate (`toBeVisible()` on the empty-state text).

**Q14 — Coverage strip: overlapping watches / gaps?**
Render honestly, do not reconcile silently. Overlaps render as a distinct
"double-covered" segment (different shade); gaps render as uncovered. The
strip is a *visualization of reality*, not a scheduler that merges windows.
Analysts see coverage gaps and overlaps to act on them — hiding them defeats
the purpose.

**Q15 — Autonomy/gating model for workflow-triggered actions?**
Reuses PD-2's readiness gate verbatim. Workflow actions map onto the
prototype's three tiers (read & gather → auto-run; assemble & draft → proposed
as diff; world-changing → approval-required via `requireReadinessGate`).
PD-5 does **not** re-implement the gate; it inherits the server property
(`evaluateReadinessGate`/`requireReadinessGate`) exactly as PD-4's approval
flow does.

## Traceability

These decisions trace to the functional requirements the plan generator should
cover:
- Q4 → FR-conflict-resolution (NEW)
- Q5 → FR-deactivation-lifecycle (NEW)
- Q6 → FR-deletion-safety (NEW, reuses PD-2 gate shape)
- Q7 → FR-autonomy-change-semantics (NEW)
- Q9 → FR-optimistic-concurrency (NEW)
- Q15 → traces to PD-2 FR-017/FR-018 (gate reuse, not re-implementation)
