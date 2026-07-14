# Customer-zero plan — alert-analysis worker (Gap #9)

**Profile:** `watch-floor-fpr` / `daybreak-alert-analysis-worker`  
**Status:** Spike-operational (internal demo). Platform sign-off: security-team#17960.

## Pre-demo checklist (operator)

1. Kibana `:5631` with `xpack.daybreak.enabled=true` and EIS connectors (`config/kibana.dev.eis.yml`).
2. Seed demo data: `POST /api/daybreak/seed-demo` with `{ "confirm": true }`.
3. Offline gate green: `node x-pack/solutions/security/plugins/daybreak/scripts/daybreak_eval_gate.mjs`.
4. Live smoke green: `KIBANA_URL=http://localhost:5631 node .ao/daybreak_live_worker_smoke.mjs`.
5. Evidence pack current: `docs/blackhat-evidence-pack-watch-floor-fpr.md`.

## Demo narrative (customer-zero internal)

| Step | Surface | Success signal |
|---|---|---|
| 1 | Watches console | Proposal appears with autonomy label |
| 2 | Approval gate UI | Readiness gate blocks approve without evidence |
| 3 | Worker run | Alert-analysis managed workflow executes |
| 4 | Act (optional) | Stub endpoint response when no Fleet (`DAYBREAK_STUB_ENDPOINT_ACTIONS` default on) |
| 5 | Eval artifact | `data/daybreak-alert-analysis-eval-report.json` gatePassed true |

## Sign-off gates (post-spike)

- [ ] InfoSec review of demo data classification (#17960)
- [ ] Customer-zero reviewer walkthrough recorded
- [ ] Production Fleet enrollment for live Defend dispatch (disable stub: `DAYBREAK_STUB_ENDPOINT_ACTIONS=0`)

## References

- Evidence pack: `docs/blackhat-evidence-pack-watch-floor-fpr.md`
- Demo walkthrough: `docs/demo-walkthrough.md`
