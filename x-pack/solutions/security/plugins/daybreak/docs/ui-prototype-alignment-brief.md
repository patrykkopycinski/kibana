# Daybreak UI ↔ Throughline prototype alignment (Frame Brief)

**Date:** 2026-07-13  
**Scope:** `daybreak-spike` Kibana plugin `public/` layer  
**Authority:** `docs-site/prototype/` (vendored from `elastic/tmp-project-notdaybreak-design-workspace`)

## Gap status (2026-07-14)

| Gap | Status |
|---|---|
| Token layer (`--db-*` → Throughline vars) | ✅ Done |
| `rail.tsx` wired into `shell.tsx` | ✅ Done |
| Rail active (`.rail-item.on` panel + shadow) | ✅ Done |
| Nav queue active (`.navp-am.on` accent border) | ✅ Done |
| Shell grid 8px gaps | ✅ Done |
| Brief radar (`rad-mini`, `decision-sec`, `rad-feat-card`) | ✅ Done |
| Decision/severity colors → token vars | ✅ Done |
| Thread spine + message bubbles + type badges | ✅ Done |
| Inspector Evidence tab (`ProposalEvidenceCard`) | ✅ Done |
| Gate HITL chrome (`hitl-gate`) | ✅ Done |
| `theme.mapping.md` FR-001 vendored status | ✅ Done |
| Consoles parity (watches/workers/performance) | ✅ Done |
| Kibana global header above shell | Expected delta |

## Observation (what we see today)

The spike has a **functionally rich** Throughline-shaped shell (rail + nav + stage + inspector + composer) with real proposal/watch/workflow data. Visually it **does not match** the design prototype: chrome uses ad-hoc `--db-*` hex literals in `daybreak_visual_styles.tsx` while `theme.ts` / `theme.mapping.md` document the canonical Throughline token bridge that **almost nothing consumes**.

## Stated cause vs verified cause

| Stated | Verified |
|---|---|
| "Need more UI polish" | Token layer bypassed — `--db-*` ≠ prototype `--ink-*` / `--shell` / `--panel` |
| "Wire missing features" | Structural gaps too: `rail.tsx` unused, `ProposalInspector` orphaned, composer/search disabled |
| "Match EUI" | Prototype is EUI-grounded but uses **literal Throughline CSS vars** (`throughline-app.js` `TL_CSS` `:root` block) — not raw EUI class names |

## Problem (what we're solving)

Operators and demo reviewers must **recognize Daybreak as the Throughline design** — same palette, density, rail/nav/stage proportions, brief radar cards, inspector tabs, gate affordances — without waiting for platform epics.

## Proposed solution (phased, in-place)

No new plugin boundary. Port prototype tokens → consume in existing components.

### Phase 0 — Token bridge (P0, blocks everything)

- Add `throughline_tokens.ts` with literal vars from `throughline-app.js` `:root` + `Throughline.dc.html` `body.theme-dark`
- Rewrite `daybreak_visual_styles.tsx` to emit `--ink-*`, `--shell`, `--panel`, `--blue`, `--r-lg`, `--sh-*` (drop `--db-*`)
- Default **dark** when Kibana `colorMode === 'DARK'` (prototype hosted build uses `__tlThemeOverride = true`)
- Update `theme.mapping.md` FR-001 status: prototype **is** vendored

**Acceptance:** Side-by-side screenshot — shell background `#060B15` (dark) / `#edecea` (light), nav panel white/dark panel matches prototype.

### Phase 1 — Shell structure (P0)

- Wire `rail.tsx` into `shell.tsx` (delete duplicated inline rail)
- Align dimensions: `--rail-w:64px`, nav `272px`, inspector `360px` (from prototype layout)
- Map destination keys to prototype `go()` destinations (`home`→brief, `agents`→watches console, etc.)
- Enable nav search + composer chrome (can remain disabled functionally with prototype placeholder copy)

**Acceptance:** `.ao/daybreak_smoke_pd4b_component_alignment.js` passes; rail active state matches prototype.

### Phase 2 — Brief + thread surfaces (P1)

- `brief_dashboard.tsx`: radar cards use prototype classes (`rad-card`, `rad-mini`, `decision-sec`) + token vars
- `thread_view.tsx`: message bubbles, spine header, `thread_type_badge` colors from `--t-case` / `--t-inv` / etc.
- Priority card + overnight digest: match `briefView()` gradient + callout styles from prototype

**Acceptance:** Brief dashboard visually indistinguishable from prototype `briefView` at 1440×900 (manual diff).

### Phase 3 — Inspector + gate (P1)

- Wire `proposal_inspector.tsx` into `inspector_panel.tsx` Evidence tab (replace minimal placeholder)
- Gate: `approval_gate.tsx` blast-radius layout matches prototype `renderInspector` HITL block
- Object-app tabs: stub Discover/Records/Alerts with prototype tab chrome (embed later)

**Acceptance:** Select `pr-seed-001` → inspector shows evidence cards with provenance styling from prototype.

### Phase 4 — Consoles parity (P2) ✅

- `agents_console_primitives.tsx` — shared `AgentsPagePad`, `AgentsSectionHeader`, `AutonomyMeter`, `watchAccentColor`
- `watches_console.tsx` — prototype `agrid` / `agcard` grid + `wt-hback` detail drill-in
- `workflows_console.tsx` — vertical `auto-list` pipeline cards (`apipe`, `sk-chip`)
- `performance_console.tsx` — `perf-stats`, `perf-tbl`, callout layout
- `daybreak_visual_styles.tsx` — agent control plane CSS block

### Phase 5 — Verification loop (ongoing)

- Host prototype locally: `docs-site/prototype/Throughline.dc.html` via static server
- Kibana: `http://localhost:5631/app/daybreak` (SSH tunnel from laptop)
- `frontend-design-review` skill at 1440 / 768 / 375 breakpoints
- Playwright: extend `test/scout_ui_journey/ui/tests/daybreak_app.spec.ts` with visual regression snapshots (optional Argos)

## Out of scope (this initiative)

- Platform Proposal schema (#17942) — UI uses local spike shapes
- Cloud golden OTLP / weekly matrix 9.5
- Full Agent Builder converse in thread stream (functional; styling only here)

## Risks

| Risk | Mitigation |
|---|---|
| Shared ES + dual Kibana pollutes demos | Stop `:15001` weekly-evals when demoing `:5631` |
| EUI `!important` fights custom CSS | Scope overrides under `.daybreakVisualShell` only |
| Prototype re-vendor drift | Diff `TL_CSS :root` block on each re-vendor; single source `throughline_tokens.ts` |

## Files (canonical paths on `daybreak-spike`)

```
x-pack/solutions/security/plugins/daybreak/
├── docs/ui-prototype-alignment-brief.md          ← this file
├── docs-site/prototype/                            ← design authority
├── public/application/
│   ├── throughline_tokens.ts                       ← NEW
│   ├── theme.ts / theme.mapping.md                 ← update FR-001
│   └── components/
│       ├── daybreak_visual_styles.tsx              ← rewrite
│       ├── shell.tsx                               ← wire rail
│       ├── rail.tsx
│       ├── brief/brief_dashboard.tsx
│       ├── inspector/inspector_panel.tsx
│       └── proposal/proposal_inspector.tsx
└── .ao/daybreak_smoke_pd4b_component_alignment.js
```

## Next action when `worker-m1max` is reachable

```bash
# From laptop (staged artifacts in patryks-treadmill/.tmp-export/daybreak-ui-parity/)
scp -r .tmp-export/daybreak-ui-parity/public/* \
  mac@worker-m1max:/Users/mac/Projects/kibana.worktrees/daybreak-spike/x-pack/solutions/security/plugins/daybreak/public/application/

scp .tmp-export/daybreak-ui-parity/docs/ui-prototype-alignment-brief.md \
  mac@worker-m1max:/Users/mac/Projects/kibana.worktrees/daybreak-spike/x-pack/solutions/security/plugins/daybreak/docs/

# Restart Kibana on :5631, then visual smoke
```
