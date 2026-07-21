---
change_id: daybreak-ui-panel-throughline-prototype
status: draft
created_at: 2026-07-09
treadmill_artifact_version: 1
feature_id: f943d973-90ab-4834-8e7f-d7fed23afe31
feature_slug: daybreak-s1-alert-analysis-worker-spike
---
# PD-4: Kibana UI Panel aligned to the Throughline (NotDaybreak) design prototype

## Why
The feature description explicitly promises "a real Kibana UI panel" (FR-11), but PD-1/PD-2/PD-3 are all server-side — workflow engine shape validation, the 5-phase Alert-Analysis worker core, and the @kbn/evals harness. The product's visual + interaction source-of-truth is the vendored Throughline prototype at `docs-site/prototype/` (entry `Throughline.dc.html`, app `throughline-app.js`, helpers `support.js`). The worker's Evidence + Proposal output (from the PD-2 store modules under `x-pack/solutions/security/plugins/daybreak/server/client/`) has no surface to render into. This builds the `public/` layer of the daybreak plugin so the UI matches the prototype, not a generic Kibana chrome (see PD-4).

## What Changes
- **Design token system + theming** — port the prototype's CSS custom-property layer (neutrals, semantic, thread-type, shape tokens) from `throughline-app.js` and the theme overrides (`applyAccent`/`applyTheme`/`applyRadius`/`applyShadow`) from `Throughline.dc.html`; map onto EUI tokens where 1:1; support light and dark, defaulting to the prototype's dark build.
- **Application shell** — port the rail, thread list/nav, main stage, and composer into the plugin's top-level React route component.
- **Thread / conversation view** — port message bubbles, tool-call cards, evidence/timeline/narrative/MITRE panels, status dots, severity pills, and the inspector; thread types case / investigation / hunt / incident / chat.
- **Brief / radar dashboard** — port the operator landing page (open threads, awaiting-review items, suggested next actions) plus radar-page and chat-dock docking logic.
- **Permission / gate approval flow** — port the permission popover and gate UI ("read & gather auto-runs / assemble & draft proposed as a diff / world-changing actions need approval"); wire approval actions to the worker's Proposal-emission output (PD-2 hook 6, FR-7).
- **Data wiring (not mocked)** — replace the prototype's in-memory `freshState()` seed with real data from the plugin's HTTP API → the PD-2 Evidence store (hook 3, FR-4) and Proposal store (hook 6); the UI renders real worker output (FR-11), not demo seed.

## Impact
- Adds the `public/` layer of `x-pack/solutions/security/plugins/daybreak`, registering a Kibana application route under the existing `daybreak` experimental flag (default off) (NFR-2).
- Touches the plugin's React tree, a new `theme.ts`, and HTTP-client wiring to the PD-2 server stores.
- Verification: `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` and `node scripts/eslint --fix` pass on all new `public/` files.
- A UI-journey eval reuses the PD-3 @kbn/evals primitives (FR-9) — app loads → brief renders → thread opens → Evidence renders in inspector → a Proposal gate is approved and the proposal is applied; Playwright assertions use explicit wait-for-state, never fixed timeouts (A-5). No parallel harness.
- Visual diff: the rendered plugin matches the prototype's dark theme for shell + one thread + the brief.
- Scope boundary: defers the prototype's future-app-surface stubs (Discoveries, DeepWatch, Streams, Watches, Workflows, Skills, Activity, Performance, Guardrails, AgentsHub, Hunt, projects, templates) to follow-up plans; lands only analyst chat + brief + inspector + gates.
- Execution: on the dedicated M1 Max remote worker (i9 retired as of PD-3), reusing the feature's existing worktree `ao/feat-daybreak-s1-alert-analysis-worker-spike`.

## Open Questions
- PD-2's worker-core output (Evidence + Proposal stores) was uncommitted as of shaping. Is it present in the worktree at dispatch time, or must the first task reconcile/reconstitute PD-2 before UI is built against it?

## Suggested Enhancements (not in original description)
- **(suggested, not in original description)** Capture the ported-token → EUI-token mapping as a reference table alongside `theme.ts` so future surface ports stay consistent.
- **(suggested, not in original description)** Record, per ported surface, the prototype revision it was diffed against — the description requires re-vendor/diff before each port; a traceability log makes that auditable.
