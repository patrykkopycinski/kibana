# Black Hat 2026 MVP — gap analysis (10x-frame)

**Milestone:** 2026-08-04 Black Hat USA  
**Bet:** Demonstrate **one mature Watch Floor worker** (alert-analysis FPR) at **≥9.5 quality** on the golden path, with an **internal E&T evidence pack** per capability — not full Daybreak MVP.  
**Worktree:** `~/Projects/kibana.worktrees/daybreak-spike` (`daybreak-spike`)  
**Updated:** 2026-07-14 (synced with `watch-floor-gap-status.md`)

---

## Frame brief (10x-frame)

| Dimension | Observation | Stated cause / proposed scope | Verified framing |
|---|---|---|---|
| **What we're shipping** | Black Hat demo needs a credible Watch Floor story | "Close all 13 gaps + full MVP" | **Wrong scope.** Milestone is **one worker + evidence pack**, not platform ratification or live Defend dispatch. |
| **Quality bar** | Weekly matrix targets 9.5 on alert-analysis | "More golden rows = done" | **Partial.** Offline gate (7/7 shape) is necessary; **live EIS provenance** (model, tokens, latency) is the E&T slice for Gap #6 — **closed** in spike. |
| **Workflows UX** | Managed workers invisible without Advanced Settings | "Register workers in plugin" | **Closed** — registry + managed install + default `showManagedWorkflows`. |
| **AD integration** | Gap #12 partial | "Wire full AD 2.0 pipeline" | **Closed for demo** — adapter + route + live smoke `ad-proposal` step; full AD agent-builder eval is post-demo. |
| **Approval gate** | Gap #7 open | "Build spike gate harder" | **Closed in spike** — `shared_approval_gate_adapter.ts`; platform HITL (#17944) is upgrade path only. |
| **Customer-zero** | Gap #9 partial | "Operationalize before demo" | **Closed in spike** — operational plan doc; platform sign-off (#17960) is post-demo. |

**Kill criteria (stop expanding scope):**

- Offline golden gate passes (7/7 nominal + broken row fails).
- Live smoke passes on `:5631` with EIS connector (6 steps including AD + endpoint stub).
- Evidence pack doc + `data/daybreak-mvp-verification.json` reproducible from `mvp_gate_verification.mjs`.
- Any item requiring Fleet/Defend live enrollment or platform epic merge → **post-Black Hat**.

---

## Complete MVP gap inventory

### Spike-scope gaps — **all closed** (2026-07-13)

| # | Gap | Status | Resolution signal |
|---|---|---|---|
| 1 | Proposal schema | **closed** | `spike-canonical` + CWL stub + tests |
| 2 | Evidence package | **closed** | schema + builders + `evidence-package-schema.md` |
| 3 | Golden dataset | **closed** | 8 nominal + 1 broken, FPR families |
| 4 | Real agent validation | **closed** | 7/7 live EIS shape match |
| 5 | Live E2E | **closed** | integration test + live smoke (6 steps) |
| 6 | Eval provenance | **closed** | schema v2 + live report script |
| 7 | Shared approval gate | **closed** | spike adapter wired; #17944 = upgrade |
| 8 | CI gate | **closed** | `ci_run_daybreak_gates.sh` + jest parity |
| 9 | Customer-zero | **closed** | `customer-zero-plan-alert-analysis.md` |
| 10 | Demo env | **closed** | Scout `:5631` + seed + walkthrough |
| 11 | Autonomy taxonomy | **closed** | `autonomy_mapping.ts` + UI |
| 12 | AD integration | **closed** | adapter + route + smoke `ad-proposal` |
| 13 | Docs sync | **closed** | gap status + handoff + project-daybreak |

### Black Hat UX / registry — **closed**

| Item | Status | Evidence |
|---|---|---|
| `registerDaybreakWorker` contract | **closed** | `plugin.test.ts` |
| 5 managed workers | **closed** | `builtin_workers.ts` + managed install |
| Managed filter at `/app/workflows` | **closed** | `kibana.dev.eis.yml` override |
| Endpoint Act demo stub | **closed** | `DAYBREAK_STUB_ENDPOINT_ACTIONS` + smoke `endpoint-act-stub` |

### Unified verification harness — **closed**

| Artifact | Purpose |
|---|---|
| `scripts/mvp_gate_verification.mjs` | Orchestrates CI gates + provenance + optional live smoke; writes `data/daybreak-mvp-verification.json` |
| `.ao/daybreak_live_worker_smoke.mjs` | 6-step live probe (login, seed, proposals, AD, endpoint stub, workflow) |
| `scripts/ci_run_daybreak_gates.sh` | Offline jest + eval gate bundle |

---

## Platform / post-demo gaps — **explicitly deferred**

These are **not** Black Hat MVP blockers. Do not scope into `daybreak-spike` without a new bet.

| ID | Gap | Blocker | Post-demo action |
|---|---|---|---|
| P1 | Weekly matrix **9.5** score | `fix/weekly-evals-matrix` + Buildkite weekly export | Run kbn-evals on matrix branch with golden OTLP |
| P2 | Buildkite required check | Kibana monorepo BK pipeline merge | Wire step from `docs/buildkite-daybreak-eval-gate.md` |
| P3 | Golden-cluster OTLP traces | `TRACING_ES_URL` + operator preflight | PR-grade AD 2.0 evidence per operator gate |
| P4 | Shared Workflows HITL gate | security-team **#17944** | Replace spike adapter when platform ships |
| P5 | Proposal schema ratification | security-team **#17942** | Export spike schemas as reference impl |
| P6 | Customer-zero sign-off | security-team **#17960** | InfoSec reviewer sign-off |
| P7 | Live Defend / Fleet dispatch | No enrolled endpoint in Scout cell | `endpoint-lab` profile or `DAYBREAK_STUB_ENDPOINT_ACTIONS=0` |

---

## Capability → evidence mapping (E&T contract)

| Capability | Profile | Dataset | Scorecard | Gates | Provenance |
|---|---|---|---|---|---|
| Alert-analysis FPR worker | `watch-floor-fpr` | `golden_dataset.ts` | `data/daybreak-alert-analysis-eval-report.json` | `mvp_gate_verification.mjs` | `provenance` v2 |
| Managed worker install | `workflows-managed` | 5 builtin IDs | browser `/app/workflows` | `worker_registry.test.ts` | n/a |
| Endpoint Act (isolate/processes) | `endpoint-act` | demo proposals | smoke `endpoint-act-stub` | jest + smoke | stub mode |
| AD → Proposal adapter | `ad-integration-slice` | `attack_discovery_dataset.ts` | smoke `ad-proposal` | jest | offline |

Full pack: [`blackhat-evidence-pack-watch-floor-fpr.md`](./blackhat-evidence-pack-watch-floor-fpr.md).

---

## Bets summary

| Bet | Hypothesis | Resolution signal | Status |
|---|---|---|---|
| FPR worker demo-ready | Offline + live shape gates pass on EIS Sonnet | 7/7 live + eval `gatePassed: true` | **met** |
| Workflows UX demo-ready | Operators see 5 managed workers without settings toggle | Browser verify Managed filter | **met** (config default) |
| E&T pack auditable | Internal doc + JSON artifacts reproducible | `mvp_gate_verification.mjs` exit 0 | **met** (offline); live via `RUN_LIVE=1` |
| AD slice credible | Adapter maps AD row to investigation Proposal | smoke `ad-proposal` + jest | **met** |
| Endpoint Act credible | Act route returns stubbed success without Fleet | smoke `endpoint-act-stub` | **met** |

---

## Harness commands

```bash
# Full spike MVP verification (offline; add RUN_LIVE=1 for live stack)
node x-pack/solutions/security/plugins/daybreak/scripts/mvp_gate_verification.mjs

# Live stack only
KIBANA_URL=http://localhost:5631 \
  node x-pack/solutions/security/plugins/daybreak/.ao/daybreak_live_worker_smoke.mjs

# Offline CI bundle only
bash x-pack/solutions/security/plugins/daybreak/scripts/ci_run_daybreak_gates.sh
```

---

## References

- `docs/watch-floor-gap-status.md` — 13-gap checklist (demo-scope vs platform-scope — see status column)
- `docs/blackhat-evidence-pack-watch-floor-fpr.md` — E&T evidence pack
- `docs/buildkite-daybreak-eval-gate.md` — BK wiring sketch (P2)
- `scripts/mvp_gate_verification.mjs` — unified resolution signal
