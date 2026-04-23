## Context

Argus ships today as a set of indices, workflows, and nine `@kbn/argus-*` packages, with a Lens-panel dashboard (`soc-command-center.ndjson`, 48 panels, built by `soc-simulation/setup/dashboards/build.mjs`) serving as the demo read surface. That dashboard is sufficient to answer *"what happened"*, but it cannot render a mutation-lifecycle **graph** nor a per-alert **reasoning drill-down** — the two affordances the Argus deck explicitly pitches as the product surface beyond "a better dashboard".

This change is the first slice of code-inside-`security_solution` for Argus. Prior changes stopped at the package boundary: `@kbn/argus-reasoning-traces` ships the schema and a TS helper, but nothing inside `security_solution` consumes it from React yet. This change adds a deep-link-level app route so the reasoning-chain and lineage become a **navigable UX**, not just inspectable documents.

The scope is intentionally **demo-grade**:

- Thin React shell, feature-flagged off by default.
- Reads real `.soc-*` data (no mocks) so the demo is honest.
- Minimum viable tests (Jest unit on data-access hooks + smoke render tests on each panel; **no** Scout suite in this change).
- Copy is strings in TSX; **no** i18n_check-blocking `i18n.translate()` calls yet (an explicit scope cut — see Decision 7).
- No Storybook, no telemetry events, no persisted layout state.

Production hardening — Scout, i18n resolution, telemetry, Storybook, persisted filters, approve-mutation write path — is a follow-up change on top of this one.

## Goals / Non-Goals

### Goals

- A working route at `/app/security/argus` behind a feature flag, navigable from Security Solution's side-nav.
- Four panels (Pulse, Activity Feed, Mutation Lineage graph, Reasoning Drill-down) that render live data from `.soc-*` indices.
- A Security Solution Alert-flyout button "Show Argus reasoning" that opens Panel 4 inline for the selected alert.
- An Agent Builder skill `security.argus.explain_decision` that returns the same reasoning-chain payload Panel 4 renders, maintaining agent-native parity.
- A single source of truth for reasoning-chain assembly: the builder helper lives in `@kbn/argus-console` and is imported by both the React panel and the skill handler.
- New `argus:read` sub-privilege under the Security Solution feature; route + flyout button are both gated on it.
- Zero new indices, zero new workflows, zero new server APIs. Everything rides on existing M2.1/M2.3/M2.5 surfaces.

### Non-Goals

- **Not** building write paths from the console (no approving mutation_intents, no editing rules, no rollback triggers). Status transitions still flow through `soc-autonomous-applier` — unchanged.
- **Not** replacing the Lens-panel `soc-command-center` dashboard. Both surfaces continue to exist; Pulse reuses Lens embeddables so users see identical numbers.
- **Not** introducing a graph-visualisation library (cytoscape / react-flow / d3). Mutation Lineage is a fixed-shape DAG with ≤ 9 nodes and at most 2 branch points — a deterministic SVG renderer is simpler and has zero bundle cost.
- **Not** building Scout coverage in this change. A follow-up change will add `test/scout/ui/tests/argus/` alongside the production-hardening pass.
- **Not** i18n-resolving every string. Copy lives inline as TSX string literals with `// TODO: i18n` markers; the i18n pass is part of the production-hardening follow-up.
- **Not** persisting filter state across sessions or deep-linking from URL query params. URL deep-links are limited to `?subject_kind=rule|alert&subject_id=<id>` so Panel 3/4 can be opened from the Alert flyout and from the agent skill's return link. All other filter state is in-memory.
- **Not** adding a new plugin. The console lives inside `security_solution` as a sibling of `attack_discovery` / `autonomous_soc`, and the reusable panels live in `@kbn/argus-console`.

## Decisions

### Decision 1: Deep-link inside Security Solution, not a standalone plugin

**Option A (chosen):** Register `argusLinks` in `public/app/links/app_links.ts` the same way `attack_discovery` and `autonomous_soc` are registered. Routes live at `/app/security/argus`.

**Option B:** Ship a new top-level Kibana plugin `@kbn/argus-plugin` registered at `/app/argus`, independent of security-solution.

**Why A:**

1. The Phase-3 design doc commits to `/app/security/argus` explicitly.
2. The Alert flyout integration (Panel 4 opened from an alert) is trivial when both live in the same plugin — shared React context, shared query-client, shared data-view + time-picker state. With a standalone plugin we'd need to pass alert context across app boundaries.
3. The `argus:read` privilege is cleanly modelled as a sub-privilege of the existing Security Solution feature; standalone plugin would need its own Kibana feature registration and operators would have to grant two separate privileges for a single surface.
4. Users land in `/app/security/alerts`, click into an alert, see the "Show Argus reasoning" button — expecting the drill-down to navigate under the same app is strongly idiomatic.

Option B wins on blast-radius isolation (we don't increase `security_solution` bundle size), but that's a secondary concern for demo-grade work. We can extract later if the coupling costs rise.

### Decision 2: Shared panels live in `@kbn/argus-console`, not inside `security_solution/public`

The four panel components + their data-access hooks + the reasoning-chain builder go in a new `@kbn/argus-console` shared-browser package. `security_solution/public/argus/` is ~150 lines: link registration, route component, flyout-button extension point.

**Why:**

1. The reasoning-chain builder must be importable from the Agent Builder skill handler (Node runtime). Putting it in a package keeps the Node/browser split clean — we export a universal function that neither reaches for `window` nor for server-only APIs. If the panels lived in `security_solution/public`, the skill handler couldn't reuse them without reaching across a plugin boundary it isn't allowed to cross.
2. A future change (drift / playbook-learner console panels) can pull the same panels into a different app route without refactoring.
3. Keeps the `security_solution` plugin churn small.

The package is `visibility: private` inside `group: security`, so no other solution can import it.

### Decision 3: Mutation Lineage renders via a deterministic SVG, not react-flow / cytoscape

The lineage DAG has a fixed topology:

```
source → exploit-probability → synthesis → eval → backtest → apply → observe → outcome
                                                                 ↘ rollback ↙
                                                       ↘ drift-detected → eval (re-score) → …
```

At most 9 canonical node types and 2 branch points (rollback from `apply`, drift-detected from `observe`). The data is keyed by `mutation_intent.id` and resolved into nodes by looking up each layer's `.soc-*` document.

**Option A (chosen):** Hand-written SVG renderer using a fixed column-based layout (x-coord = stage index, y-coord = branch row). Nodes are `<rect>` + `<text>`; edges are `<path>` with precomputed control points. ~200 LOC total, zero new deps.

**Option B:** Introduce `react-flow` or `cytoscape` for layout + interactivity.

**Why A:**

1. Topology is fixed — we're not doing general graph layout.
2. Demo-grade scope: zero new bundle cost, zero license review, zero new abstractions to learn.
3. SVG output is trivial to screenshot for PR descriptions and demo recordings.
4. Click handling is native (`onClick` on `<g>`); tooltip is EUI `EuiToolTip`.

If the panel later needs variable topology (e.g., multiple mutations overlaid, zoom/pan), we migrate to react-flow in a separate change. Until then, the SVG is the *simpler thing that works*.

### Decision 4: Data access via internal Kibana routes, not raw browser ES|QL

**Option A (chosen):** Add two internal routes under `security_solution/server/lib/argus/`:

- `POST /internal/security_solution/argus/reasoning_chain` — body `{ subject_kind, subject_id }` → reasoning-chain JSON.
- `POST /internal/security_solution/argus/mutation_lineage` — body `{ subject_kind, subject_id }` → lineage JSON.

Both are thin wrappers around the `ArgusReasoningChainBuilder` and `ArgusMutationLineageBuilder` in `@kbn/argus-console`. Authorization: `requiredPrivileges: ['argus:read']` via `security.authz`.

**Option B:** Client-side ES|QL from the browser using `data.search`.

**Why A:**

1. The reasoning chain joins 3 indices (`.soc-reasoning-trace`, `.soc-actor-trust-tiers`, `.soc-mutation-intents`). Doing it in the browser leaks index shape and forces us to expose full read permissions on raw Argus indices to any Security-Solution-allowed user; doing it in the server lets us gate precisely on `argus:read`.
2. The agent skill needs the same join server-side anyway — one implementation, two consumers.
3. Easier to add caching / response shaping later without changing the UI contract.

Exception: **Panel 1 Pulse uses Lens embeddables directly** (no custom route). We're explicitly reusing the embeddables from the `soc-command-center` dashboard so numbers match.

### Decision 5: Feature flag, not saved-object config

Use the experimental-features framework (`ExperimentalFeatures` interface + `xpack.securitySolution.enableExperimental`). Default: `argusConsoleEnabled: false`.

**Why:**

1. Every unproven Security Solution surface in recent memory lands behind this flag (attack_discovery, autonomous_soc, siem_readiness). Same pattern — operators and support already know how to toggle it.
2. Feature flags are evaluated at plugin start; the deep-link is added or omitted cleanly — no runtime branch in the route. Cheaper than a saved-object config and no migration cost when we flip the default later.
3. Rollback = flip the flag off. No data survives in indices we own (we only read).

### Decision 6: `argus` sub-privilege on the existing Security Solution feature

**Option A (chosen):** Add `argus` as a sub-feature under the existing `siem` Kibana feature (which is how `cases` and `ai_insights` are modelled today). Two actions: `read` and `all`. This change uses only `read`.

**Option B:** Register Argus as a separate top-level Kibana feature.

**Why A:**

1. Operators grant Security Solution as one feature — splitting off a sibling feature would mean every security role now needs two grants.
2. Sub-privilege semantics matter for the future write path: the "approve mutation_intent" flow will need `argus:all`, and modelling it as a sub-privilege of `siem` means we inherit `siem`-level gating (you can't approve an Argus mutation if you don't have alerts read in the first place).
3. Minimal net new code: extend `product_features_security_kibana_sub_features.ts` with one sub-feature entry.

### Decision 7: No i18n resolution in this change

All strings are TSX literals with a `// TODO: i18n` comment. `node scripts/i18n_check --fix` is not expected to be clean against this change.

**Why:**

1. Demo-grade scope — the acceptance criterion is *"a working app route for the demo"*, not production localisation.
2. The Kibana i18n pipeline requires unique translation IDs, a `translations/*.json` entry per locale, and a `docs` cross-reference. For ~60 strings in a console that is behind a feature flag, this is 3-5× the mechanical effort of the React work and adds zero demo value.
3. We explicitly scope i18n resolution as a follow-up change, unblocking this change from the i18n check.

Mitigation: the `node scripts/i18n_check` invocation in the Kibana pre-commit pipeline ignores files that have no `i18n.translate(` calls — so the presence of TSX string literals does not fail the check, it just leaves the strings unlocalized. We mark them.

### Decision 8: Reasoning-chain builder lives in `@kbn/argus-console`, not `@kbn/argus-reasoning-traces`

`@kbn/argus-reasoning-traces` is the **schema** package — it owns the reasoning-trace document shape and nothing else. The **builder** that joins trace + trust-tier + mutation-intent into a panel-ready payload is a UI concern (the shape is driven by what Panel 4 renders). Keeping it in `@kbn/argus-console` means the schema package stays small and generic; the console package carries the read-model builder.

Consequence: the Agent Builder skill handler imports `ArgusReasoningChainBuilder` from `@kbn/argus-console`, not from `@kbn/argus-reasoning-traces`. That's a slightly weird import direction (a skill imports from a console package), but it's the right separation of concerns — the console *owns* the narrative shape; the schema package *owns* the persistence shape.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Security Solution bundle bloat from 4 new panels + SVG renderer | Panels lazy-loaded via `React.lazy`; `@kbn/argus-console` is code-split per panel; SVG renderer is <5KB. Bundle analyzer check in post-flight. |
| Feature flag off = deep-link absent, but the flyout button also needs to be flag-gated — easy to leave a button that opens a broken route | Flyout button reads the same `experimentalFeatures.argusConsoleEnabled` check; single source of truth for the flag. Spec requires both gated together. |
| Reasoning drill-down opens for an alert that doesn't have a reasoning trace (pre-M2.5 alerts) | The endpoint returns `{ chain: [], reason_code: "no_trace" }`; the panel renders an empty-state EuiEmptyPrompt explaining that M2.5 must be active. No crash, no error toast. |
| Mutation lineage SVG breaks on a mutation that skipped stages (e.g., drift-triggered re-score never went through synthesis) | The builder computes `status_by_stage`; missing stages render as dimmed nodes with a "skipped" badge. The topology is fixed; absent = greyed, not removed. |
| Operators with `siem:all` but not `argus:read` see the nav entry but get 403 | The deep-link visibility in the nav is derived from `argus:read`; `capabilities.siem.argus_read` is computed from the privilege. If false, the link is filtered out in `getFilteredLinks`. Specs cover this. |
| Demo-grade coverage gets quietly promoted to "good enough for prod" | `design.md` (this doc) and the tasks file explicitly list the follow-up work as "Phase B — production hardening"; each item is a TODO row. PR template asks for explicit acknowledgement that Phase B hasn't landed. |
| Two consumers (React panel + skill) drift on the reasoning-chain shape | Both import `ArgusReasoningChainBuilder` from the same package; builder is tested by Jest in `@kbn/argus-console` and the output type is the contract. Any shape change is caught at the type-check boundary. |
| SVG click handlers don't scale to screen-reader users | Out of scope for demo-grade (design-review already flagged a11y as Phase B). Nodes carry `role="button"` and `aria-label`; tab-focus + Enter open documents. Full SR traversal order is a Phase B item. |

## Phase-B (production hardening) — tracked, not in this change

- Scout UI test suite `test/scout/ui/tests/argus/` covering each panel end-to-end.
- Scout API test suite covering the two internal routes.
- `i18n.translate(...)` resolution for all console strings; locale coverage via `translations/*.json`.
- Telemetry events: route view, panel switch, filter apply, drilldown open, deep-link followed.
- Storybook stories for each panel; visual regression baselines.
- Persisted filter state (via `sessionStorage` + URL serialization).
- Bundle-size budget in CI.
- Full a11y pass (screen reader traversal order on the lineage SVG; keyboard-only filter control).
- Write path: `argus:all` actions for approving queued `mutation_intent` from the console.

## Migration Plan

- Rollout: land behind flag (`argusConsoleEnabled: false`). No user-visible change on merge.
- Enabling: operators set `xpack.securitySolution.enableExperimental: ['argusConsoleEnabled']` in `kibana.yml` or via advanced settings.
- Rollback: remove the flag entry. The deep-link is gone on next plugin start; no data to migrate (all reads).
- No schema migrations. No workflow changes. No ES index-template bumps.

## Open questions

1. **Alert flyout extension point** — the Alert flyout is actively being refactored (flyout-v2 vs flyout-v1). We should land the "Show Argus reasoning" button on whichever extension point is canonical at merge time. Proposed: resolve by reading `public/detections/components/alerts_table/` at implementation time and matching the current pattern; do not guess now.
2. **Pulse refresh cadence** — Phase-3 design doc proposed 60s. The Lens embeddables have their own refresh controls that we're reusing; default 60s is driven by the saved Lens visualizations themselves. We won't override.
3. **Demo bookmarking** — Phase-3 design doc proposed a saved "Argus demo" view with the three scenario contexts pre-loaded. Deferred to Phase B.
