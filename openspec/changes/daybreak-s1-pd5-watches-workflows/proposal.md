---
change_id: daybreak-s1-pd5-watches-workflows
status: draft
created_at: 2026-07-10
treadmill_artifact_version: 1
feature_id: f943d973-90ab-4834-8e7f-d7fed23afe31
feature_slug: daybreak-s1-alert-analysis-worker-spike
---
# PD-5: Watches + Workflows — server persistence and UI port

## Why
PD-4 ports the Throughline prototype's triage surfaces (thread view, brief dashboard, gate flow) so an analyst can *observe* worker output, but there is nothing yet that lets an analyst *configure* what gets triaged. The prototype's `WATCHES`/`WORKFLOWS` arrays (`throughline-app.js:2474`, `:2546`) model exactly that: a Watch is a standing monitoring unit over alerts/streams, and Workflows are the trigger→skill→outcome pipelines assigned to it. Without a real port, the analyst can review a Proposal but cannot define the standing mandate that produced it — the "set up a watch" capability the design prototype demonstrates has no backing implementation. This plan builds that persistence and UI layer as a direct follow-up to PD-4, reusing PD-2's Evidence/Proposal store pattern and PD-4's theme/shell/HTTP-client conventions rather than inventing new ones.

## What Changes
- **`WatchClient` server persistence** — a new `server/client/watch/` module (`types.ts`, `client.ts`, `storage.ts`, `errors.ts`) mirroring PD-2's `server/client/proposals/` shape: space-scoped ES documents, a `create*Client({ space, logger, esClient })` factory, and the `createSpaceFilter(space)` helper reused verbatim from `server/client/proposals/client.ts:62`.
- **`WorkflowClient` server persistence** — a parallel `server/client/workflow/` module for `WorkflowProperties` records, including the many-to-many `watchIds[]` linkage the prototype's `WORKFLOWS.watches` field models (`throughline-app.js:2545-2559`).
- **HTTP routes** — `server/http_routes/watch.ts` and `server/http_routes/workflow.ts`, each a `register*Routes({ logger, router, getSpaceId })` module added to the existing `registerRoutes` aggregator (`server/http_routes/index.ts:16-18`), using `daybreakRouteSecurity` and the shared `wrap_handler.ts` per PD-4's shipped convention.
- **Typed browser clients + hooks** — `public/services/watches_service.ts` / `public/hooks/use_watches.ts` and `public/services/workflows_service.ts` / `public/hooks/use_workflows.ts`, following the browser-local-type + React Query shape PD-4 shipped for `proposals_service.ts` / `use_proposals.ts`.
- **Watches list + detail UI** — port `renderWatchesPage` (card grid, "New watch" tile, active/paused/draft summary) and `renderWatchDetail` (mandate, stats, autonomy-tier control, surface toggles, skills list, recent-activity table) from `throughline-app.js:5541-5710`, backed by real `WatchClient` data via PD-4's `theme.ts`/shell conventions once those land.
- **Workflows list UI** — port `renderWorkflowsPage` / `watchWorkflowRow` (`throughline-app.js:5553-5580`): one trigger→skill→outcome pipeline strip per Workflow, with an on/off switch and a watch-assignment footer.
- **Demo-vs-reality edge cases resolved as real behaviour, not left as prototype gaps** (per `clarification-decisions.md`, PRD-level decisions the static demo hides):
  - Conflict resolution when two Workflows target the same alert — priority-ordered, audit-logged, never silent-first-wins.
  - Watch deactivation mid-investigation — in-flight Workflow runs complete; no new runs are scheduled.
  - Watch deletion safety — fail-closed 422 when active runs or open Proposals exist in the last 24h, reusing PD-2's `requireReadinessGate` shape; compensating `watchIds[]` pruning on successful deletion (no orphaned Workflow references).
  - Concurrent edits — optimistic concurrency via an `updatedAt` version tag; a stale-version PUT returns 409, not silent last-writer-wins.
- **Autonomy/gating** — Workflow-triggered actions reuse PD-2's `evaluateReadinessGate`/`requireReadinessGate` verbatim (auto-run / proposed-diff / approval-required); this plan does not re-implement a gate.

## Impact
- Adds two new server persistence modules, two new HTTP route modules, two new browser service/hook pairs, and two new UI pages to the `daybreak` plugin.
- Hard dependency on PD-4's `theme.ts` token system and app shell landing first for visual fidelity; if `theme.ts` has not landed when this plan's UI tasks dispatch, the pages are built against plain EUI first (matching PD-4's own `shell.tsx` precedent) and re-themed once it does — no plan-level blocker either way.
- Establishes the second (of at least three: Proposal/Evidence, Watch/Workflow, and whatever the Common Worker Layer working group's forthcoming contract adds) space-scoped store pattern in the plugin, reinforcing `createSpaceFilter` as the shared idiom rather than a one-off.
- Runs on the same feature worktree/branch as PD-4 (`ao/feat-daybreak-s1-alert-analysis-worker-spike`), as a `parentPlanId` follow-up — no new worktree, no separate PR chain.

## Open Questions
- **Route topology** — do Watches/Workflows get their own top-level `<Route>` entries in `routes.tsx`, or live inside the existing single-page shell via internal tab/rail-selection state (mirroring the prototype's `state.watchSel` list↔detail toggle)? Not resolved in shipped PD-4 code as of this plan; a design-wave decision for the implementing task.
- **AgentsHub scope** — `renderAgentsHubPage` (`throughline-app.js:5433`) was cited in earlier scoping but is not clearly connected to the Watches/Workflows data model; deferred out of this plan's task list pending a decision, tracked as a follow-up rather than silently dropped.
- **Common Worker Layer contract convergence** — see design.md's Shape Reconciliation note; this plan's `WatchProperties`/`WorkflowProperties` shapes were derived independently of the CWL working group's not-yet-published contract artifact and may need reconciliation once that lands.

## Suggested Enhancements (not in original description)
- **(suggested)** Once the CWL contract artifact exists under `project-daybreak/docs/working-groups/common-worker-layer/artifacts/`, diff it against this plan's `WatchProperties`/`WorkflowProperties` shapes and file a reconciliation follow-up rather than assuming convergence.
