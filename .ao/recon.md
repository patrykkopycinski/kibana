# Reconnaissance — Daybreak S1 / PD-4 Throughline UI Alignment

> Recon for plan **daybreak-s1-pd4-throughline-ui-alignment**. Scope: document
> the exact integration surface for porting the Throughline (NotDaybreak)
> prototype into a new `public/` layer of the daybreak plugin, rendering real
> PD-2 worker output (Evidence + Proposals) through prototype-faithful React
> components, gated behind a default-off experimental flag (FR-11, FR-12,
> NFR-2). This document is exploration only — no source files were modified.
> All anchors re-verified against disk on this pass.
>
> FR map: FR-11 (real Kibana UI panel rendering worker output), FR-12
> (experimental flag default-off), FR-7 (approval actions wired to the
> readiness gate), FR-4 (Evidence store HTTP API), FR-016 (gate UI:
> auto/propose/approval tiers).
>
> **NOTE:** This recon supersedes the prior `.ao/recon.md`, which documented
> the *PD-3* eval-harness spike (a different plan). The PD-3 deliverables
> (offline dataset gate, live e2e gate, eval report generator) are already
> merged on this branch and are treated as given inputs here.

---

## 0. Headline findings

### The daybreak plugin is server-only today — `public/` does not exist

`kibana.jsonc` declares `"browser": false, "server": true`
(`x-pack/solutions/security/plugins/daybreak/kibana.jsonc:12-13`). There is no
`public/` directory, no `core.application.register(...)` call, and no HTTP
router. PD-4 must flip `browser` to `true`, add a `public/` layer, and create
the HTTP API the browser will call.

### No HTTP router exists — the PD-2 store clients are unreachable from the browser

The `ProposalClient` (`server/client/proposals/client.ts:22-39`) and
`EvidenceClient` (`server/client/evidence/client.ts:22-33`) are programmatic
server-side clients with **zero callers outside their own `client/` directories**
(confirmed: `rg 'createProposalClient|createEvidenceClient'` outside `client/`
returns nothing). The workflow's Act phase calls `POST /internal/daybreak/proposals`
(`alert_analysis_worker.yaml:97`), but **that route does not exist** — the
integration tests mock `fetch` to simulate it
(`alert_analysis_worker.test.ts:356`). PD-4 must create the HTTP router and
wire these clients to real endpoints.

### The Throughline prototype is absent from the working tree and all git history

`find . -iname '*throughline*'` and `find . -type d -name 'prototype'` (excluding
`node_modules`) return nothing. There is no `docs-site/` directory. Every
prototype symbol the proposal cites (`TL_CSS`, `renderApp`, `renderInspector`,
`briefView`, `renderSuggest`, `STATUS_DOT`, `SEV`, `gate-yes`/`gate-ic`, …) is
**unverifiable until the prototype is vendored into the repo**. This is the
single largest precondition: the design cannot proceed against symbols that
cannot be read.

### `origin/daybreak-spike` does not exist on any remote

The local `daybreak-spike` branch (HEAD `37dfadf9425d`) has **no upstream
tracking** configured (`git config branch.daybreak-spike.remote` returns
empty). `git ls-remote --heads origin | grep daybreak` returns nothing — the
branch has not been pushed to the `origin` fork
(`git@github.com:patrykkopycinski/kibana.git`). It exists only locally and on
the `i9` remote (a LAN-attached worktree machine at `100.80.240.118`). Any CI
or cross-machine work that references `origin/daybreak-spike` will fail until
the branch is pushed. The three remotes are: `origin` (GitHub fork), `i9`
(Patryk's worktree host), `upstream` (elastic/kibana).

### The readiness gate (`evaluateReadinessGate`) is the approval-flow integration point

`server/client/proposals/gate.ts:62` exports `evaluateReadinessGate(proposal,
targetStatus)` — a pure function that returns `GateResult` (approved or a
structured `GateFailure` with `missingRequirements`). The throwing wrapper
`requireReadinessGate` (`gate.ts:98`) is called inside
`ProposalClientImpl.transitionStatus` (`client.ts:189`) when transitioning to
`approved`. PD-4's gate UI ("world-changing actions need approval") must call
the HTTP-wired `transitionStatus` endpoint — the gate logic stays server-side,
not replicated in the browser.

### Experimental flag gating uses the config `enabled` boolean, NOT a UI setting

The daybreak plugin gates behind `xpack.daybreak.enabled` (default `false`,
`common/config.ts:16-18`). This is a **server-side config schema**, not an
`experimentalFeatures` UI setting like agent_builder uses
(`agentBuilder:experimentalFeatures`, `server/ui_settings.ts:41-56`). The
config is consumed once in `server/plugin.ts:33,43` to short-circuit
setup/start. PD-4 must decide whether to keep this config-only gate or add a
UI-settings-based `experimentalFeatures` flag for browser-side visibility
control (the agent_builder pattern registers a UI setting that the browser
reads to show/hide deep links).

---

## 1. Architecture Overview

### 1.1 Current daybreak plugin shape (server-only)

```
x-pack/solutions/security/plugins/daybreak/
  │
  ├── kibana.jsonc                    # browser:false, server:true, optionalPlugins: [workflowsExecutionEngine, agentBuilder]
  ├── tsconfig.json                   # includes: common/**, server/** — NO public/**
  ├── common/
  │   └── config.ts                   # xpack.daybreak.enabled (boolean, default false)
  │
  ├── server/
  │   ├── index.ts                    # async plugin() initializer (lazy import ./plugin)
  │   ├── plugin.ts                   # DaybreakPlugin setup/start — gates on config.enabled
  │   ├── types.ts                    # DaybreakPluginStart = { runSpikeWorkflow? }
  │   │
  │   ├── client/                     # PD-2 store modules (programmatic, NOT HTTP-wired)
  │   │   ├── proposals/              # .daybreak-proposals index
  │   │   │   ├── types.ts            # ProposalProperties, ProposalStatus, DecisionHistoryEntry
  │   │   │   ├── storage.ts          # StorageIndexAdapter, proposalIndexName
  │   │   │   ├── client.ts           # ProposalClient (get/list/create/update/delete/transitionStatus/addEvidenceRef)
  │   │   │   ├── gate.ts             # evaluateReadinessGate, requireReadinessGate, ReadinessGateError
  │   │   │   └── client.test.ts
  │   │   └── evidence/               # .daybreak-evidence index
  │   │       ├── types.ts            # EvidenceDocument
  │   │       ├── storage.ts          # EvidenceProperties, evidenceIndexName
  │   │       ├── client.ts           # EvidenceClient (get/list/create/update/delete)
  │   │       └── client.test.ts
  │   │
  │   ├── workflow/                   # PD-1/PD-2 worker definitions
  │   │   ├── alert_analysis_worker.yaml  # 5-phase: Setup→Guard→Enrich→Reason→Act
  │   │   ├── run_alert_analysis_worker.ts
  │   │   ├── output_validation_guard.ts  # validateReasonOutput (Reason-phase shape gate)
  │   │   ├── run_spike_workflow.ts
  │   │   └── README.md               # PD-3 two-gate eval architecture docs
  │   │
  │   ├── evals/                      # PD-3 Gate 1 (offline dataset gate)
  │   │   ├── golden_dataset.ts
  │   │   ├── offline_dataset_gate.ts
  │   │   ├── generate_eval_report.ts
  │   │   └── alert_analysis_eval.test.ts
  │   │
  │   ├── integration_tests/          # PD-3 Gate 2 (live e2e)
  │   │   ├── alert_analysis_e2e.test.ts
  │   │   ├── alert_analysis_worker.test.ts
  │   │   └── workflow_engine_shape.test.ts
  │   │
  │   └── agent_builder/
  │       └── ensure_alert_analysis_agent.ts
  │
  └── (NO public/ directory exists)
```

### 1.2 Target shape after PD-4 (server + public)

```
x-pack/solutions/security/plugins/daybreak/
  │
  ├── kibana.jsonc                    # browser:true, server:true, requiredPlugins: [navigation, data, ...]
  ├── tsconfig.json                   # includes: common/**, server/**, public/**
  │
  ├── server/
  │   ├── (everything above stays)
  │   ├── routes/                     # NEW — HTTP API layer
  │   │   ├── index.ts                # registerRoutes(router)
  │   │   ├── proposals.ts            # GET/POST/PATCH /internal/daybreak/proposals
  │   │   ├── evidence.ts             # GET /internal/daybreak/evidence
  │   │   └── config.ts               # GET /internal/daybreak/config (Setup phase target)
  │   └── plugin.ts                   # MODIFIED — createRouter(), registerRoutes(), wire store clients
  │
  └── public/                         # NEW — entire layer
      ├── index.ts                    # plugin initializer (lazy import ./plugin)
      ├── plugin.tsx                  # DaybreakPublicPlugin setup/start
      ├── register.ts                 # core.application.register({ id, appRoute, mount })
      ├── application/
      │   ├── mount.tsx               # ReactDOM.render with providers
      │   ├── routes.tsx              # <Router><Routes>
      │   └── components/             # shell, thread, brief, gate, inspector, composer
      ├── services/                   # HTTP client wrappers (useEvidence, useProposals)
      ├── theme.ts                    # design token system (ported from prototype)
      └── types.ts
```

### 1.3 Data flow: browser → HTTP API → PD-2 stores → ES

```
React component (public/application/components/*)
  │
  │  useProposals() / useEvidence() hooks
  ▼
HTTP client (public/services/*)
  │
  │  fetch('/internal/daybreak/proposals') etc.
  ▼
HTTP router (server/routes/*)                          ← NEW — does not exist today
  │
  │  createProposalClient({ space, esClient, logger })
  ▼
ProposalClient / EvidenceClient (server/client/*)      ← PD-2, already shipped
  │
  │  storage.getClient().search() / .index()
  ▼
.daybreak-proposals / .daybreak-evidence (ES indices)
```

The gap PD-4 fills is the **HTTP router layer** and the **entire public/ layer**.
The store clients and ES indices already exist and are tested.

---

## 2. Relevant Code Locations

### 2.1 The PD-2 store contracts (what the UI renders)

#### Proposal store

| Symbol | File:Lines | Signature / Notes |
|---|---|---|
| `ProposalProperties` | `server/client/proposals/types.ts:34-51` | Full Proposal document: id, title, capability, severity, confidence, status, recommendation, evidenceRefs, decisionHistory, etc. |
| `ProposalStatus` | `server/client/proposals/types.ts:11-18` | `'new'\|'needs-evidence'\|'approved'\|'modified'\|'dismissed'\|'escalated'\|'deferred'` |
| `DecisionHistoryEntry` | `server/client/proposals/types.ts:23-29` | `{ fromStatus, toStatus, actor?, reason?, timestamp }` |
| `ProposalClient` | `server/client/proposals/client.ts:22-39` | Interface: get, list, create, update, delete, transitionStatus, addEvidenceRef, removeEvidenceRef |
| `createProposalClient` | `server/client/proposals/client.ts:276-287` | Factory: `({ space, logger, esClient }) => ProposalClient` |
| `proposalIndexName` | `server/client/proposals/storage.ts:14` | `'.daybreak-proposals'` |
| `MAX_PROPOSALS_PER_SPACE` | `server/client/proposals/client.ts:17` | `1000` — results truncated beyond this |

#### Evidence store

| Symbol | File:Lines | Signature / Notes |
|---|---|---|
| `EvidenceProperties` | `server/client/evidence/storage.ts:37-49` | id, kind (`'alert'\|'event'\|'entity'\|'timeline'\|'query'\|'assumption'\|'external'`), summary, provenance, confidence, stance (`'for'\|'against'`), sensitivityLabel |
| `EvidenceClient` | `server/client/evidence/client.ts:22-33` | Interface: get, list, create, update, delete |
| `createEvidenceClient` | `server/client/evidence/client.ts:190-201` | Factory: `({ space, logger, esClient }) => EvidenceClient` |
| `evidenceIndexName` | `server/client/evidence/storage.ts:13` | `'.daybreak-evidence'` |

### 2.2 The readiness gate (FR-7, FR-016 approval-flow integration)

| Symbol | File:Lines | Signature / Notes |
|---|---|---|
| `evaluateReadinessGate` | `server/client/proposals/gate.ts:62-92` | `(proposal, targetStatus?) => GateResult`. Pure function. Only checks when `targetStatus === 'approved'`: requires non-empty `evidenceRefs` AND non-empty `recommendation`. |
| `requireReadinessGate` | `server/client/proposals/gate.ts:98-106` | Throwing wrapper. Called inside `ProposalClientImpl.transitionStatus` (`client.ts:189`). |
| `GateResult` | `server/client/proposals/gate.ts:28-30` | `{ approved: true, proposalId } \| { approved: false, failure: GateFailure }` |
| `GateFailure` | `server/client/proposals/gate.ts:16-23` | `{ proposalId, targetStatus, missingRequirements: MissingRequirement[] }` |
| `MissingRequirement` | `server/client/proposals/gate.ts:11` | `'evidence' \| 'recommendation'` |
| `ReadinessGateError` | `server/client/proposals/gate.ts:35-44` | Thrown by `requireReadinessGate`. Carries `failure: GateFailure`. |

The gate is called from exactly one site: `ProposalClientImpl.transitionStatus`
(`client.ts:182-210`). The HTTP route that wraps `transitionStatus` is where
PD-4's gate-approval UI button will POST. The browser never calls
`evaluateReadinessGate` directly — it calls the endpoint and receives either
the updated Proposal or a `400` with the `GateFailure` body.

### 2.3 The config gate (experimental flag)

| Symbol | File:Lines | Notes |
|---|---|---|
| `configSchema` | `common/config.ts:16-18` | `{ enabled: schema.boolean({ defaultValue: false }) }` under `xpack.daybreak` |
| `ConfigType` | `common/config.ts:20` | `TypeOf<typeof configSchema>` |
| config consumption | `server/plugin.ts:29` | `this.config = initializerContext.config.get<ConfigType>()` |
| enabled gate (setup) | `server/plugin.ts:33-36` | `if (!this.config.enabled) { return {}; }` |
| enabled gate (start) | `server/plugin.ts:43-45` | `if (!this.config.enabled) { return {}; }` |

### 2.4 The workflow's HTTP boundaries (routes that MUST exist for the worker)

The `alert_analysis_worker.yaml` calls three internal HTTP endpoints via
`kibana.request` steps. These routes **do not exist yet** — they are mocked in
every integration test. PD-4 (or a prerequisite task) must create them:

| Endpoint | YAML step | YAML line | Current state |
|---|---|---|---|
| `GET /internal/daybreak/config` | `setup` | `alert_analysis_worker.yaml:24` | Mocked in tests (`alert_analysis_worker.test.ts:291,350`); not implemented |
| `GET /internal/detection_engine/signals/_alerts_summary` | `enrich` | `alert_analysis_worker.yaml:43` | Belongs to the Security solution's detection engine, not daybreak |
| `POST /internal/daybreak/proposals` | `act` | `alert_analysis_worker.yaml:97` | Mocked in tests (`alert_analysis_worker.test.ts:356`); not implemented |

### 2.5 Plugin lifecycle contracts

| Symbol | File:Lines | Notes |
|---|---|---|
| `DaybreakPluginSetup` | `server/types.ts:17` | `Record<string, never>` — setup exposes nothing today |
| `DaybreakPluginStart` | `server/types.ts:29-37` | `{ runSpikeWorkflow?: RunSpikeWorkflow }` — only exposes the PD-1 spike trigger |
| `DaybreakPluginStartDeps` | `server/types.ts:20-23` | `{ workflowsExecutionEngine?, agentBuilder? }` — both optional |
| `server/index.ts` | `server/index.ts:19-22` | `async plugin()` with `await import('./plugin')` — correct lazy-import pattern |

---

## 3. Existing Patterns (reference implementation: agent_builder)

The closest sibling plugin is **agent_builder** (`x-pack/platform/plugins/shared/agent_builder/`).
It has the full server+public shape, uses `core.application.register`, has HTTP
routes, registers UI settings for experimental features, and is already a
dependency of daybreak (`optionalPlugins: ["agentBuilder"]`). PD-4 should mirror
its structure.

### 3.1 Application registration pattern

`agent_builder/public/register.ts:64-101` — `registerApp({ core, getServices, appUpdater$ })`:

```ts
core.application.register({
  id: AGENTBUILDER_APP_ID,
  appRoute: AGENTBUILDER_PATH,
  category: DEFAULT_APP_CATEGORIES.enterpriseSearch,
  title: AGENT_BUILDER_SHORT_TITLE,
  euiIconType: 'logoElasticsearch',
  visibleIn: ['classicSideNav', 'projectSideNav', 'globalSearch'],
  deepLinks: buildAgentBuilderDeepLinks(false),
  defaultPath: '/agents',
  async mount({ element, history, onAppLeave }: AppMountParameters) {
    const { mountApp } = await import('./application');
    const [coreStart, startDependencies] = await core.getStartServices();
    coreStart.chrome.docTitle.change(AGENT_BUILDER_FULL_TITLE);
    return mountApp({ core: coreStart, services, element, history, plugins: startDependencies, onAppLeave });
  },
});
```

Key conventions:
- **Lazy import inside `mount`**: `await import('./application')` — keeps the
  initial bundle small; the application code is code-split.
- **`getStartServices()`**: deferred acquisition of start-time services
  (coreStart + plugin deps).
- **Unmount return**: `mount` returns a cleanup function
  (`() => ReactDOM.unmountComponentAtNode(element)`).

### 3.2 Application mount pattern (React providers)

`agent_builder/public/application/mount.tsx:26-80` — wraps the route tree in:
`KibanaContextProvider` → `I18nProvider` → `QueryClientProvider` (TanStack
Query) → services context → `Router` (`@kbn/shared-ux-router`) → page wrapper.

The TanStack Query (`QueryClientProvider`) pattern is the standard for
server-state hooks (`useProposals`, `useEvidence`). PD-4 should follow this.

### 3.3 HTTP router registration pattern

`agent_builder/server/plugin.ts:143-152`:
```ts
const router = coreSetup.http.createRouter<AgentBuilderHandlerContext>();
registerRoutes({ router, coreSetup, logger, pluginsSetup, getInternalServices, ... });
```

`agent_builder/server/routes/index.ts:28-47` — a barrel that calls
`registerXxxRoutes(dependencies)` for each resource. Each route file receives
`{ router, ... }` and calls `router.get(...)`, `router.post(...)`, etc.

### 3.4 Experimental features UI setting pattern

`agent_builder/server/ui_settings.ts:41-56`:
```ts
[AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID]: {
  description: i18n.translate('xpack.agentBuilder.uiSettings.experimentalFeatures.description', ...),
  name: i18n.translate('xpack.agentBuilder.uiSettings.experimentalFeatures.name', ...),
  schema: schema.boolean(),
  value: false,
  experimental: true,
  requiresPageReload: false,
  readonly: false,
},
```

The browser reads this via `uiSettings.get('agentBuilder:experimentalFeatures')`
and uses it to show/hide experimental deep links
(`register.ts:59-62` — `buildAgentBuilderDeepLinks(experimentalFeaturesEnabled)`).

The daybreak plugin currently uses **only** a server-side config boolean
(`xpack.daybreak.enabled`), not a UI setting. PD-4 has two options:
1. Keep config-only gating (simpler, but the browser cannot independently
   control visibility).
2. Add a `daybreak:experimentalFeatures` UI setting (agent_builder pattern)
   for browser-side deep-link visibility, while keeping `xpack.daybreak.enabled`
   as the hard server-side kill switch.

### 3.5 Feature registration pattern (capabilities/privileges)

`agent_builder/server/features.ts:22-103` — `registerFeatures({ features })`
calls `features.registerKibanaFeature({ id, app, privileges: { all, read }, ... })`.

This registers the feature privilege that controls who can see the app in the
nav and call its API. The daybreak plugin does NOT register a feature today
(it has no UI to gate). PD-4 must add this if the panel should be
role-gated. The kibana.jsonc would need `requiredPlugins: ["features"]` and
the server setup would call `registerKibanaFeature`.

### 3.6 Server plugin lazy-import pattern (already correct in daybreak)

`server/index.ts:19-22`:
```ts
export async function plugin(initializerContext: PluginInitializerContext) {
  const { DaybreakPlugin } = await import('./plugin');
  return new DaybreakPlugin(initializerContext);
}
```

This is the correct pattern enforced by `@kbn/eslint/no_sync_import_from_plugin`
(AGENTS.md §"Overview"). The public-side `index.ts` should follow the same
pattern: `export async function plugin(...) { const { DaybreakPublicPlugin } = await import('./plugin'); return new DaybreakPublicPlugin(...); }`.

---

## 4. Integration Points

### 4.1 HTTP API layer (the missing middle)

PD-4 must create `server/routes/` and wire it in `server/plugin.ts` setup:

```
server/plugin.ts setup()
  ├── core.http.createRouter()
  ├── createProposalClient({ space, esClient, logger })   ← per-request, scoped to space
  ├── createEvidenceClient({ space, esClient, logger })
  └── registerRoutes({ router, proposalClient, evidenceClient })
```

Endpoints needed (minimum viable for the prototype's surfaces):

| Method | Path | Store call | UI surface |
|---|---|---|---|
| GET | `/internal/daybreak/proposals` | `proposalClient.list(filters)` | Thread list, brief/landing |
| GET | `/internal/daybreak/proposals/{id}` | `proposalClient.get(id)` | Thread detail, inspector |
| POST | `/internal/daybreak/proposals` | `proposalClient.create(params)` | Worker Act phase, composer |
| PATCH | `/internal/daybreak/proposals/{id}` | `proposalClient.update(id, updates)` | Proposal editing |
| POST | `/internal/daybreak/proposals/{id}/transition` | `proposalClient.transitionStatus(id, target)` | **Gate-approval button** (FR-7) |
| GET | `/internal/daybreak/evidence` | `evidenceClient.list(filters)` | Evidence panel, timeline |
| GET | `/internal/daybreak/evidence/{id}` | `evidenceClient.get(id)` | Evidence detail in inspector |
| GET | `/internal/daybreak/config` | (config reader) | Worker Setup phase target |

The space-scoping is already handled: both clients take a `space` parameter
and filter by `{ term: { space } }` on every query. The HTTP route handler
must extract the space from the request context (`deps.spaces?.getSpaceId(request)`
or the default space).

### 4.2 Gate-approval flow (FR-7, FR-016)

The prototype's gate UI ("read & gather auto-runs / assemble & draft proposed
as a diff / world-changing actions need approval") maps to the server-side
`transitionStatus` endpoint:

```
Browser gate-approval button
  │  POST /internal/daybreak/proposals/{id}/transition  body: { targetStatus: 'approved' }
  ▼
router handler → proposalClient.transitionStatus(id, 'approved')
  │
  │  internally calls requireReadinessGate(proposal, 'approved')
  │  (gate.ts:98 → evaluateReadinessGate at gate.ts:62)
  ▼
  ├── approved: returns updated ProposalProperties (200)
  └── rejected: throws ReadinessGateError → 400 with GateFailure body
        { proposalId, targetStatus, missingRequirements: ['evidence'] }
```

The browser renders the `missingRequirements` list to explain *why* the gate
failed (e.g., "Cannot approve: evidence missing"). The gate logic itself
(evidence + recommendation check) stays server-side — never replicated in JS.

### 4.3 Application registration

`public/plugin.tsx` setup must call `registerApp({ core, ... })` which calls
`core.application.register({ id: 'daybreak', appRoute: '/app/daybreak', ... })`.
The `kibana.jsonc` must change:
- `"browser": true`
- Add `requiredPlugins` for browser deps (likely: `navigation`, `data`,
  `spaces`, `kibanaReact`, `kibanaUtils`, `sharedUXRouter`)

### 4.4 TypeScript project boundaries

`tsconfig.json` currently `include`s `common/**/*` and `server/**/*` only.
PD-4 must add `"public/**/*"` to the `include` array and add browser-side
`kbn_references` (e.g., `@kbn/core-http-browser`, `@kbn/kibana-react-plugin`,
`@kbn/react-query`, `@kbn/shared-ux-router`, `@kbn/i18n-react`).

---

## 5. Constraints & Gotchas

### 5.1 The Throughline prototype is not in the repo

**This is the hard blocker.** `find . -iname '*throughline*'` (excluding
`node_modules`) returns zero results. There is no `docs-site/` directory. Every
CSS custom property, render function, and component shape the proposal cites
is unverifiable. PD-4's first concrete step must be to vendor the prototype
source (`Throughline.dc.html`, `throughline-app.js`, `support.js`) into the
repo — likely under `docs-site/prototype/` or a design-archive folder. Until
that happens, no port work can begin because there is nothing to port.

### 5.2 No HTTP router exists — the stores are orphaned from the browser

The `ProposalClient` and `EvidenceClient` have **zero callers outside their own
`client/` directories**. The workflow YAML references
`POST /internal/daybreak/proposals` but that route is mocked in every test.
PD-4 cannot render real data without first creating the HTTP API layer. This is
a prerequisite, not a side task.

### 5.3 The `origin/daybreak-spike` remote branch does not exist

The local `daybreak-spike` branch has no upstream tracking. `git ls-remote
--heads origin` shows no `daybreak-spike` ref. Any CI trigger, cross-machine
clone, or PR workflow that references `origin/daybreak-spike` will fail with
"remote ref not found." The branch must be pushed (`git push -u origin
daybreak-spike`) before any remote-dependent verification. The `i9` remote
(LAN worktree host) may have the branch but is not a shared source of truth.

### 5.4 Config-only gating vs. UI-settings gating

The daybreak plugin uses `xpack.daybreak.enabled` (config schema, server-side
only). The agent_builder plugin uses BOTH a config AND a UI setting
(`agentBuilder:experimentalFeatures`). The difference matters:
- **Config** (`kibana.yml`): set at deploy time, requires restart, admin-only.
- **UI setting**: set at runtime via Advanced Settings, per-space, no restart.

PD-4 should keep `xpack.daybreak.enabled` as the hard kill switch (already
shipped) and decide whether the browser needs a softer UI-setting gate for
deep-link visibility. The proposal's "default off" (NFR-2) is satisfied by the
config default; the UI setting is optional polish.

### 5.5 Space scoping is built into the store clients

Both `ProposalClientImpl` and `EvidenceClientImpl` take a `space` parameter and
filter every ES query by `{ term: { space } }`. The HTTP route handler must
resolve the space from the request (via the Spaces plugin or default space)
and pass it to the client factory. Do NOT re-implement space filtering in the
route layer — the clients already do it.

### 5.6 The readiness gate is fail-closed for `approved` only

`evaluateReadinessGate` (`gate.ts:62-92`) returns `{ approved: true }` for
every target status **except** `'approved'`. Only the `approved` transition
checks `evidenceRefs` and `recommendation`. This means the gate UI's
"approval-required" tier maps specifically to the `→ approved` transition.
Other transitions (`dismissed`, `escalated`, `deferred`) pass the gate
unconditionally — the UI should not show a "gate blocked" state for those.

### 5.7 `ProposalClientImpl.list` has a non-null assertion on `_source`

`client.ts:124`: `response.hits.hits.map((hit) => (hit._source as
ProposalProperties) ?? undefined!)`. The `?? undefined!` is a non-null
assertion that suppresses the case where `_source` is missing. This is a
pre-existing pattern in the shipped code — PD-4's HTTP layer should be aware
that list responses may contain entries with undefined `_source` (orphaned ES
documents) and handle gracefully in the browser.

### 5.8 `createProposalClient` / `createEvidenceClient` are per-request, not singleton

The factory functions take `{ space, logger, esClient }` and return a new
client instance. The HTTP route handler must call the factory per-request
(because the space varies per request), not cache a singleton in the plugin.
The `esClient` comes from `core.elasticsearch.client.asCurrentUser` (scoped to
the authenticated user) — this is the standard Kibana pattern for
user-scoped ES access.

### 5.9 The tsconfig must include `public/**/*` before any typecheck can pass

`tsconfig.json:6-12` currently includes only `common/**/*` and `server/**/*`.
Adding `public/` files without updating `include` will cause
`node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json`
to ignore them silently. PD-4's first file change must be the tsconfig update.

### 5.10 SCS (semantic code search) is down

The SCS ES endpoint is unreachable (`getaddrinfo ENOTFOUND`). This recon was
done with Grep/Glob/Read only — no semantic search was available. All anchors
are disk-verified.

---

## 6. Answers to the plan's research questions

### What is the exact integration surface for the public/ layer?

The public/ layer connects to the existing PD-2 stores via a **new HTTP router**
in `server/routes/`. The router creates per-request `ProposalClient` and
`EvidenceClient` instances (scoped to the request's space and authenticated
user's ES client) and exposes list/get/create/update/transition endpoints under
`/internal/daybreak/`. The browser calls these via TanStack Query hooks. The
gate-approval button calls `POST /internal/daybreak/proposals/{id}/transition`,
which internally calls `evaluateReadinessGate` — the gate logic stays
server-side.

### What must change in kibana.jsonc?

1. `"browser": false` → `"browser": true`
2. Add `requiredPlugins` for browser-side deps (at minimum: whatever provides
   `core.application.register`, likely just core; plus `spaces` for space-aware
   routing, `data` for ES access patterns if needed).
3. The `optionalPlugins` list already includes `workflowsExecutionEngine` and
   `agentBuilder` — these stay.

### What is the gating strategy?

Keep `xpack.daybreak.enabled` (config, default `false`) as the hard server-side
kill switch. The public/ plugin's `setup()` should check this config and
short-circuit registration if disabled (mirror `server/plugin.ts:33`). Do NOT
register the application if the server plugin is disabled — the browser would
mount a panel that calls non-existent routes.

### What is the prototype-porting strategy?

**Blocked on vendoring the prototype.** The Throughline prototype source files
(`Throughline.dc.html`, `throughline-app.js`, `support.js`) are not in the repo.
No port work can begin until they are added. Once vendored, the port follows a
1-to-1 component decomposition: shell → rail/nav/stage/composer; thread →
stream/msg/spine/inspector; brief; gate. Each ported surface is diffed against
the prototype before commit. The prototype's in-memory `freshState()` seed is
replaced entirely by the HTTP API calls to the PD-2 stores — no demo seed data
reaches the rendered UI.
