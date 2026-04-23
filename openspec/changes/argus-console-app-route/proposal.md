## Why

Argus today surfaces through two read channels: a Lens-panel dashboard (`soc-command-center.ndjson`, 48 panels) that unblocks the demo, and raw `.soc-*` indices in Discover. Both are useful for operators who already know the schema, but neither answers the two questions the demo pitch commits to:

1. **"Is Argus working right now?"** — a glanceable, cross-layer health surface.
2. **"Why did Argus do X?"** — a drill-down from any alert / mutation / action to the reasoning chain and governance state at the time.

The Lens dashboard can show Pulse-like metrics, but it cannot render a **mutation lineage graph** (source → exploit-probability → synthesis → eval → backtest → apply → observe → outcome, with branches for rollback / drift) and it cannot open a per-alert reasoning drill-down that walks through the M2.5 trace chain with confidence-deltas and injection-surface flags. Those two surfaces — highlighted on the Argus deck as *"deferred post-demo, needs separate design review"* — are the smallest things that make the demo land as a product, not a dashboard.

The Phase-3 design doc (`soc-simulation/docs/argus/phase-3/argus-console.md`) lays out a four-panel console (Pulse, Activity Feed, Mutation Lineage, Reasoning Drill-down) rendered at `/app/security/argus`. All required raw data already flows into `.soc-*` indices (`.soc-recommendations`, `.soc-reasoning-trace`, `.soc-detection-eval-runs`, `.soc-mutation-intents`, `.soc-outcomes`, `.soc-actor-trust-tiers`). What's missing is a thin React app-route inside Security Solution that composes those signals into the two operator narratives above.

This change is scoped **demo-grade**: minimum viable React shell, feature-flagged, reading real `.soc-*` data, wired into the existing Security Solution privilege + navigation surface. Production hardening (Scout coverage, i18n resolution for all copy, full telemetry, Storybook) is explicitly a follow-up.

## What Changes

- Register a new top-level Security Solution deep-link at `/app/security/argus` gated behind experimental feature flag `argusConsoleEnabled`. The deep-link follows the exact pattern already used by `public/attack_discovery/` (links.ts + pages/ + routes.tsx + SecurityPageName enum entry).
- Introduce a new sub-privilege `argus` under the existing Security Solution feature, with `read` and `all` actions. `read` is sufficient for every panel in this change; `all` is reserved for a later change that will permit approving queued `mutation_intent` documents from the console.
- Ship a new shared-browser package `@kbn/argus-console` under `x-pack/solutions/security/packages/` hosting the four panels plus their data-access hooks. Security Solution's `public/argus/` module is a thin integration layer: link registration, route wiring, app-wide provider, flyout button.
- **Panel 1 — Pulse** (`PulsePanel`): top-of-fold row of Lens embeddables + custom metric cards. Reuses the `embeddable` plugin so charts match the Lens dashboard 1:1. Data source: `.soc-detection-eval-runs`, `.soc-outcomes`, `.soc-actor-trust-tiers`, `.soc-recommendations`.
- **Panel 2 — Activity feed** (`ActivityFeedPanel`): chronological stream of Argus events across the five layers. Filters by layer / pressure / actor / trust tier. Each row deep-links to (a) the underlying `.soc-*` document via Discover, (b) the associated reasoning-trace `run_id`, (c) the originating alert when `alert_id` is present.
- **Panel 3 — Mutation Lineage** (`MutationLineagePanel`): given a `rule_id` or `alert_id`, renders a DAG of the mutation's lifecycle — source → exploit-probability → synthesis → eval → backtest → apply → observe → outcome, with rollback and drift-detected branches. Uses a local SVG renderer (no new graph library). Each node is clickable and opens the underlying Argus document in a side panel.
- **Panel 4 — Reasoning drill-down** (`ReasoningDrilldown`): given an `alert_id` or `run_id`, renders the M2.5 reasoning-trace chain with per-step confidence, confidence-delta, injection-surface flags, and the trust tier of each actor at decision time. Reachable from the Console's Activity Feed rows and from the Security Solution Alert flyout via a new "Show Argus reasoning" button.
- Register an agent-native counterpart: a new Agent Builder skill `security.argus.explain_decision` under `soc-simulation/skills/` that given an `alert_id` returns the same reasoning chain + annotations as structured JSON. Every UI affordance in the console must be reachable via this skill — maintains the agent-native-parity rule.

## Capabilities

### New Capabilities

- `argus-console-route`: registers the `/app/security/argus` deep-link inside Security Solution, gated by the `argusConsoleEnabled` experimental flag and the new `argus:read` sub-privilege.
- `argus-console-pulse-panel`: renders the top-of-fold "is Argus working" summary from `.soc-*` signals.
- `argus-console-activity-panel`: renders the chronological cross-layer event feed with filter chips and per-row deep-links.
- `argus-console-mutation-lineage-panel`: given a subject (`rule_id` or `alert_id`), renders a DAG of that mutation's lifecycle with clickable nodes.
- `argus-console-reasoning-drilldown`: given a subject (`alert_id` or `run_id`), renders the reasoning-trace chain with confidence and governance annotations. Exposes a flyout-button integration that Security Solution's Alert flyout mounts.
- `argus-explain-decision-skill`: Agent Builder skill `security.argus.explain_decision` returning the same reasoning chain + annotations as JSON; preserves agent-native parity for Panel 4.

### Modified Capabilities

(none — this is the first set of specs that require the Argus Console route; prior change `soc-operator-ux-upgrades` added the underlying index schemas and is orthogonal to this one)

## Impact

- **New packages**: `x-pack/solutions/security/packages/kbn-argus-console/` (shared-browser) with the four panel components, data-access hooks, and types. `kibana.jsonc` owner `@elastic/security-detection-engine`, `group: security`, `visibility: private`.
- **Security Solution plugin** (`x-pack/solutions/security/plugins/security_solution/`):
  - `common/constants.ts` — add `SecurityPageName.argus = 'argus'` and `ARGUS_PATH = '/argus'`.
  - `common/experimental_features.ts` — add `argusConsoleEnabled: false` default.
  - `server/features/product_features_security_kibana_sub_features.ts` — add `argus` sub-feature with `read` and `all` actions.
  - `public/argus/links.ts` — new file, mirrors `public/attack_discovery/links.ts`.
  - `public/argus/pages/index.tsx` — mounts `@kbn/argus-console` `ArgusConsole` component.
  - `public/argus/routes.tsx` — registers the route with the security router.
  - `public/app/links/app_links.ts` — register `argusLinks` in the exported `appLinks` array (filtered by flag in `getFilteredLinks`).
  - `public/detections/components/alerts_table/timeline_actions/alert_context_menu.tsx` (or the current extension point) — add "Show Argus reasoning" action opening the drill-down in the existing flyout shell.
- **Agent skill** (`soc-simulation/skills/`): new `security-argus-explain-decision.yaml` + supporting TypeScript handler under `@kbn/argus-console` exporting the reasoning-chain builder both the UI and the skill consume (single source of truth).
- **No new Elasticsearch indices**. No new workflows. No schema changes. Everything is a read surface over indices this project already populates.
- **No runtime Python**. TypeScript + Elastic workflows + Kibana panels only, per project convention.
- **Feature-flagged**: route does not appear in the nav unless `argusConsoleEnabled` is set on the advanced-settings toggle. Safe to land without affecting existing Security Solution behaviour.
- **Backwards compatibility**: no existing surface changes behaviour. The new "Show Argus reasoning" button only appears in the alert flyout when the flag is on. Removing the flag removes the console cleanly.
