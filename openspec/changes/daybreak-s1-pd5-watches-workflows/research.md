---
change_id: daybreak-s1-pd5-watches-workflows
status: draft
created_at: 2026-07-10
treadmill_artifact_version: 1
research_topic: Watches/Workflows prototype surfaces vs. PD-4's shipped app-shell/HTTP/store patterns to port from
feature_id: f943d973-90ab-4834-8e7f-d7fed23afe31
feature_slug: daybreak-s1-alert-analysis-worker-spike
---
# Research: PD-5 Watches + Workflows surfaces ported into the daybreak plugin

## Research Question
Does the repository (the Throughline prototype vendored at
`docs-site/prototype/` in `project-daybreak`, plus PD-2/PD-4's shipped
daybreak plugin code on `origin/daybreak-spike` and the in-progress PD-4
worktree on `worker-m1max`) actually contain the surfaces, data shapes, and
reusable patterns the PD-5 description assumes — the Watches/Workflows
prototype pages, PD-2's Evidence/Proposal store pattern to mirror, and PD-4's
theme/app-shell/typed-HTTP-client pattern to reuse?

## Summary
Mostly yes, with one scope caveat. The Throughline prototype's four target
functions (`renderWatchesPage`, `renderWatchDetail`, `renderWorkflowsPage`,
`renderAgentsHubPage`) and the `WATCHES`/`WORKFLOWS` demo arrays all exist
exactly where the description says, in `project-daybreak`'s
`docs-site/prototype/throughline-app.js`. PD-4's server-store/HTTP-route/
typed-client pattern (space-scoped ES client → thin route wrapper →
browser-local response type → React Query hook) is fully shipped and
directly repeatable for `watch`/`workflow`. The one gap: PD-4's `theme.ts`
token system that PD-5's description says to reuse does **not exist yet** —
it is still two `ready` (undispatched) tasks in the PD-4 plan as of this
research pass, so PD-5's design wave must either wait on it or fall back to
plain EUI (as PD-4's own shipped `shell.tsx` already does, pending the
prototype port).

## Detailed Findings

### 1. The four target prototype surfaces exist at the cited line numbers, in `project-daybreak`
The PD-5 description's SURFACES line cites `renderWatchesPage (:5541)`,
`renderWatchDetail (:5661)`, `renderWorkflowsPage (:5577)`,
`renderAgentsHubPage (:5433)` in `docs-site/prototype/throughline-app.js`.
All four resolve at those exact lines in the `project-daybreak` repo (not
the Kibana repo — the prototype is vendored in a separate repository from
the daybreak plugin code). `renderWatchesPage` shows a card grid over
`WATCHES` with a "New watch" tile and a status summary (active/paused/
draft counts); when `state.watchSel` is set it delegates to
`renderWatchDetail`, which renders a single watch's mandate, stats
(runs/accepted/time-saved), an autonomy-level slider, surface toggles
(NotDaybreak/NightShift), a skills list, and a recent-activity table.
`renderWorkflowsPage` renders one `watchWorkflowRow` per `WORKFLOWS` entry —
a trigger→skill→outcome pipeline strip with an on/off switch and an "also
runs on" watch-assignment footer.

### 2. WATCHES and WORKFLOWS are static demo arrays exactly as the description states — confirms the "key gap"
`WATCHES` (`throughline-app.js:2474-2540`) is a 6-element array (`floor`,
`officer`, `dark`, `deep`, `fraud`-draft) with fields: `id`, `name`, `color`,
`icon`, `on`, `mandate`, `surfaces`, `desc`, `window`, `cadence`, `handoff`,
`sched` (nested schedule object: `mode`, `from`/`to`, `onDemand`, `cadence`,
`every`, `handoff`), `scope`, `scopes` (tuple array of
`[label, accessLevel, accessLabel]`), `skills`, `runs`/`acc`/`saved`/`last`
(stat strings), `coverage` (hour-range tuples), `recent` (activity-log
entries: `time`/`src`/`act`/`what`/`out`). `WORKFLOWS`
(`throughline-app.js:2545-2559`) is a 14-element array with: `id`, `name`,
`tt` (trigger type: `event`|`sched`), `trig`, `skill`, `out`, `on`,
`last`, `watches` (array of watch ids this workflow is assigned to),
optional `gated`, `surface`. The many-to-many `watches` linkage on each
workflow (rather than a `workflow_ids` array on watch) is the shape a
server `WorkflowClient.listByWatch` / `WatchClient` pair should mirror.

### 3. PD-2's Evidence/Proposal store pattern is a complete, repeatable template — confirmed on `origin/daybreak-spike` (also present, further extended, in the in-progress PD-4 worktree on `worker-m1max`)
The description says a real port "MUST build server persistence mirroring
PD-2's Evidence/Proposal pattern." That pattern is: (a) a `types.ts` /
`storage.ts` pair defining the ES-document shape and a space field; (b) a
`client.ts` exporting a `create*Client({ space, logger, esClient })`
factory whose methods build ES queries filtered through a
`createSpaceFilter(space) = { term: { space } }` helper prepended to every
query's filter clauses; (c) an `errors.ts` for typed domain errors. This is
directly reusable for `watch`/`workflow`: `createSpaceFilter` is a
one-line, copy-paste-stable helper (`server/client/proposals/client.ts:62`)
already used identically in two ES-query call sites in that file
(`:92`, `:263`) and in the sibling `evidence/` module.

### 4. PD-4 has already shipped the exact HTTP-route wrapper pattern PD-5's description asks to reuse — one layer, fully generalizable
PD-4 (in progress on `worker-m1max`, not yet merged) added
`server/http_routes/{proposals,evidence}.ts`, each exporting a
`register*Routes({ logger, router, getSpaceId }: RouteDependencies)`
function that: builds a per-request scoped store client via
`getScopedClient(ctx, request)` (pulling `elasticsearch.client.asCurrentUser`
from the request context and the resolved space id), then registers
`router.get`/`router.post` handlers with `@kbn/config-schema` validation,
`security: daybreakRouteSecurity` (`server/http_routes/types.ts:17`),
`options: { access: 'internal' }`, and a shared `wrapHandler` from
`server/http_routes/wrap_handler.ts` for consistent error handling. Both
route modules are aggregated in `server/http_routes/index.ts:16-18`
(`registerRoutes` calling `registerProposalRoutes` then
`registerEvidenceRoutes`), which is called from `plugin.ts`'s `setup()`.
PD-5's `server/http_routes/{watch,workflow}` deliverable is a direct
structural clone of this: two more `register*Routes` calls added to the
same `registerRoutes` aggregator, using the same `RouteDependencies` type
and `daybreakRouteSecurity` security policy.

### 5. PD-4's typed-HTTP-client + React-Query-hook pattern is shipped and reusable — but note the "browser-local type" convention
The description says PD-5's watch/workflow persistence should mirror the
PD-2 pattern; on the `public/` side, PD-4 already shipped the parallel
convention PD-5's watch/workflow UI should reuse: a thin
`services/proposals_service.ts` class wrapping `HttpSetup` (`http.get`/
`http.post` against `daybreakApiPath` from `common/http_api.ts:12`), with
its own `DaybreakProposal` interface deliberately re-declared as a
"browser-local type rather than importing from `server/client/proposals/
types`" specifically "to preserve the public/server boundary." A
`hooks/use_proposals.ts` then wraps that service in a `useQuery` (React
Query) call keyed `['daybreak', 'proposals']`, returning
`{ proposals, isLoading, refresh }`. A `WatchesService`/`useWatches` and
`WorkflowsService`/`useWorkflows` pair should follow the identical shape.

### 6. PD-4's app shell is EUI-only today — no ported prototype markup and no `theme.ts` yet; both are open PD-4 work
The description's DEPENDENCIES line says PD-5 "reuses PD-4's theme.ts token
system, app shell, and typed HTTP client/hooks pattern." As shipped so far
on `worker-m1max`, `public/application/components/shell.tsx` is
**explicitly documented in its own header comment** as "a design-neutral
EUI implementation, not a port of the Throughline (NotDaybreak) prototype:
the prototype source ... is unavailable in this repository and git
history ... Once vendored, this shell's markup/structure should be
replaced 1:1 with the ported prototype components." A `theme.ts` file does
not exist anywhere under
`x-pack/solutions/security/plugins/daybreak/public/` on the PD-4 worktree
as of this research pass; the two PD-4 tasks that would create it
(`2-3-new-test-in-theme-test-ts-...`, `2-3-token-eui-mapping-table-exists-
beside-theme-ts-...`) are still in `ready` (undispatched) status. PD-5's
design wave has two options: (a) block on PD-4's theme tasks landing
first, or (b) build watch/workflow UI against plain EUI now (matching
`shell.tsx`'s current precedent) and re-theme later when `theme.ts` lands.
The typed-HTTP-client/hooks half of the dependency claim is fully
satisfied today (Finding 5); only the `theme.ts` half is not yet real.

### 7. The app shell's single-route pattern (`routes.tsx` + `mount.tsx`) is the integration point for new Watches/Workflows pages
`public/application/routes.tsx` renders exactly one route (`/` exact →
`<DaybreakShell />`), wired up in `public/application/mount.tsx` via
`@kbn/shared-ux-router`'s `<Router>`/`<Routes>` inside a
`KibanaContextProvider` + `QueryClientProvider`. Adding Watches/Workflows
pages means either extending this single-page shell with internal
tab/rail-selection state (matching the prototype's `state.watchSel`-driven
list↔detail toggle pattern, `throughline-app.js:5542-5543`) or adding
sibling `<Route>` entries — a design-wave decision, not yet resolved in
code.

### 8. Config/registration gate is a single boolean; no separate flag is needed for PD-5
`common/config.ts:16-19` defines a single `enabled: schema.boolean({
defaultValue: false })` config schema gating the whole plugin (not a
per-surface flag). `server/index.ts` exposes this to the browser via
`exposeToBrowser: { enabled: true }`, and the public plugin's
`core.application.register` call is itself gated on that same flag
(per PD-4's `2-3-token-eui-mapping...`-adjacent FR-009 work,
`public/plugin.ts`). PD-5 does not need a new flag; watch/workflow
routes register unconditionally once the existing `xpack.daybreak.enabled`
flag is on, the same as proposals/evidence.

## Code References
- `project-daybreak:docs-site/prototype/throughline-app.js:2474-2540` — `WATCHES` demo array; the full field shape (schedule, scopes, stats, recent-activity log) a server `Watch` document and browser type must cover.
- `project-daybreak:docs-site/prototype/throughline-app.js:2545-2559` — `WORKFLOWS` demo array; the trigger/skill/outcome/`watches`-assignment shape a server `Workflow` document must cover.
- `project-daybreak:docs-site/prototype/throughline-app.js:5541-5552` — `renderWatchesPage`; card-grid + "New watch" tile + active/paused/draft summary, the Watches list page to port.
- `project-daybreak:docs-site/prototype/throughline-app.js:5661-5710` — `renderWatchDetail` (excerpt); identity/autonomy/surface-toggle detail page to port.
- `project-daybreak:docs-site/prototype/throughline-app.js:5577-5580` — `renderWorkflowsPage`; renders `watchWorkflowRow` per workflow.
- `project-daybreak:docs-site/prototype/throughline-app.js:5553-5576` — `watchWorkflowRow`; trigger→skill→outcome pipeline strip + watch-assignment footer, the Workflows list-row component to port.
- `origin/daybreak-spike:x-pack/solutions/security/plugins/daybreak/server/client/proposals/client.ts:62` — `createSpaceFilter(space)` helper; the one-line space-scoping pattern to reuse verbatim for `WatchClient`/`WorkflowClient`.
- `worker-m1max (PD-4, uncommitted):x-pack/solutions/security/plugins/daybreak/server/http_routes/proposals.ts:33-40` — `registerProposalRoutes({ logger, router, getSpaceId })` signature and `getScopedClient` pattern to clone for `registerWatchRoutes`/`registerWorkflowRoutes`.
- `worker-m1max (PD-4, uncommitted):x-pack/solutions/security/plugins/daybreak/server/http_routes/index.ts:9-18` — `registerRoutes` aggregator calling `registerProposalRoutes` + `registerEvidenceRoutes`; PD-5 adds two more calls here.
- `worker-m1max (PD-4, uncommitted):x-pack/solutions/security/plugins/daybreak/common/http_api.ts:12` — `daybreakApiPath = '/api/daybreak'`; the base path new watch/workflow routes and the browser HTTP client both hang off.
- `worker-m1max (PD-4, uncommitted):x-pack/solutions/security/plugins/daybreak/public/services/proposals_service.ts:1-60` — `ProposalsService` + browser-local `DaybreakProposal` type; the typed-HTTP-client pattern PD-5's `WatchesService`/`WorkflowsService` should mirror, including the deliberate "browser-local type, not imported from server" convention.
- `worker-m1max (PD-4, uncommitted):x-pack/solutions/security/plugins/daybreak/public/application/hooks/use_proposals.ts:1-31` — `useProposals` React Query hook shape (`queryKey`, `isLoading`, `refetch`→`refresh`) to mirror for `useWatches`/`useWorkflows`.
- `worker-m1max (PD-4, uncommitted):x-pack/solutions/security/plugins/daybreak/public/application/components/shell.tsx:24-34` — header comment explicitly stating the shell is EUI-only pending the prototype port; the authoritative source for Finding 6 (no ported prototype markup exists yet).
- `worker-m1max (PD-4, uncommitted):x-pack/solutions/security/plugins/daybreak/public/application/routes.tsx:1-18` — single-route `DaybreakRoutes` definition; the integration point for new Watches/Workflows pages.
- `worker-m1max (PD-4, uncommitted):x-pack/solutions/security/plugins/daybreak/public/application/mount.tsx:1-53` — `mountApp`; `KibanaContextProvider`/`QueryClientProvider`/`Router` wiring new pages must nest inside.
- `worker-m1max (PD-4, uncommitted):x-pack/solutions/security/plugins/daybreak/common/config.ts:16-19` — single `enabled` config flag; confirms no new PD-5-specific feature flag is needed.
- (PD-4 plan, `plan_tasks` table) `2-3-new-test-in-theme-test-ts-asserts-daybreakthem-17` and `2-3-token-eui-mapping-table-exists-beside-theme-ts-18` — both `ready`/undispatched as of this research pass; the concrete evidence that `theme.ts` (Finding 6's dependency gap) is not yet shipped.

## Open Questions
- **Blocking-vs-parallel on PD-4's `theme.ts`**: should PD-5's design wave wait for PD-4 tasks `2-3-*-theme-*` to land before styling watch/workflow components, or proceed against plain EUI now (matching `shell.tsx`'s current precedent) and re-theme later? Not resolved in code; a design-wave decision.
- **Route topology**: does Watches/Workflows get its own top-level `<Route>` entries alongside `/` in `routes.tsx`, or does it live inside the existing single-page shell via internal tab state (mirroring the prototype's `state.watchSel` list↔detail toggle)? Not resolved in shipped PD-4 code.
- **`AgentsHubPage`**: the description's SURFACES line cites `renderAgentsHubPage (:5433)` but the rest of the description (GOAL, DATA MODELS, NON-GOALS) never mentions an "Agents Hub" concept — it is not clear whether this is in scope for PD-5 or was included by copy-paste from the roadmap doc. Flagging rather than assuming; the operator's captured idea (`2026-07-09-project-daybreak-throughline-full-prototype-roadma`) may resolve this but was not available to read in this pass.
- **Deletion-safety / orphaned-reference mechanics**: the description's KNOWN GAPS item (4) — "orphaned workflow references when a watch is deleted" — has no existing code pattern to ground against (PD-2's stores have no delete-with-cascade precedent); this is genuinely new design work for the specs wave, not a research gap.
