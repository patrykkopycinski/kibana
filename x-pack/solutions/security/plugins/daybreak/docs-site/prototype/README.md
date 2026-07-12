# NotDaybreak — Design Workspace (temporary)

Hosted copy of the latest NotDaybreak interactive prototype plus the business-demo run-of-show script.

**GitHub Pages:** https://notdaybreak-design.secpms.co/ (access-controlled — requires GitHub login with access to this repo)

## Contents

| Path | What it is |
| --- | --- |
| `index.html` | Redirects straight into the demo. |
| `Throughline.dc.html` | The interactive prototype (dark mode by default; reload = full state reset). |
| `demo-script/` | Click-by-click presenter script for the three demo flows, with screenshots. Linked from the demo's left rail ("Script") and from Settings. |
| `Discover.dc.html` | Standalone Discover/log-viewer companion mock (not linked; kept for reference). |
| `DayShift.html`, `Throughline-standalone-src.dc.html` | Alternate/self-contained exports from the design tool. |
| `support.js`, `throughline-app.js`, `fonts/` | Prototype runtime. |

## Local changes vs. the design-tool export

Small patches applied for the hosted build (July 6 export — Watches page, autonomous receipts, two-person approvals, shift handoff, impact maps, native dark theme):

- **Dark mode by default** via the build's own `window.__tlThemeOverride` hook, set in `Throughline.dc.html`'s head. The in-app Settings → Theme toggle still works.
- **"Script" item in the left rail** and a matching Settings entry, both opening `demo-script/` (run-of-show v2, four acts).
- Root `index.html` redirects straight into the demo.

Everything else is the design team's export, unmodified. Prototype only — all data is fictional.
