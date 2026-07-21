As identified in research.md, PD-2's Evidence/Proposal server-persistence pattern and PD-4's HTTP-route/typed-client/app-shell conventions are the two pieces of existing infrastructure this plan builds on directly. Research.md's own research question was scoped exactly to this port (Watches/Workflows prototype surfaces vs. PD-4's shipped patterns), and its one open gap — PD-4's `theme.ts` token system not existing yet (finding #6) — is carried into Failure Modes below rather than asserted as resolved.

## Approach

This design covers PD-5: porting the Throughline prototype's `WATCHES`/`WORKFLOWS` management surfaces (`renderWatchesPage`, `renderWatchDetail`, `renderWorkflowsPage`) into the `daybreak` plugin, backed by real server persistence rather than the prototype's static demo arrays. PD-4 lets an analyst *observe* a worker's output (a Proposal); this plan lets an analyst *configure* the standing mandate (a Watch) that produces that output and the Workflows assigned to it. It is a direct follow-up plan on the same feature worktree/branch as PD-4 (`parentPlanId`), not a new worktree.

Server persistence for `WatchProperties`/`WorkflowProperties` (FR-001, FR-005) mirrors the already-shipped Evidence/Proposal store pattern research.md documents: a space-scoped client factory built around the `createSpaceFilter(space)` helper prepended to every ES query's filter clauses, at `server/client/proposals/client.ts:62` (FR-002, FR-006 — reused verbatim, not re-implemented).

HTTP routes (FR-007) reuse the wrapper pattern research.md documents at `server/http_routes/index.ts:16-18` (a `registerRoutes` aggregator calling per-domain `register*Routes({ logger, router, getSpaceId })` functions, each using `daybreakRouteSecurity` from `server/http_routes/types.ts:17` and the shared `wrap_handler.ts`), registering unconditionally under the plugin's existing single `xpack.daybreak.enabled` flag — no new PD-5-specific flag (FR-008; research.md §8).

Typed browser clients + hooks (FR-009, FR-010) reuse the convention research.md documents at `services/proposals_service.ts` / `hooks/use_proposals.ts`: a thin `HttpSetup`-wrapping service with a deliberately re-declared browser-local response type, wrapped by a React Query hook.

The Watches/Workflows UI (FR-011–FR-015) ports `renderWatchesPage`, `renderWatchDetail`, and `renderWorkflowsPage`/`watchWorkflowRow` from `throughline-app.js` (research.md §1), backed by the real `WatchClient`/`WorkflowClient` data above rather than the prototype's static arrays (clarification Q3, anti-mock decision). Five demo-vs-reality edge cases the static prototype hides are resolved as real behavioural requirements rather than left as gaps (FR-016–FR-021; clarification Q4–Q9): conflict resolution via `priority` + audit trail, in-flight-run completion on deactivation, fail-closed deletion safety, next-trigger-only autonomy changes, and optimistic-concurrency edits.

Consequential Workflow-triggered actions are gated by PD-2's existing `evaluateReadinessGate`/`requireReadinessGate` server property exactly as PD-4's Proposal approval flow uses it — this plan does not re-implement gate logic (FR-022; clarification Q15).

## Components

- **`server/client/watch/` (`types.ts`, `client.ts`, `storage.ts`, `errors.ts`)** — `WatchProperties` as a space-scoped ES document; `createWatchClient({ space, logger, esClient })` factory reusing `createSpaceFilter` verbatim (FR-001–FR-004).
- **`server/client/workflow/`** — parallel module for `WorkflowProperties`, including the many-to-many `watchIds[]` linkage the prototype's `WORKFLOWS.watches` field models (research.md §2; FR-005, FR-006).
- **`server/http_routes/watch.ts` + `server/http_routes/workflow.ts`** — `register*Routes` modules added to the existing `registerRoutes` aggregator (FR-007, FR-008).
- **`public/services/watches_service.ts` / `hooks/use_watches.ts`** and **`public/services/workflows_service.ts` / `hooks/use_workflows.ts`** — typed client + React Query hook pairs mirroring `proposals_service.ts` / `use_proposals.ts` (FR-009, FR-010).
- **Watches list page** — ports `renderWatchesPage` (`throughline-app.js:5541-5552`): card grid, "New watch" tile, active/paused/draft status summary (FR-011).
- **Watch detail page** — ports `renderWatchDetail` (`throughline-app.js:5661-5710`): mandate, stats, autonomy-tier control, surface toggles, skills list, recent-activity table, coverage strip, and the three explicit empty states (FR-012–FR-014).
- **Workflows list page** — ports `renderWorkflowsPage` / `watchWorkflowRow` (`throughline-app.js:5553-5580`): trigger→skill→outcome pipeline strip, on/off switch, watch-assignment footer (FR-015).
- **Audit log** — reuses PD-2's `DecisionHistoryEntry` shape for Watch activity (workflow runs, status transitions, autonomy changes), queryable per-watch (FR-004; clarification Q11).

## Data Model

- **`WatchProperties`**: `id`, `space`, `name`, `description`, `surface`, `sched { window, cadence, handoff, coverage }`, `autonomyTier` (`auto-run | proposed-diff | approval-required`), `skillIds[]`, `workflowIds[]`, `status` (`active | paused | draft`), `createdAt`, `updatedAt` (FR-001; clarification Q2).
- **`WorkflowProperties`**: `id`, `space`, `name`, `triggerType` (`event | sched`), `trigger`, `skillId`, `outcome`, `gated`, `surface`, `watchIds[]`, `enabled`, `lastRunAt`, `priority` (FR-005; clarification Q2, Q4).
- **Audit log entry** — reuses PD-2's `DecisionHistoryEntry` shape verbatim, scoped per-watch (FR-004).
- **Browser-local `DaybreakWatch`/`DaybreakWorkflow` types** — re-declared in the service layer rather than imported from `server/client/{watch,workflow}/types`, following the public/server boundary convention research.md documents for `DaybreakProposal` (FR-009).

## Failure Modes

- **Two enabled Workflows target the same alert** — the higher-`priority` Workflow runs; the lower is recorded "superseded" in the audit trail; equal priority runs both. No silent first-wins (FR-016; clarification Q4).
- **Watch deactivated mid-investigation** — in-flight Workflow runs complete to their natural terminal state; no new runs schedule; recorded as "run completed post-deactivation" (FR-017; clarification Q5).
- **Watch deleted with active runs or open Proposals in the last 24h** — fails closed with 422 and `missingRequirements: ['active-runs']`, reusing PD-2's `requireReadinessGate` shape; deletion only proceeds when `paused` with no in-flight runs (FR-018; clarification Q6).
- **Orphaned Workflow references after a Watch delete** — every referencing Workflow has the deleted id pruned from `watchIds[]` as a compensating update (FR-019; clarification Q6).
- **Autonomy tier promoted while a Workflow action is in flight** — the in-flight action completes under its original tier (audited); the new tier applies only to the next triggered event; retroactive downgrade is disallowed (FR-020; clarification Q7).
- **Concurrent edits to the same Watch** — optimistic concurrency via `updatedAt`; a stale-version PUT returns 409, not silent last-writer-wins (FR-021; clarification Q9).
- **`theme.ts` not yet shipped** — research.md finding #6: PD-4's token system and ported shell markup don't exist yet as of this design pass (still `ready`/undispatched PD-4 tasks). Not a hard blocker: watch/workflow UI is built against plain EUI first, matching `shell.tsx`'s current precedent, and re-themed once `theme.ts` lands (research.md open question — blocking-vs-parallel left to the implementing task).

## Alternatives Considered

- **Mocked UI data instead of real server persistence** — rejected. The prototype's `WATCHES`/`WORKFLOWS` are static demo arrays; shipping another mock would repeat the exact "demo-vs-reality" gap this plan exists to close (clarification Q3, anti-pattern #65).
- **A single unified `WatchWorkflowClient` instead of two separate modules** — rejected. Watches and Workflows are independently addressable domain objects with a many-to-many relationship (`watchIds[]`/`workflowIds[]`), matching the prototype's own array shapes (research.md §2); splitting them mirrors PD-2's one-object-per-module convention.
- **New autonomy taxonomy for Watches vs. reusing PD-2's 3-tier gate** — rejected for this plan. See Shape Reconciliation below: a competing POC introduces a 5-level scale, but this plan reuses PD-2's `evaluateReadinessGate` verbatim (FR-022) rather than inventing a second one pending a published cross-team contract.
- **Blocking PD-5's UI tasks on PD-4's `theme.ts` landing first** — rejected as a hard gate. Building against plain EUI now (matching `shell.tsx`'s shipped precedent) and re-theming later avoids a cross-plan blocking dependency; the tradeoff is a follow-up re-theming pass once `theme.ts` ships.

## Shape Reconciliation

This plan's `WatchProperties`/`WorkflowProperties` shapes (Data Model, above) were
derived independently — from the Throughline prototype's `WATCHES`/`WORKFLOWS`
demo arrays and PD-2's store pattern — not from a published cross-team contract,
because none exists yet. A parallel effort is in flight that will eventually
publish one: per the Common Worker Layer working-group sync notes
(`docs/working-groups/common-worker-layer/meetings/2026-07-09-common-worker-layer-sync.md`
in `project-daybreak`), Garrett Spong is tasked with drafting a "Watch/worker
interface POC (Kibana PR) + work plan" under that group's `artifacts/`
directory — not yet present on `origin/main` as of this design pass.

His POC (`watches_poc.md`, reviewed 2026-07-10) diverges from this plan on
three axes that a future reconciliation must address, not assume already
agree:

1. **Plugin location** — his POC targets `x-pack/platform/plugins/shared/inbox`
   (a shared/platform plugin); this plan targets
   `x-pack/solutions/security/plugins/daybreak` (this feature's existing
   plugin, per PD-2/PD-4). Only one should ultimately own the Watches surface.
2. **Autonomy taxonomy** — his POC introduces a new 5-level UI scale
   (`1 Suggest only` … `5 Acts·trusted`), explicitly flagged in his own doc as
   "map to catalog/operating-model later." This plan reuses PD-2's existing
   3-tier gate verbatim (FR-022) rather than inventing a second taxonomy.
3. **Persistence** — his POC is explicitly mock-only ("No persistence... Mock
   data + typed HTTP surface only"); this plan builds real space-scoped server
   persistence (FR-001–FR-006) per clarification Q3's anti-mock decision.

Neither shape is "correct" yet — they're two independent readings of the same
prototype pending a published CWL contract. When that contract lands under
`project-daybreak`'s `docs/working-groups/common-worker-layer/artifacts/`, it
should be diffed against both this plan's `WatchProperties`/`WorkflowProperties`
and his POC's `Watch`/`WorkerRef` types, and any divergence reconciled as an
explicit follow-up — not silently assumed to already match.
