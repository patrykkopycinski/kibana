## 1. Package scaffolding — `@kbn/argus-console` (+ `@kbn/argus-console-common`)

- [x] 1.1 Create `x-pack/solutions/security/packages/kbn-argus-console/` (`shared-browser`) with `package.json`, `kibana.jsonc`, `tsconfig.json`, `jest.config.js`, `README.md`, owner `@elastic/security-detection-engine`.
- [x] 1.2 Register paths in root `tsconfig.base.json` and `link:` entry in root `package.json`; `yarn kbn bootstrap` resolves cleanly. i18n check opted out (demo-grade).
- [x] 1.3 `index.ts` exports UI components (`ArgusConsole`, four `*Panel` components), hooks, and re-exports all pure types / builders / constants from `@kbn/argus-console-common`.
- [x] 1.4 Extracted pure types + builders into new `@kbn/argus-console-common` (`shared-common`) package so server routes can consume them without pulling in a `shared-browser` module. Same manifest/tsconfig/package.json pattern.

## 2. Shared types + builders (now in `@kbn/argus-console-common`)

- [x] 2.1 `src/types/reasoning_chain.ts` — `ReasoningChain`, `ReasoningStep`, `ReasoningChainSubject`, `ReasoningChainBuildResult` (discriminated on `reason_code`).
- [x] 2.2 `src/types/mutation_lineage.ts` — `MutationLineage`, canonical `LineageNode` / `LineageEdge` unions + `LineageNodeStatus`.
- [x] 2.3 `src/builders/reasoning_chain_builder.ts` — pure `buildReasoningChainFromSpanDocs(docs, subject)`. Degrades gracefully when docs are empty (`reason_code: 'no_trace'`).
- [x] 2.4 `src/builders/mutation_lineage_builder.ts` — pure `buildMutationLineageFromDocs(stageDocs, subject)` that walks canonical SOC stage indices.
- [x] 2.5 Unit tests + fixtures (`src/builders/__fixtures__/`) cover happy path + `no_trace` + skipped stages + drift re-score.

## 3. Data-access hooks (browser)

- [x] 3.1 `src/hooks/use_reasoning_chain.ts` — calls `GET /internal/security_solution/argus/reasoning_chain` (demo uses GET + query params for easier curl debugging; POST body deferred to Phase B).
- [x] 3.2 `src/hooks/use_mutation_lineage.ts` — mirrors 3.1 for the lineage route.
- [x] 3.3 `src/hooks/use_activity_feed.ts` — demo-grade: returns static fixture events; live `.soc-*` aggregation deferred to Phase B.
- [ ] 3.4 Hook-level tests — deferred to Phase B (demo-grade: builder tests cover the data-shaping surface; hooks are thin `fetch` wrappers).

## 4. Panel components

- [x] 4.1 `src/panels/pulse_panel/pulse_panel.tsx` — demo-grade: static summary tiles for the four pressures (Lens embedding deferred to Phase B; the existing Lens dashboard remains the primary visualization surface).
- [x] 4.2 `src/panels/activity_feed_panel/activity_feed_panel.tsx` — filter bar + row list backed by the static hook. Structure matches the target spec so Phase B can swap in live data.
- [x] 4.3 Single row renderer for demo — per-layer `RowMeta` deferred to Phase B.
- [x] 4.4 `src/panels/mutation_lineage_panel/mutation_lineage_panel.tsx` — subject input row, fetches lineage via hook, renders via `LineageGraph`.
- [x] 4.5 `src/panels/mutation_lineage_panel/layout.ts` + SVG render — deterministic column-per-stage layout, cubic Bezier edges, status-coloured nodes, keyboard-focusable `<g>` groups.
- [ ] 4.6 Snapshot tests — deferred to Phase B.
- [x] 4.7 `src/panels/reasoning_drilldown_panel/reasoning_drilldown_panel.tsx` — vertical timeline with confidence bar, confidence-delta, injection-surface chips, actor + trust-tier.
- [x] 4.8 `empty_states.tsx` — `no_trace` and loading (`EuiSkeletonText`) states wired in-line.
- [x] 4.9 `src/argus_console/argus_console.tsx` — root component orchestrates the four panels; reads `alert_id` / `run_id` / `rule_id` URL params to seed the reasoning + lineage subjects.
- [ ] 4.10 Smoke render tests — deferred to Phase B.

## 5. Security Solution plugin wiring

- [x] 5.1 `common/constants.ts` — `ARGUS_PATH = '/argus'`.
- [x] 5.2 `common/experimental_features.ts` — `argusConsoleEnabled: false`.
- [x] 5.3 `src/platform/packages/shared/deeplinks/security/deep_links.ts` — `SecurityPageName.argus = 'argus'`.
- [x] 5.4 `public/argus/links.ts` — `argusLinks: LinkItem`, gated on the flag via `getFilteredLinks`. Demo-grade: capability is `SECURITY_UI_SHOW_PRIVILEGE` (see section 6).
- [x] 5.5 `public/argus/pages/index.tsx` — mounts `<ArgusConsole />`, parses URL query params.
- [x] 5.6 `public/argus/routes.tsx` — route registered via `SecuritySolutionPageWrapper` + `SpyRoute`.
- [x] 5.7 `public/app/links/app_links.ts` — `argusLinks` appended to `appLinks` and filtered in `getFilteredLinks` when the flag is off.
- [x] 5.8 Sub-plugin class `Argus` + wiring through `lazy_sub_plugins.tsx`, `types.ts`, `plugin.tsx`.

## 6. Sub-privilege (demo-grade: deferred)

- [~] 6.1 Reserved capability constants (`ARGUS_CONSOLE_READ_CAPABILITY = 'siem.argus_read'`, `ARGUS_CONSOLE_ALL_CAPABILITY = 'siem.argus_all'`) exported from `@kbn/argus-console-common` with a Phase-B comment.
- [~] 6.2 Demo-grade: the app-route link and flyout action gate on `SECURITY_UI_SHOW_PRIVILEGE` (parity with the autonomous-soc dashboard). A dedicated `argus` sub-feature registration is **deferred to Phase B** to avoid touching feature composition + deprecation mapping in a demo PR.
- [ ] 6.3 Phase B.
- [ ] 6.4 Phase B.

## 7. Server routes

- [x] 7.1 `server/lib/argus/routes/reasoning_chain.ts` — `GET /internal/security_solution/argus/reasoning_chain`. Query schema `{ subject_kind: 'alert' | 'run', subject_id: string }`. Delegates to the shared `fetchReasoningChain` helper (consumed by the agent skill too). `requiredPrivileges: ['securitySolution']` (demo-grade).
- [x] 7.2 `server/lib/argus/routes/mutation_lineage.ts` — mirrors 7.1 for the lineage builder; reads `.soc-*` stage indices with `ignore_unavailable: true` and hands off to `buildMutationLineageFromDocs`.
- [x] 7.3 `server/lib/argus/register_argus_routes.ts` + barrel; `server/routes/index.ts` calls `registerArgusRoutes` only when `experimentalFeatures.argusConsoleEnabled` is on.
- [ ] 7.4 Route-level supertest coverage — deferred to Phase B.

## 8. Alert-flyout integration

- [x] 8.1 Extension point identified in `flyout/document_details/shared/components/take_action_dropdown.tsx` (legacy) and `flyout_v2/document/components/take_action_button.tsx` (v2).
- [x] 8.2 "Show Argus reasoning" action added to both via new `useShowArgusReasoningAction` hook. Visible only when `argusConsoleEnabled` is on, `isAlert` is true, and the existing `useIsInSecurityApp` gate passes.
- [x] 8.3 Selected-alert context passed as `/app/security/argus?alert_id=<id>`; the console seeds both the reasoning and lineage panels from that param and handles `no_trace` gracefully.
- [ ] 8.4 Smoke test for the flyout button — deferred to Phase B (existing flyout tests pass; new action is a thin wrapper around `navigateToApp`).

## 9. Agent skill — `security.argus.explain_decision`

- [x] 9.1 `server/agent_builder/skills/argus_explain_decision/argus_explain_decision_skill.ts` — defined with `defineSkillType`; schema: `{ subject_kind: 'alert' | 'run', subject_id: string }`.
- [x] 9.2 Handler delegates to the same `fetchReasoningChain` helper used by the HTTP route, guaranteeing the agent and the UI reason over identical payloads.
- [x] 9.3 `subject_kind = 'run'` and `subject_kind = 'alert'` are both supported via the shared `ReasoningChainSubject` union.
- [x] 9.4 Registered in `register_skills.ts` behind `experimentalFeatures.argusConsoleEnabled`.
- [x] 9.5 Jest coverage (7 cases) in `argus_explain_decision_skill.test.ts` covers metadata, both `no_trace` paths, the happy path, and the error path. `@kbn/evals` suite extension deferred to Phase B.

## 10. Validation

- [ ] 10.1 `openspec validate argus-console-app-route --strict`.
- [ ] 10.2 `node scripts/eslint --fix $(git diff --name-only HEAD)` — clean on every touched file (run incrementally during implementation).
- [ ] 10.3 Scoped type check for `@kbn/argus-console-common` and `@kbn/argus-console` — clean.
- [ ] 10.4 Scoped type check for `security_solution` — run at the end of the loop (resource-heavy).
- [ ] 10.5 `node scripts/jest x-pack/solutions/security/packages/kbn-argus-console/ --no-cache`.
- [ ] 10.6 `node scripts/jest x-pack/solutions/security/plugins/security_solution/server/agent_builder/skills/argus_explain_decision/ --no-cache` — passes (7/7).
- [ ] 10.7 `node scripts/jest x-pack/solutions/security/plugins/security_solution/server/lib/argus/ --no-cache` — no tests authored (deferred to Phase B), but the jest command should still exit 0.
- [ ] 10.8 `node scripts/check_changes.ts`.
- [ ] 10.9 Manual smoke — outside the scope of this change; runbook lives in `soc-simulation/docs/argus/demo-runbook.md`.

## 11. Phase B — production hardening (tracked here, NOT executed in this change)

- [ ] 11.1 Scout UI suite under `test/scout/ui/tests/argus/`.
- [ ] 11.2 Scout API suite covering `reasoning_chain` + `mutation_lineage` routes.
- [ ] 11.3 `i18n.translate` resolution for all console strings; run `node scripts/i18n_check --fix` clean.
- [ ] 11.4 Telemetry events: route view, panel switch, filter apply, drilldown open, deep-link followed.
- [ ] 11.5 Storybook stories per panel + visual regression baselines.
- [ ] 11.6 Persisted filter state + URL serialization of all filter params.
- [ ] 11.7 Bundle-size budget for `@kbn/argus-console` in CI.
- [ ] 11.8 Full a11y pass — screen-reader traversal order on the lineage SVG, keyboard-only filter control, axe-core clean.
- [ ] 11.9 Write path: `argus:all` actions (approve queued `mutation_intent` from the console) — blocked until trust-policy review.
- [ ] 11.10 Dedicated `siem.argus_read` / `siem.argus_all` sub-feature registration + deprecation mapping + capability derivation tests.
- [ ] 11.11 `POST` bodies for the internal routes (current demo uses `GET` with query params).
- [ ] 11.12 Live Lens embeddings in the Pulse panel (replace demo static tiles).
- [ ] 11.13 Live `.soc-*` aggregation in the Activity Feed (replace demo fixture rows).
- [ ] 11.14 Supertest coverage for the two internal routes.
- [ ] 11.15 `@kbn/evals-suite-argus-reasoning` extension (parity check vs. UI route; `no_trace` regression case).
