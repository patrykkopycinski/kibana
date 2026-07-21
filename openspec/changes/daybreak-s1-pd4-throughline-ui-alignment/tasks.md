---
tasks_completed: 23
tasks_total: 23
---
# Tasks

## Phase 0: Foundations & Prerequisites

#### 1.1 Explore the daybreak plugin, PD-2 stores, and spike-branch wiring

**File**: `.ao/recon.md`

**Intent**: Every downstream contract asserts behaviour against PD-2 server code and against an unverified prototype, and the feature worktree HEAD contains no daybreak code at all. This read-only reconnaissance grounds each later task in real `file:line` anchors before any code is written; all Phase 1+ tasks depend on its output.

**Contract** (Document section claims — all machine-greppable in `.ao/recon.md`):
- Section "Spike branch" records the tip SHA of `origin/daybreak-spike` and the diverge/merge-base commit (grounded in research.md §2).
- Section "PD-2 store anchors" records the verified locations of: `proposals/types.ts` (`ProposalStatus`, `ProposalProperties`, `DecisionHistoryEntry`), `proposals/gate.ts` (`evaluateReadinessGate`, `requireReadinessGate`, `ReadinessGateError`, `MissingRequirement`, `GateResult`), `proposals/client.ts` (`transitionStatus` signature, space-scoped constructor, `createSpaceFilter`), `evidence/types.ts` (`EvidenceProperties`, `EvidenceDocument`), and `evidence/client.ts` + `evidence/storage.ts` (grounded in research.md §5; design cites `gate.ts:62/98`, `gate.ts:35`, `client.ts:34/189`, `evidence/client.ts:53/56`, `storage.ts:13/37`).
- Section "Confirmed absences" records that there is no `public/` directory, no HTTP route handler (`router.` / `createRouter` / `http.`) anywhere in `server/`, and no `experimentalFeatures` daybreak entry (grounded in research.md §3, §4, §6).
- Section "Config flag" records `xpack.daybreak.enabled` (`schema.boolean({ defaultValue: false })`) in `common/config.ts`, with the `:13-14` comment calling it an experimental flag, and the server `setup()`/`start()` early-return guards (grounded in research.md §4; design cites `server/plugin.ts:33/43/42/55-62`).
- Section "Prototype vendoring" records where `docs-site/prototype/` will live and how the operator obtains the source (grounded in research.md §1).

**Traces**: (infrastructure)

#### 1.2 Bring the PD-2 spike branch onto the feature worktree

**File**: `x-pack/solutions/security/plugins/daybreak/`

**Intent**: The PD-1/PD-2 server output (workflow scaffold + Evidence/Proposal stores) lives only on `origin/daybreak-spike` and is absent from the worktree HEAD; UI cannot be built against stores that are not on the branch.

**Note (updated 2026-07-09, post-investigation):** the tip cited below was corrected from `33a054f1afad` to `2cbad6ad0e78` — the worker mirrors `i9/daybreak-spike` and `m1max/daybreak-spike-sync` had 3 commits beyond that original `origin` tip (the Reason/`ai.agent` integration test, the readiness-gate Act test, and the `run_alert_analysis_worker.ts` runner) that were pushed to `origin/daybreak-spike` during PD-2 discrepancy remediation. Merging against the stale tip would have silently dropped that code again.

**Contract** (behavioural, answerable from `git` + `test`):
- `git rev-parse HEAD` is a descendant of the `origin/daybreak-spike` tip `2cbad6ad0e78` (i.e. `git merge-base --is-ancestor 2cbad6ad0e78 HEAD` exits 0; grounded in research.md §2).
- `test -d x-pack/solutions/security/plugins/daybreak/server/client/proposals && test -d x-pack/solutions/security/plugins/daybreak/server/client/evidence` succeeds.
- `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes with the merged PD-2 code (no new errors introduced by the merge).
- **Known remaining gap (not fixed by the merge):** `x-pack/solutions/security/plugins/daybreak/server/workflow/enrich_alert_schema.test.ts` and the `alertInputSchema`/`packageEvidence` symbols PD-2 task 1.3 specified do not exist anywhere on `daybreak-spike` (origin or either worker mirror) — the Enrich phase in `alert_analysis_worker.yaml` is a bare `kibana.request` step with no input-validation module. This is a genuine PD-2 gap, not a desync artifact; file a follow-up task before FR-009/NFR-4 (Enrich-boundary input validation) can be considered satisfied. Do not assume 1.2's merge resolves it.

**Traces**: FR-003

#### 1.3 Vendor the Throughline prototype into the repository

**File**: `docs-site/prototype/`

**Intent**: The prototype is the UI's visual + interaction source-of-truth, yet it is absent from the working tree and from all git history, so every symbol the UI ports against is unverifiable until it is committed. If the prototype source is not available to the operator, this task — and the spike — is blocked and must be surfaced immediately rather than substituted with a mockup (no-fabricated-evidence).

**Contract** (literal file existence — answerable from the diff):
- `test -f docs-site/prototype/Throughline.dc.html && test -f docs-site/prototype/throughline-app.js && test -f docs-site/prototype/support.js` succeeds.
- The three files are git-tracked and are regular files (not symlinks): `git ls-files -s docs-site/prototype/ | awk '$1=="120000"'` prints nothing.

**Traces**: FR-001

#### 1.5 Fix the genuine PD-2 gap: Enrich-phase input validation (`enrich_alert_schema.test.ts`)

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/enrich_alert_schema.ts`

**Intent**: PD-2 task 1.3 specified an `alertInputSchema` (Zod) that rejects malformed alert input and a `packageEvidence` function that produces a framing/rubric-free ground-truth block for the Reason phase (FR-009, prompt-injection boundary control per NFR-4). Forensic audit (2026-07-09) confirmed this file, and the `alertInputSchema`/`packageEvidence` symbols, do not exist anywhere on `origin/daybreak-spike`, `i9/daybreak-spike`, or `m1max/daybreak-spike-sync` — the Enrich phase in the shipped `alert_analysis_worker.yaml` is a bare `kibana.request` step with no validation module. This is a real, unresolved PD-2 deliverable, not a status-desync artifact (see research.md §2), and must be closed before FR-009/NFR-4 can be considered satisfied — it is a hard precondition for 1.2's merge to be sufficient, since 1.2 only brings over what already exists upstream.

**Contract**:
```typescript
// server/workflow/enrich_alert_schema.ts — sibling module to output_validation_guard.ts,
// following its WorkflowHaltError / isNonEmptyString style (server/workflow/output_validation_guard.ts:27-31)
import { z } from 'zod';

export const alertInputSchema = z.object({
  id: z.string().min(1),
  ruleName: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  timestamp: z.string().min(1),
  fields: z.record(z.string(), z.unknown()).optional(),
});
export type AlertInput = z.infer<typeof alertInputSchema>;

// Structurally distinct from any Reason-phase framing/rubric type (NFR-4) —
// no shared field name that could smuggle instruction-like text into the model prompt.
export interface EvidenceGroundTruthBlock {
  summary: string;
  sourceRef: string;
}

/** Throws (ZodError) on malformed input; packages a validated alert into the ground-truth block. */
export function packageEvidence(alert: unknown): EvidenceGroundTruthBlock {
  const validated = alertInputSchema.parse(alert);
  return {
    summary: `${validated.ruleName} (${validated.severity}) at ${validated.timestamp}`,
    sourceRef: validated.id,
  };
}
```
- `server/workflow/enrich_alert_schema.test.ts` asserts: (1) `alertInputSchema` rejects malformed input (missing `id`, invalid `severity` enum value, non-string `timestamp`); (2) `packageEvidence` throws on malformed input rather than silently coercing it; (3) `EvidenceGroundTruthBlock`'s fields share no name with `ReasonStructuredOutput` (`output_validation_guard.ts`) or any Reason-phase prompt-template field, so a `packageEvidence` result cannot masquerade as a framing/rubric field if interpolated (FR-009, FR-018, FR-019, NFR-4).
- The Enrich step's `kibana.request` output in `alert_analysis_worker.yaml` is piped through `packageEvidence` before being interpolated into the Reason step's `triage verdict: {{ steps.enrich.output | json }}` template — grounded by re-reading `alert_analysis_worker.yaml:41-63` once 1.2 lands.

**Traces**: FR-009, FR-018, FR-019, NFR-4 (remediates the genuine PD-2 task-1.3 gap found during the 2026-07-09 worktree-discrepancy investigation)

#### 1.4 Lift the PD-2 shared type contracts into `common/`

**File**: `x-pack/solutions/security/plugins/daybreak/common/types/`

**Intent**: The `public/` bundle must render the exact PD-2 `ProposalProperties` / `EvidenceProperties` shapes; declaring them twice (server + public) invites drift. A type-only move gives both sides one canonical contract with no runtime change to PD-2.

**Contract**:
```typescript
// common/types/proposals.ts re-exports the lifted declarations:
export type { ProposalProperties, ProposalStatus, DecisionHistoryEntry } from './proposals';
// common/types/gate.ts:
export type { GateResult, GateFailure, MissingRequirement } from './gate';
// common/types/evidence.ts:
export type { EvidenceProperties, EvidenceDocument } from './evidence';
// `server/client/{proposals,evidence}/types.ts` and `gate.ts` now re-export from common/
// (backward-compatible: server code keeps compiling unchanged).
```
- `grep -rn "export type ProposalProperties" x-pack/solutions/security/plugins/daybreak/` returns exactly one declaration site, located under `common/types/` (grounded in the shapes documented in research.md §5).

**Traces**: (infrastructure — enables FR-021, FR-022)

### Verification:

#### Automated:
- [ ] 1.1 `.ao/recon.md` exists and `grep -q 'origin/daybreak-spike' .ao/recon.md && grep -q 'experimentalFeatures' .ao/recon.md && grep -q 'evaluateReadinessGate' .ao/recon.md` succeeds (infrastructure) @host:worker-m1max
- [ ] 1.2 `git merge-base --is-ancestor 37dfadf9425d HEAD` exits 0 (FR-003) @host:worker-m1max
- [ ] 1.2 `test -d x-pack/solutions/security/plugins/daybreak/server/client/proposals` succeeds (FR-003) @host:worker-m1max
- [ ] 1.2 `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-003) @host:worker-m1max
- [ ] 1.3 `test -f docs-site/prototype/throughline-app.js && test -f docs-site/prototype/Throughline.dc.html && test -f docs-site/prototype/support.js` succeeds (FR-001) @host:worker-m1max
- [ ] 1.3 `git ls-files -s docs-site/prototype/ | awk '$1=="120000"'` prints nothing (FR-001) @host:worker-m1max
- [ ] 1.5 `node scripts/jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js server/workflow/enrich_alert_schema.test.ts` passes (FR-009, FR-018, FR-019, NFR-4) @host:worker-m1max
- [ ] 1.5 `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes with `enrich_alert_schema.ts` in place (FR-009) @host:worker-m1max
- [ ] 1.4 `grep -rn "export type ProposalProperties" x-pack/solutions/security/plugins/daybreak/` returns one site under `common/types/` (FR-021, FR-022) @host:worker-m1max
- [ ] 1.4 `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-021, FR-022) @host:worker-m1max

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 1: Plugin Scaffold & Transport

#### 2.1 Add thin HTTP routes wrapping the PD-2 stores

**File**: `x-pack/solutions/security/plugins/daybreak/server/http_routes/`

**Intent**: research.md §6 proves no HTTP API exposes the Evidence/Proposal stores today; the "real data wiring (not mocked)" requirement needs a transport. The routes are pure pass-through wrappers around the existing `EvidenceClient`/`ProposalClient` — no business logic is invented — and the transition route surfaces the readiness-gate failure so fail-closed approval is a server property the UI inherits.

**Contract**:
```typescript
// server/http_routes/{proposals,evidence}.ts — registered in start() only when config.enabled
//   (server/plugin.ts:42; setup/start early-return on !config.enabled per server/plugin.ts:33/43),
//   constructing space-scoped clients per request (evidence/client.ts:56, proposals/client.ts:65,
//   filtered via createSpaceFilter at evidence/client.ts:53 / proposals/client.ts:62).
router.get({ path: '/api/daybreak/proposals', validate: listSchema }, /* wraps ProposalClient.list */);
router.get({ path: '/api/daybreak/proposals/{id}', validate: idSchema }, /* wraps ProposalClient.get */);
router.post(
  { path: '/api/daybreak/proposals/{id}/transition', validate: transitionSchema },
  // wraps ProposalClient.transitionStatus(id, targetStatus, actor?, reason?) (client.ts:34),
  //   which internally calls requireReadinessGate (client.ts:189 → gate.ts:98);
  // on ReadinessGateError (gate.ts:35) → res.customError({ statusCode: 422, body: { missingRequirements } })
);
router.get({ path: '/api/daybreak/evidence', validate: listSchema }, /* wraps EvidenceClient.list */);
router.get({ path: '/api/daybreak/evidence/{id}', validate: idSchema }, /* wraps EvidenceClient.get */);
```
- `grep -rn "router\.\(get\|post\)" x-pack/solutions/security/plugins/daybreak/server/http_routes/` returns the five routes above (grounded in the client method shapes and gate contract documented in research.md §5, §6).

**Traces**: FR-023 (supports FR-017, FR-018)

#### 2.2 Flip the manifest to `browser:true` and register the daybreak application route under the enabled flag

**File**: `x-pack/solutions/security/plugins/daybreak/public/plugin.ts`

**Intent**: The plugin is server-only (`browser:false`, no application route; research.md §3) and the only existing gate is the `xpack.daybreak.enabled` config boolean — there is no `experimentalFeatures` entry (research.md §4). This task stands up the client plugin, registers a default-off application route, and hides the nav entry when the flag is off, so the spike is safe to merge mid-cycle.

**Contract**:
```typescript
// kibana.jsonc gains: "browser": true
// public/plugin.ts
export class DaybreakPlugin implements Plugin<DaybreakPluginSetup, DaybreakPluginStart> {
  public setup(core: CoreSetup) {
    core.application.register({
      id: 'daybreak',
      appRoute: '/app/daybreak',
      // nav entry hidden when xpack.daybreak.enabled is false (common/config.ts:17);
      // the flag value is sourced from the server config (plumbing pinned by recon 1.1)
      appUpdater: async () => ({ navLinkStatus: (await isEnabled()) ? AppNavLinkStatus.default : AppNavLinkStatus.hidden }),
      mount: ({ element }) => { /* renders <DaybreakApp/>; returns unmount cleanup */ },
    });
  }
}
```
- `grep -q '"browser": true' x-pack/solutions/security/plugins/daybreak/kibana.jsonc` succeeds; `grep -q 'core.application.register' x-pack/solutions/security/plugins/daybreak/public/plugin.ts` succeeds.

**Traces**: FR-008, FR-009

#### 2.3 Port the prototype's design-token system into `theme.ts`

**File**: `x-pack/solutions/security/plugins/daybreak/public/application/theme.ts`

**Intent**: All ported surfaces must draw colour/shape from one token layer rather than inlined values, so the rendered UI can be diffed against the prototype. Exact token values are ported from the now-vendored prototype (`TL_CSS` + `applyTheme`/`applyAccent`/`applyRadius`/`applyShadow`); the contract fixes the typed shape, the light/dark pair, and the dark default.

**Contract**:
```typescript
// public/application/theme.ts — token VALUES ported from docs-site/prototype/throughline-app.js (FR-002 diff-before-port)
export interface DaybreakTokens {
  neutrals: { ink0: string; ink5: string; bg: string; bg2: string; panel: string; panel2: string; line: string };   // --ink-0..5, --bg, --bg-2, --panel, --panel-2, --line*
  semantic: { blue: string; green: string; teal: string; amber: string; red: string; violet: string };              // --blue*/--green*/--teal*/--amber*/--red*/--violet*
  threadType: { case: string; investigation: string; hunt: string; incident: string; chat: string };                 // --t-case/--t-inv/--t-hunt/--t-incident/--t-custom
  shape: { radiusLg: string; panelShadow: string; shadowScale: { xs: string; sm: string; md: string; lg: string } }; // --r-lg, --panel-shadow, --sh-xs..lg
}
export const daybreakTheme: { tokens: DaybreakTokens; defaultMode: 'dark'; modes: { light: DaybreakTokens; dark: DaybreakTokens } };
// consumed by the React tree via Emotion (FR-006); mapped onto euiColor* tokens where 1:1 (FR-004).
// FR-007: sibling reference table (markdown or TS comment block next to theme.ts) maps each DaybreakTokens
// leaf onto the nearest euiColor* / euiSize* token so future surface ports stay consistent.
```

**Traces**: FR-004, FR-005, FR-006, FR-007, FR-7

#### 2.4 Add the typed HTTP client and data hooks consumed by the React tree

**File**: `x-pack/solutions/security/plugins/daybreak/public/application/api/`

**Intent**: The UI renders real worker output, so every surface reads through typed hooks over the transport routes (2.1) rather than prototype seed data. The transition hook surfaces `missingRequirements` so a blocked approval can state *why*.

**Contract**:
```typescript
// public/application/api/hooks.ts — types from common/types (lifted in 1.4); shapes per research.md §5
export function useProposals(): { data: ProposalProperties[]; loading: boolean; refresh: () => void };
export function useProposal(id: string): { data?: ProposalProperties; loading: boolean };
export function useEvidence(opts?: { proposalId?: string }): { data: EvidenceProperties[]; loading: boolean };
export interface ProposalTransitionResult { proposal?: ProposalProperties; missingRequirements?: MissingRequirement[] }
export function useProposalTransition(): {
  transition: (id: string, targetStatus: ProposalStatus, opts?: { actor?: string; reason?: string }) => Promise<ProposalTransitionResult>;
};
// loading/data states are assertable for E2E wait-for-state (A-5 / FR-011)
```

**Traces**: FR-020, FR-021, FR-022

### Verification:

#### Automated:
- [ ] 2.1 `grep -rn "router\.\(get\|post\)" x-pack/solutions/security/plugins/daybreak/server/http_routes/` returns the five routes incl. `/api/daybreak/proposals/{id}/transition` (FR-023) @host:worker-m1max
- [ ] 2.1 `grep -q "422" x-pack/solutions/security/plugins/daybreak/server/http_routes/proposals.ts` succeeds (FR-023, FR-017) @host:worker-m1max
- [ ] 2.1 `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-023) @host:worker-m1max
- [ ] 2.2 kibana.jsonc browser flag: `grep -q '"browser": true' x-pack/solutions/security/plugins/daybreak/kibana.jsonc` succeeds (FR-008) @host:worker-m1max
- [x] 2.2 plugin application register: `grep -q 'core.application.register' x-pack/solutions/security/plugins/daybreak/public/plugin.ts` succeeds (FR-008) @host:worker-m1max
- [ ] 2.2 plugin appUpdater: `grep -q 'appUpdater' x-pack/solutions/security/plugins/daybreak/public/plugin.ts` succeeds (FR-009) @host:worker-m1max
- [ ] 2.2 phase-1 type_check: `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-008, FR-009) @host:worker-m1max
- [x] 2.3 New test in `theme.test.ts` asserts `daybreakTheme.defaultMode === 'dark'` and that `modes.light`/`modes.dark` both expose all four token groups (FR-004, FR-005) @host:worker-m1max
- [ ] 2.3 token→EUI mapping table exists beside theme.ts (FR-007, FR-7) @host:worker-m1max
- [ ] 2.3 `node scripts/jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js public/application/theme` passes (FR-004, FR-005, FR-006, FR-007) @host:worker-m1max
- [x] 2.4 New tests in `hooks.test.ts` assert `useProposalTransition().transition` populates `missingRequirements` from a 422 fixture (FR-018, FR-020) @host:worker-m1max
- [ ] 2.4 `node scripts/jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js public/application/api` passes (FR-020, FR-021, FR-022) @host:worker-m1max
- [ ] 2.1–2.4 phase-1 eslint: `node scripts/eslint --fix $(git diff --name-only HEAD)` passes on all new files (FR-008, FR-023) @host:worker-m1max

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 2: UI Surfaces (shell, thread, brief)

#### 3.1 Port the application shell (rail / nav / stage / composer)

**File**: `x-pack/solutions/security/plugins/daybreak/public/application/components/shell/`

**Intent**: The top-level React route component must render the prototype's shell — left rail, thread list/nav, main stage, and composer — composed from the real-data hooks (2.4), diffed against the vendored prototype before porting (FR-002).

**Contract**:
```typescript
// public/application/components/shell/shell_app.tsx — ports prototype TL_SHELL/renderRail/renderNav/renderStage
export function DaybreakApp(): JSX.Element;
// renders <Rail/>, <Nav/> (thread list from useProposals), <Stage/>, <Composer/>;
// consumes daybreakTheme tokens (2.3); exposes assertable loading + data-populated states (FR-011)
```
- `grep -q 'DaybreakApp' x-pack/solutions/security/plugins/daybreak/public/plugin.ts` (mounted by 2.2) succeeds.

**Traces**: FR-010, FR-011

#### 3.2 Port the thread/conversation view and the evidence inspector

**File**: `x-pack/solutions/security/plugins/daybreak/public/application/components/thread/`

**Intent**: The conversation view renders real Evidence inside the inspector and carries the five thread types, diffed against the prototype (FR-002). This is the surface where worker output is actually inspected by an analyst.

**Contract**:
```typescript
// ports prototype renderStream/renderMsg/renderSpine/renderObjectApp/renderInspector (FR-002 diff-before-port)
export type ThreadType = 'case' | 'investigation' | 'hunt' | 'incident' | 'chat'; // FR-013
export function ThreadView(props: { threadId: string }): JSX.Element;
export function ProposalInspector(props: { proposal: ProposalProperties; evidence: EvidenceProperties[] }): JSX.Element;
// per evidence item renders: summary, kind, provenance, stance, confidence, sensitivityLabel (FR-022);
// per proposal renders: status (7-value union), severity, confidence, evidenceRefs, recommendation (FR-019, FR-021)
```

**Traces**: FR-012, FR-013, FR-020, FR-022

#### 3.3 Port the brief / radar dashboard

**File**: `x-pack/solutions/security/plugins/daybreak/public/application/components/brief/`

**Intent**: The operator landing page summarises open threads, awaiting-review Proposals, and suggested next actions from real data, with the radar-page and chat-dock docking behaviour ported from the prototype (FR-002).

**Contract**:
```typescript
// ports prototype briefView/syncChatDock + BRIEF_EXTRA_CSS (FR-002 diff-before-port)
export function BriefDashboard(): JSX.Element;
// renders: open threads (useProposals), awaiting-review items (status === 'needs-evidence' | 'new'),
//   suggested next actions; includes radar-page + chat-dock docking (FR-015)
```

**Traces**: FR-014, FR-015, FR-020

### Verification:

#### Automated:
- [ ] 3.1 `grep -q 'DaybreakApp' x-pack/solutions/security/plugins/daybreak/public/plugin.ts` succeeds (FR-010) @host:worker-m1max
- [ ] 3.1 New component test asserts `<DaybreakApp/>` renders rail + nav + stage + composer and reaches the data-populated state from a hook fixture (FR-010, FR-011, FR-020) @host:worker-m1max
- [ ] 3.1 `node scripts/jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js public/application/components/shell` passes (FR-010) @host:worker-m1max
- [ ] 3.2 `grep -q "'case' | 'investigation' | 'hunt' | 'incident' | 'chat'" x-pack/solutions/security/plugins/daybreak/public/application/components/thread/` succeeds (FR-013) @host:worker-m1max
- [ ] 3.2 New component test asserts `ProposalInspector` renders every `EvidenceProperties` field (kind/provenance/stance/sensitivityLabel) and the 7-value `ProposalStatus` (FR-012, FR-019, FR-022) @host:worker-m1max
- [ ] 3.2 `node scripts/jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js public/application/components/thread` passes (FR-012, FR-022) @host:worker-m1max
- [ ] 3.3 New component test asserts `BriefDashboard` renders open threads + awaiting-review + next-actions from real-data fixtures (FR-014, FR-020) @host:worker-m1max
- [ ] 3.3 `node scripts/jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js public/application/components/brief` passes (FR-014) @host:worker-m1max
- [ ] 3.1–3.3 phase-2 type_check: `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-010, FR-012, FR-014) @host:worker-m1max
- [ ] 3.1–3.3 phase-2 eslint: `node scripts/eslint --fix $(git diff --name-only HEAD)` passes (FR-010, FR-012, FR-014) @host:worker-m1max
- [ ] 3.1–3.3 `! grep -rE 'freshState|DAY_EVIDENCE|NIGHT_EVIDENCE' x-pack/solutions/security/plugins/daybreak/public/` succeeds — no prototype demo seed reaches the rendered UI (FR-020) @host:worker-m1max

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 3: Permission / Gate Approval Flow

#### 4.1 Port the three-tier gate / permission UI and proposal status

**File**: `x-pack/solutions/security/plugins/daybreak/public/application/components/gate/`

**Intent**: The approval surface must present the prototype's three-tier model (read & gather auto-runs / assemble & draft proposed as a diff / world-changing actions need approval) and reflect the full 7-value `ProposalStatus`, diffed against the prototype (FR-002).

**Contract**:
```typescript
// ports prototype renderSuggest / #permPop / gate-yes / gate-ic (FR-002 diff-before-port)
export type ApprovalTier = 'auto' | 'propose' | 'approval-required'; // read&gather / assemble&draft-as-diff / world-changing (FR-016)
export function ApprovalGate(props: { proposal: ProposalProperties }): JSX.Element;
// renders the tier for the proposal; renders the full ProposalStatus union (new|needs-evidence|approved|modified|dismissed|escalated|deferred) (FR-019)
```

**Traces**: FR-016, FR-019

#### 4.2 Wire gate approval to the server transition route (fail-closed, specific reason)

**File**: `x-pack/solutions/security/plugins/daybreak/public/application/components/gate/`

**Intent**: Accepting a gate applies the Proposal through the existing server readiness gate — the transition to `approved` must fail closed unless `evidenceRefs` and `recommendation` are both non-empty — and when it fails the UI must name the specific missing requirement, never a generic error. The UI does not re-implement the gate rule client-side; it inherits the server's `GateResult`.

**Contract**:
```typescript
// ApprovalGate approve handler calls useProposalTransition().transition(id, 'approved', opts) (2.4 → route 2.1);
// on a 422 carrying missingRequirements, renders the specific requirement ('evidence' | 'recommendation') (FR-018);
// on success, the proposal's status becomes 'approved' (FR-017).
// Gate rule itself is the server property evaluateReadinessGate/requireReadinessGate
//   (research.md §5; gate.ts:62/98, ReadinessGateError gate.ts:35) — not replicated client-side.
```
- New test asserts: a Proposal with empty `evidenceRefs` → approve → UI shows the `evidence` requirement and status stays non-`approved`; a Proposal with `evidenceRefs` + `recommendation` → approve → status becomes `approved`.

**Traces**: FR-017, FR-018, FR-020, FR-021

### Verification:

#### Automated:
- [ ] 4.1 `grep -qE "auto|propose|approval-required" x-pack/solutions/security/plugins/daybreak/public/application/components/gate/` succeeds (FR-016) @host:worker-m1max
- [ ] 4.1 New component test asserts `ApprovalGate` renders all 7 `ProposalStatus` values (FR-019) @host:worker-m1max
- [ ] 4.1 `node scripts/jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js public/application/components/gate` passes (FR-016) @host:worker-m1max
- [ ] 4.2 New test asserts approve on an empty-`evidenceRefs` Proposal surfaces `missingRequirements: ['evidence']` and does not transition to `approved` (FR-017, FR-018) @host:worker-m1max
- [ ] 4.2 New test asserts approve on a complete Proposal transitions status to `approved` (FR-017) @host:worker-m1max
- [ ] 4.2 `node scripts/jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js public/application/components/gate` passes (FR-017, FR-018) @host:worker-m1max
- [ ] 4.1–4.2 phase-3 type_check: `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-016, FR-017) @host:worker-m1max
- [ ] 4.1–4.2 phase-3 eslint: `node scripts/eslint --fix $(git diff --name-only HEAD)` passes (FR-016, FR-017) @host:worker-m1max

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 4: UI-Journey Eval & Visual Diff

#### 5.1 Add the UI-journey E2E eval (reuses PD-3 primitives where present)

**File**: `x-pack/solutions/security/plugins/daybreak/test/ui_journey/daybreak_app.spec.ts`

**Intent**: The acceptance gate requires a live UI journey — app loads → brief renders → thread opens → Evidence renders in inspector → a Proposal gate is approved and applied — asserting on real UI state, not fixed timeouts. Forward: design: research.md §7 establishes the PD-3 `@kbn/evals` harness is not built yet, so "reuse PD-3 primitives" cannot literally hold; this task ships a self-contained Scout+Playwright spec structured to fold into PD-3's harness later, importing its primitives only if they exist at dispatch time.

**Contract**:
```typescript
// Scout spec; run via:
//   node scripts/scout run-tests --arch stateful --domain classic --testFiles x-pack/solutions/security/plugins/daybreak/test/ui_journey/daybreak_app.spec.ts
// journey: load /app/daybreak → BriefDashboard visible → open a thread → ProposalInspector renders Evidence
//   → approve a complete Proposal gate → status transitions to 'approved';
// locators: getByRole/getByLabel/getByText only; assertions: toBeVisible()/waitForResponse()/waitForURL() —
//   NEVER page.waitForTimeout() (A-5 / project convention)
```

**Traces**: FR-012, FR-014, FR-017, FR-020 (satisfies the proposal's UI-journey-eval acceptance gate — shape FR-9, FR-10)

#### 5.2 Add the dark-theme visual diff snapshot for shell + thread + brief

**File**: `x-pack/solutions/security/plugins/daybreak/test/ui_journey/daybreak_visual.spec.ts`

**Intent**: The acceptance gate requires the rendered plugin to match the prototype's dark theme for the shell + one thread + the brief. Token fidelity to the prototype is proven by the 2.3 unit test and the FR-002 diff-before-port discipline; this task pins the real dark-mode render with a committed snapshot so regressions are caught deterministically (no fabricated mockups — real captures of the running UI).

**Contract**:
```typescript
// Scout/Playwright spec capturing the three surfaces in the default dark mode via toHaveScreenshot();
// baseline images committed under test/ui_journey/__snapshots__/; first run establishes the baseline.
// snapshots capture the REAL rendered UI (flag enabled, real-data hooks), not a mockup.
```

**Traces**: FR-004, FR-005, FR-010, FR-012, FR-014

### Verification:

#### Automated:
- [ ] 5.1 `test -f x-pack/solutions/security/plugins/daybreak/test/ui_journey/daybreak_app.spec.ts` succeeds (FR-012, FR-014, FR-017) @host:worker-m1max
- [ ] 5.1 `! grep -rn 'waitForTimeout' x-pack/solutions/security/plugins/daybreak/test/ui_journey/` succeeds — wait-for-state only (A-5) @host:worker-m1max
- [ ] 5.1 `node scripts/scout run-tests --arch stateful --domain classic --testFiles x-pack/solutions/security/plugins/daybreak/test/ui_journey/daybreak_app.spec.ts` passes (FR-012, FR-014, FR-017, FR-020) @host:worker-m1max
- [ ] 5.2 `test -d x-pack/solutions/security/plugins/daybreak/test/ui_journey/__snapshots__` succeeds after first run (FR-004, FR-005) @host:worker-m1max
- [ ] 5.2 `node scripts/scout run-tests --arch stateful --domain classic --testFiles x-pack/solutions/security/plugins/daybreak/test/ui_journey/daybreak_visual.spec.ts` passes against the committed baseline (FR-004, FR-005, FR-010, FR-012, FR-014) @host:worker-m1max
- [ ] 5.1–5.2 `git ls-files -s | awk '$1=="120000"'` prints nothing across the whole change — no tracked symlinks (no-symlinks rule) @host:worker-m1max
- [ ] 5.1–5.2 phase-4 type_check: `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-012, FR-014, FR-017) @host:worker-m1max
- [ ] 5.1–5.2 phase-4 eslint: `node scripts/eslint --fix $(git diff --name-only HEAD)` passes (FR-012, FR-014, FR-017) @host:worker-m1max

#### Manual:
*(none — fully machine-checkable)*
