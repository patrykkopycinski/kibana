# Tasks

## Phase 0: Foundations & Prerequisites

#### 1.1 Explore PD-2's store pattern, PD-4's route/client pattern, and confirm the prototype's Watches/Workflows shape

**File**: `.ao/recon.md`

**Intent**: Every downstream contract in this plan asserts behaviour against PD-2's `server/client/proposals/` module and PD-4's `server/http_routes/`/`public/services/` conventions — both must be re-verified as still-current before new code copies their shape, since PD-4 may still be in flight when this plan's tasks dispatch.

**Contract** (document section claims — all machine-greppable in `.ao/recon.md`):
- Section "Store pattern anchors" records the verified locations of: `server/client/proposals/types.ts`, `server/client/proposals/client.ts` (`createSpaceFilter` at `:62`, reused at `:92`/`:263`), `server/client/proposals/storage.ts`, `server/client/proposals/errors.ts` (research.md §3).
- Section "Route/client pattern anchors" records: `server/http_routes/index.ts` (`registerRoutes` aggregator, `:16-18`), `server/http_routes/types.ts` (`daybreakRouteSecurity`, `:17`), `server/http_routes/wrap_handler.ts`, `public/services/proposals_service.ts`, `public/application/hooks/use_proposals.ts` (research.md §4–§5).
- Section "PD-4 theme status" records whether `public/application/theme/theme.ts` exists on the worktree yet (research.md §6) — determines whether 4.x/5.x UI tasks build against real tokens or plain EUI as an interim (falls back per design.md §"Approach").
- Section "Prototype anchors" records the current line numbers (may drift from research.md's citations if the prototype is re-vendored) for `WATCHES`, `WORKFLOWS`, `renderWatchesPage`, `renderWatchDetail`, `renderWorkflowsPage`, `watchWorkflowRow` in `docs-site/prototype/throughline-app.js`.

**Traces**: (infrastructure)

---

## Phase 1: Server Persistence — WatchClient & WorkflowClient

#### 2.1 `WatchClient` types, storage, and space-scoped client

**File**: `x-pack/solutions/security/plugins/daybreak/server/client/watch/`

**Intent**: A real, space-scoped ES-backed store for `WatchProperties`, structurally identical to `server/client/proposals/` so a future third store (workflow, or whatever CWL's contract adds) has one idiom to follow, not two.

**Contract**:
```typescript
// server/client/watch/types.ts
export interface WatchSchedule {
  window: string;
  cadence: string;
  handoff: string;
  coverage: Array<[number, number]>; // hour-range tuples
}
export interface WatchProperties {
  id: string;
  space: string;
  name: string;
  description: string;
  surface: string;
  sched: WatchSchedule;
  autonomyTier: 'auto-run' | 'proposed-diff' | 'approval-required';
  skillIds: string[];
  workflowIds: string[];
  status: 'active' | 'paused' | 'draft';
  createdAt: string;
  updatedAt: string;
}

// server/client/watch/client.ts — createSpaceFilter reused verbatim from
// server/client/proposals/client.ts:62, not re-implemented.
export declare function createWatchClient(params: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
}): WatchClient;
export interface WatchClient {
  get(id: string): Promise<WatchProperties | null>;
  list(): Promise<WatchProperties[]>;
  create(input: Omit<WatchProperties, 'id' | 'createdAt' | 'updatedAt'>): Promise<WatchProperties>;
  update(id: string, input: Partial<WatchProperties>, expectedUpdatedAt: string): Promise<WatchProperties>; // 409 on stale expectedUpdatedAt (FR-021)
  delete(id: string): Promise<void>; // throws ReadinessGateError-shaped error when active runs/open Proposals exist (FR-018)
}
```

**Traces**: FR-001, FR-002, FR-003

#### 2.2 `WorkflowClient` types, storage, and space-scoped client

**File**: `x-pack/solutions/security/plugins/daybreak/server/client/workflow/`

**Intent**: Parallel store for `WorkflowProperties`, sharing the same `createSpaceFilter` idiom as `WatchClient` — one space-scoping helper reused across both new stores.

**Contract**:
```typescript
// server/client/workflow/types.ts
export interface WorkflowProperties {
  id: string;
  space: string;
  name: string;
  triggerType: 'event' | 'sched';
  trigger: string;
  skillId: string;
  outcome: string;
  gated: boolean;
  surface: string;
  watchIds: string[];
  enabled: boolean;
  lastRunAt: string | null;
  priority: number; // conflict-resolution ordering (FR-016)
}

// server/client/workflow/client.ts
export declare function createWorkflowClient(params: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
}): WorkflowClient;
export interface WorkflowClient {
  get(id: string): Promise<WorkflowProperties | null>;
  list(): Promise<WorkflowProperties[]>;
  listByWatch(watchId: string): Promise<WorkflowProperties[]>;
  create(input: Omit<WorkflowProperties, 'id'>): Promise<WorkflowProperties>;
  update(id: string, input: Partial<WorkflowProperties>): Promise<WorkflowProperties>;
  pruneWatchReference(watchId: string): Promise<void>; // compensating update on Watch delete (FR-019)
}
```

**Traces**: FR-005, FR-006

#### 2.3 Watch audit-log store (reuses `DecisionHistoryEntry` shape)

**File**: `x-pack/solutions/security/plugins/daybreak/server/client/watch/audit_log.ts`

**Intent**: Workflow runs, status transitions, and autonomy changes must be recorded per-watch for the activity surface (FR-012) and for the conflict-resolution/lifecycle edge cases (FR-016, FR-017, FR-020) to be provable, not just implemented.

**Contract**:
```typescript
export interface WatchAuditEntry {
  watchId: string;
  timestamp: string;
  kind: 'run-completed' | 'run-superseded' | 'run-completed-post-deactivation' | 'status-change' | 'autonomy-change';
  detail: string; // e.g. "superseded by workflow <id> (priority 3 > 1)"
}
export declare function appendWatchAuditEntry(client: WatchClient, entry: WatchAuditEntry): Promise<void>;
export declare function listWatchAuditEntries(client: WatchClient, watchId: string): Promise<WatchAuditEntry[]>;
```

**Traces**: FR-004

### Verification:

#### Automated:
- [ ] 2.1 `test -f x-pack/solutions/security/plugins/daybreak/server/client/watch/types.ts && test -f x-pack/solutions/security/plugins/daybreak/server/client/watch/client.ts` succeeds (FR-001) @host:worker-m1max
- [ ] 2.1 `grep -q "createSpaceFilter" x-pack/solutions/security/plugins/daybreak/server/client/watch/client.ts` succeeds — reuses the PD-2 helper, does not redefine it (FR-002) @host:worker-m1max
- [ ] 2.1 New test in `watch/client.test.ts` asserts `update()` returns 409-shaped error on stale `expectedUpdatedAt` (FR-021) @host:worker-m1max
- [ ] 2.1 New test asserts `delete()` throws on a watch with an active run or open Proposal within 24h (FR-018) @host:worker-m1max
- [ ] 2.2 `test -f x-pack/solutions/security/plugins/daybreak/server/client/workflow/types.ts && test -f x-pack/solutions/security/plugins/daybreak/server/client/workflow/client.ts` succeeds (FR-005) @host:worker-m1max
- [ ] 2.2 `grep -q "createSpaceFilter" x-pack/solutions/security/plugins/daybreak/server/client/workflow/client.ts` succeeds (FR-006) @host:worker-m1max
- [ ] 2.2 New test asserts `pruneWatchReference(watchId)` removes `watchId` from every referencing Workflow's `watchIds[]` (FR-019) @host:worker-m1max
- [ ] 2.3 New test asserts `listWatchAuditEntries` returns entries in chronological order after `appendWatchAuditEntry` calls (FR-004) @host:worker-m1max
- [ ] 2.1–2.3 phase-1 type_check: `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-001, FR-002, FR-005, FR-006) @host:worker-m1max
- [ ] 2.1–2.3 phase-1 eslint: `node scripts/eslint --fix $(git diff --name-only HEAD)` passes @host:worker-m1max

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 2: Demo-vs-Reality Edge Cases

#### 3.1 Conflict resolution: priority-ordered Workflow dispatch

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow_dispatch/resolve_conflict.ts`

**Intent**: When two enabled Workflows target the same alert, the higher-`priority` one runs and the lower is recorded as superseded — never silent first-wins (clarification Q4).

**Contract**:
```typescript
export declare function resolveWorkflowConflict(
  candidates: WorkflowProperties[]
): { toRun: WorkflowProperties[]; superseded: WorkflowProperties[] };
// candidates with equal max priority all run (independent skills);
// every non-run candidate is written to the audit log as 'run-superseded' via 2.3's appendWatchAuditEntry.
```

**Traces**: FR-016

#### 3.2 Lifecycle: in-flight runs survive deactivation

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow_dispatch/deactivate_watch.ts`

**Intent**: Deactivating a Watch stops new triggers immediately but must not kill an in-flight Workflow run — orphaned Proposals and lost evidence context are worse than letting the run finish (clarification Q5).

**Contract**:
```typescript
export declare function deactivateWatch(client: WatchClient, watchId: string): Promise<void>;
// sets status: 'paused' immediately; does not cancel any in-progress workflow execution;
// the run's natural completion appends a 'run-completed-post-deactivation' audit entry (2.3).
```

**Traces**: FR-017

#### 3.3 Autonomy-change semantics: next-trigger only, no retroactive downgrade

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow_dispatch/change_autonomy.ts`

**Intent**: Promoting/demoting a Watch's autonomy tier must not mid-flip an already-running action; the new tier applies starting the next triggered event (clarification Q7).

**Contract**:
```typescript
export declare function changeWatchAutonomy(
  client: WatchClient,
  watchId: string,
  newTier: WatchProperties['autonomyTier']
): Promise<void>;
// an in-flight action started under the old tier completes under the old tier (audited via 2.3);
// retroactive downgrade of an in-flight action is a no-op / explicit rejection, not silently applied.
```

**Traces**: FR-020

### Verification:

#### Automated:
- [ ] 3.1 New test asserts `resolveWorkflowConflict` picks the single highest-priority candidate and marks the rest superseded, or runs all tied-max candidates (FR-016) @host:worker-m1max
- [ ] 3.2 New test asserts `deactivateWatch` sets `status: 'paused'` without touching an in-progress run's execution state (FR-017) @host:worker-m1max
- [ ] 3.3 New test asserts an in-flight action retains its original autonomy tier after `changeWatchAutonomy` is called mid-run (FR-020) @host:worker-m1max
- [ ] 3.1–3.3 phase-2 type_check: `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-016, FR-017, FR-020) @host:worker-m1max
- [ ] 3.1–3.3 phase-2 eslint: `node scripts/eslint --fix $(git diff --name-only HEAD)` passes @host:worker-m1max

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 3: HTTP Routes & Typed Browser Clients

#### 4.1 `registerWatchRoutes` / `registerWorkflowRoutes`

**File**: `x-pack/solutions/security/plugins/daybreak/server/http_routes/watch.ts`, `.../workflow.ts`

**Intent**: Clone PD-4's shipped `registerProposalRoutes` shape exactly — same `RouteDependencies`, same security policy, same aggregator wiring — so the routing layer has one convention across three domains (Proposal, Watch, Workflow).

**Contract**:
```typescript
// server/http_routes/watch.ts
export declare function registerWatchRoutes(deps: RouteDependencies): void;
// GET  /api/daybreak/watches         → list
// GET  /api/daybreak/watches/{id}    → get
// POST /api/daybreak/watches         → create
// PUT  /api/daybreak/watches/{id}    → update (422 on stale updatedAt → FR-021; 422 missingRequirements on delete-guard → FR-018)
// DELETE /api/daybreak/watches/{id}  → delete
// all handlers: daybreakRouteSecurity, options.access: 'internal', wrapped by wrap_handler.ts

// server/http_routes/workflow.ts — same shape for /api/daybreak/workflows

// server/http_routes/index.ts — two more calls added to registerRoutes():
//   registerWatchRoutes(deps); registerWorkflowRoutes(deps);
```

**Traces**: FR-007, FR-008

#### 4.2 `WatchesService`/`useWatches` and `WorkflowsService`/`useWorkflows`

**File**: `x-pack/solutions/security/plugins/daybreak/public/services/watches_service.ts`, `public/application/hooks/use_watches.ts` (+ workflow pair)

**Intent**: Clone PD-4's `proposals_service.ts` / `use_proposals.ts` shape: a thin `HttpSetup`-wrapping service with a browser-local response type, wrapped by a React Query hook.

**Contract**:
```typescript
// public/services/watches_service.ts
export interface DaybreakWatch { /* browser-local, re-declared per public/server boundary convention — not imported from server/client/watch/types */ }
export declare class WatchesService {
  constructor(http: HttpSetup);
  list(): Promise<DaybreakWatch[]>;
  get(id: string): Promise<DaybreakWatch>;
  update(id: string, input: Partial<DaybreakWatch>, expectedUpdatedAt: string): Promise<DaybreakWatch>; // surfaces 409 to the hook
  delete(id: string): Promise<void>; // surfaces 422 missingRequirements to the hook
}

// public/application/hooks/use_watches.ts
export declare function useWatches(): { watches: DaybreakWatch[]; isLoading: boolean; refresh: () => void };
export declare function useWatch(id: string): { watch: DaybreakWatch | undefined; isLoading: boolean; refresh: () => void };
```

**Traces**: FR-009, FR-010

### Verification:

#### Automated:
- [ ] 4.1 `grep -rn "router\.\(get\|post\|put\|delete\)" x-pack/solutions/security/plugins/daybreak/server/http_routes/watch.ts` returns 5 routes (FR-007) @host:worker-m1max
- [ ] 4.1 `grep -q "registerWatchRoutes\|registerWorkflowRoutes" x-pack/solutions/security/plugins/daybreak/server/http_routes/index.ts` succeeds (FR-007) @host:worker-m1max
- [ ] 4.1 `grep -q "422" x-pack/solutions/security/plugins/daybreak/server/http_routes/watch.ts` succeeds — delete-guard and stale-version paths surfaced (FR-018, FR-021) @host:worker-m1max
- [ ] 4.2 New test asserts `WatchesService.delete()` on a 422 response surfaces `missingRequirements` to the caller, not a generic error (FR-018) @host:worker-m1max
- [ ] 4.2 `node scripts/jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js public/services public/application/hooks` passes (FR-009, FR-010) @host:worker-m1max
- [ ] 4.1–4.2 phase-3 type_check: `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-007, FR-008, FR-009, FR-010) @host:worker-m1max
- [ ] 4.1–4.2 phase-3 eslint: `node scripts/eslint --fix $(git diff --name-only HEAD)` passes @host:worker-m1max

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 4: Watches & Workflows UI

#### 5.1 Watches list page (`renderWatchesPage` port)

**File**: `x-pack/solutions/security/plugins/daybreak/public/application/components/watches/watches_list.tsx`

**Intent**: Port the prototype's card-grid + "New watch" tile + status summary (`throughline-app.js:5541-5552`) against real `useWatches()` data. Falls back to plain EUI if PD-4's `theme.ts` has not landed by dispatch time (per design.md §"Approach"; recon 1.1 records current status).

**Contract**:
```typescript
// card grid over useWatches().watches; "New watch" tile opens creation flow;
// summary counts computed from watch.status ('active' | 'paused' | 'draft');
// empty state ('No workflows assigned...' etc. for detail page, not list) is FR-014's concern, not this task's.
```

**Traces**: FR-011

#### 5.2 Watch detail page (`renderWatchDetail` port)

**File**: `x-pack/solutions/security/plugins/daybreak/public/application/components/watches/watch_detail.tsx`

**Intent**: Port mandate/stats/autonomy-control/surface-toggles/skills-list/recent-activity (`throughline-app.js:5661-5710`), including the coverage-strip visualization and the three explicit empty states.

**Contract**:
```typescript
// coverage strip: overlapping windows render as a distinct 'double-covered' segment,
//   gaps render as visibly uncovered — never silently reconciled (FR-013);
// empty states (assertable via toBeVisible()):
//   no runs: "This watch hasn't fired yet. Configured trigger: {trigger}."
//   no workflows: "No workflows assigned. Assign one to start monitoring."
//   no coverage: "No schedule window covers the current time. The watch is dormant."
// recent-activity table sourced from useWatch(id) + the audit-log endpoint (2.3/4.1).
```

**Traces**: FR-012, FR-013, FR-014

#### 5.3 Workflows list page (`renderWorkflowsPage` / `watchWorkflowRow` port)

**File**: `x-pack/solutions/security/plugins/daybreak/public/application/components/workflows/workflows_list.tsx`

**Intent**: Port one trigger→skill→outcome pipeline strip per `useWorkflows()` record, with an on/off switch and a watch-assignment footer (`throughline-app.js:5553-5580`).

**Contract**:
```typescript
// one watchWorkflowRow-equivalent per WorkflowProperties record;
// on/off switch calls WorkflowsService.update(id, { enabled }) optimistically, reverts on error;
// footer lists watchIds[] resolved to watch names via useWatches().
```

**Traces**: FR-015

### Verification:

#### Automated:
- [ ] 5.1 `test -f x-pack/solutions/security/plugins/daybreak/public/application/components/watches/watches_list.tsx` succeeds (FR-011) @host:worker-m1max
- [ ] 5.1 New component test asserts the status summary counts match `active`/`paused`/`draft` fixture data (FR-011) @host:worker-m1max
- [ ] 5.2 New component test asserts all three empty-state strings render under their respective empty-fixture conditions (FR-014) @host:worker-m1max
- [ ] 5.2 New component test asserts an overlapping-coverage fixture renders a visually distinct double-covered segment (FR-013) @host:worker-m1max
- [ ] 5.3 New component test asserts the watch-assignment footer resolves `watchIds[]` to watch names, not raw ids (FR-015) @host:worker-m1max
- [ ] 5.1–5.3 `node scripts/jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js public/application/components/watches public/application/components/workflows` passes (FR-011, FR-012, FR-013, FR-014, FR-015) @host:worker-m1max
- [ ] 5.1–5.3 phase-4 type_check: `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-011, FR-012, FR-013, FR-014, FR-015) @host:worker-m1max
- [ ] 5.1–5.3 phase-4 eslint: `node scripts/eslint --fix $(git diff --name-only HEAD)` passes @host:worker-m1max

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 5: Autonomy/Gating Reuse & Wrap-up

#### 6.1 Wire Workflow-triggered actions through PD-2's readiness gate

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow_dispatch/gate_workflow_action.ts`

**Intent**: Confirm, in code, that Workflow-triggered consequential actions call the existing `evaluateReadinessGate`/`requireReadinessGate` server property directly — no parallel gate implementation.

**Contract**:
```typescript
// imports evaluateReadinessGate / requireReadinessGate from server/client/proposals/gate.ts (verbatim reuse);
// maps prototype's 3 tiers (read&gather / assemble&draft / world-changing) onto
//   ('auto-run' | 'proposed-diff' | 'approval-required') exactly as WatchProperties.autonomyTier already models.
```

**Traces**: FR-022

#### 6.2 Update the daybreak plugin README with the Watch/Workflow store pattern

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/README.md`

**Intent**: Extend PD-3's 7-hook decomposition README with a short section naming `WatchClient`/`WorkflowClient` as the second `createSpaceFilter`-based store, so a third store (whatever the CWL contract eventually adds) has two examples to follow, not one ad-hoc precedent.

**Contract**:
- New "## Watch/Workflow persistence" section names `server/client/watch/` and `server/client/workflow/`, cites `createSpaceFilter` reuse, and links to design.md's Shape Reconciliation note for the CWL-convergence caveat.

**Traces**: (documentation)

### Verification:

#### Automated:
- [ ] 6.1 New integration test asserts a Workflow's `gated: true` action is blocked without approval via the real `requireReadinessGate` call path (not a mock) (FR-022) @host:worker-m1max
- [ ] 6.1 `grep -q "evaluateReadinessGate\|requireReadinessGate" x-pack/solutions/security/plugins/daybreak/server/workflow_dispatch/gate_workflow_action.ts` succeeds — confirms reuse, not reimplementation (FR-022) @host:worker-m1max
- [ ] 6.2 `grep -q "Watch/Workflow persistence" x-pack/solutions/security/plugins/daybreak/server/workflow/README.md` succeeds (documentation) @host:worker-m1max
- [ ] 6.1 phase-5 type_check: `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-022) @host:worker-m1max
- [ ] 6.1 phase-5 eslint: `node scripts/eslint --fix $(git diff --name-only HEAD)` passes @host:worker-m1max

#### Manual:
*(none — fully machine-checkable)*
