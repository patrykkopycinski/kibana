# Specification

## Requirements

> Scope source: the "What Changes" bullets of the `daybreak-s1-pd5-watches-workflows` proposal. Every requirement below maps to one of those bullets. Existence/absence assertions and reuse claims are grounded in `research.md` (findings §1–§8); demo-vs-reality behavioural requirements trace to `clarification-decisions.md`'s resolved questions (Q2–Q15).

### Server Persistence — WatchClient

- **FR-001 MUST** — A `server/client/watch/` module MUST define `WatchProperties` (`id`, `name`, `description`, `surface`, `sched { window, cadence, handoff, coverage }`, `autonomyTier`, `skillIds[]`, `workflowIds[]`, `status: 'active' | 'paused' | 'draft'`, `createdAt`, `updatedAt`) as a space-scoped ES document, mirroring `server/client/proposals/types.ts`'s shape (research.md §3; clarification Q2).
- **FR-002 MUST** — `WatchClient` MUST scope every ES query through the `createSpaceFilter(space)` helper reused verbatim from `server/client/proposals/client.ts:62`, not a re-implementation (research.md §3).
- **FR-003 MUST** — The schedule (`sched`) on a `WatchProperties` record MUST be server-authoritative; the browser client renders a derived view, never recomputes window/cadence/coverage client-side (clarification Q8).
- **FR-004 MUST** — Watch activity (Workflow runs, status transitions, autonomy changes) MUST persist as an audit log reusing PD-2's `DecisionHistoryEntry` shape, queryable per-watch (clarification Q11).

### Server Persistence — WorkflowClient

- **FR-005 MUST** — A `server/client/workflow/` module MUST define `WorkflowProperties` (`id`, `name`, `triggerType: 'event' | 'sched'`, `trigger`, `skillId`, `outcome`, `gated`, `surface`, `watchIds[]`, `enabled`, `lastRunAt`, `priority`) as a space-scoped ES document (research.md §3; clarification Q2, Q4).
- **FR-006 MUST** — `WorkflowClient` MUST scope every ES query through the same `createSpaceFilter` helper as `WatchClient` (FR-002) — one space-scoping idiom shared across both new stores, not a second one invented.

### HTTP Routes

- **FR-007 MUST** — `server/http_routes/watch.ts` and `server/http_routes/workflow.ts` MUST each export a `register*Routes({ logger, router, getSpaceId }: RouteDependencies)` function, added to the existing `registerRoutes` aggregator (`server/http_routes/index.ts:16-18`), using `daybreakRouteSecurity` (`server/http_routes/types.ts:17`) and the shared `wrap_handler.ts` (research.md §4).
- **FR-008 MUST** — Watch/Workflow routes MUST register unconditionally under the plugin's existing single `xpack.daybreak.enabled` flag — no new PD-5-specific feature flag is introduced (research.md §8).

### Typed Browser Clients + Hooks

- **FR-009 MUST** — `public/services/watches_service.ts` and `public/services/workflows_service.ts` MUST each wrap `HttpSetup` against `daybreakApiPath`, declaring their own browser-local response types rather than importing server types, per the public/server boundary convention `services/proposals_service.ts` establishes (research.md §5).
- **FR-010 MUST** — `public/hooks/use_watches.ts` and `public/hooks/use_workflows.ts` MUST wrap their respective services in a React Query hook keyed `['daybreak', 'watches']` / `['daybreak', 'workflows']`, returning `{ data, isLoading, refresh }`, mirroring `use_proposals.ts`'s shape (research.md §5).

### Watches UI

- **FR-011 MUST** — A Watches list page MUST port `renderWatchesPage` (`throughline-app.js:5541-5552`): a card grid over live `WatchClient` data, a "New watch" affordance, and an active/paused/draft status summary — backed by real data, never mocked (clarification Q3).
- **FR-012 MUST** — A Watch detail page MUST port `renderWatchDetail` (`throughline-app.js:5661-5710`): mandate, run/accepted/time-saved stats, an autonomy-tier control, surface toggles, an assigned-skills list, and a recent-activity table sourced from the FR-004 audit log.
- **FR-013 MUST** — The Watch detail page's coverage strip MUST render overlapping windows as a distinct visually-marked segment and gaps as visibly uncovered — it is a visualization of the real schedule, not a silently-reconciling scheduler (clarification Q14).
- **FR-014 MUST** — Each of the three empty states (no runs, no workflows assigned, no coverage) MUST render an explicit, assertable message rather than a blank panel (clarification Q12: "This watch hasn't fired yet...", "No workflows assigned...", "No schedule window covers the current time...").

### Workflows UI

- **FR-015 MUST** — A Workflows list page MUST port `renderWorkflowsPage` / `watchWorkflowRow` (`throughline-app.js:5553-5580`): one trigger→skill→outcome pipeline strip per `WorkflowClient` record, an on/off switch, and a watch-assignment footer listing `watchIds[]`.

### Demo-vs-Reality Edge Cases

- **FR-016 MUST** — When two enabled Workflows target the same alert, the higher-`priority` Workflow MUST run and the lower MUST be recorded as "superseded" in the audit log; equal priority MUST run both unless a future mutual-exclusion field says otherwise. No silent first-wins (clarification Q4).
- **FR-017 MUST** — Deactivating a Watch (`status → 'paused'`) MUST stop new trigger events immediately but MUST NOT interrupt an in-flight Workflow run — the run completes to its natural terminal state and is recorded as "run completed post-deactivation" (clarification Q5).
- **FR-018 MUST** — Deleting a Watch with active Workflow runs or open Proposals in the last 24h MUST fail with 422 and `missingRequirements: ['active-runs']`, reusing PD-2's `requireReadinessGate` shape. Deletion MUST only proceed when the Watch is `paused` with no in-flight runs (clarification Q6).
- **FR-019 MUST** — On successful Watch deletion, every Workflow referencing it MUST have the deleted id pruned from its `watchIds[]` as a compensating update — no orphaned Workflow references left behind (clarification Q6).
- **FR-020 MUST** — Promoting a Watch's autonomy tier (e.g. `auto-run` → `approval-required`) MUST take effect on the next triggered event only; an already-running action completes under its original autonomy level and is audited as such. Retroactive downgrade of an in-flight action is disallowed (clarification Q7).
- **FR-021 MUST** — Concurrent Watch edits MUST use optimistic concurrency via an `updatedAt` version tag; a PUT carrying a stale `updatedAt` MUST return 409 Conflict, never silently overwrite (clarification Q9).

### Autonomy & Gating Reuse

- **FR-022 MUST** — Workflow-triggered consequential actions MUST be gated by PD-2's existing `evaluateReadinessGate`/`requireReadinessGate` server property exactly as PD-4's Proposal approval flow uses it — this plan MUST NOT re-implement gate logic client-side or server-side (clarification Q15).

## Out of Scope
The following are explicitly excluded from this plan and carry no requirements above:
- Full autonomy-level *policy-editing* UI beyond the per-watch tier control in FR-012 — deferred to a follow-up plan.
- `renderAgentsHubPage` (`throughline-app.js:5433`) — its connection to the Watch/Workflow data model is unresolved (see proposal.md Open Questions); not ported by this plan.
- Production-grade rollback/revert framework per Workflow action type — out of scope for this plan; PD-2's existing gate/approval mechanism is reused as-is.
- Reconciling this plan's `WatchProperties`/`WorkflowProperties` shape against the Common Worker Layer working group's not-yet-published contract artifact — tracked in design.md's Shape Reconciliation note, not resolved here.
