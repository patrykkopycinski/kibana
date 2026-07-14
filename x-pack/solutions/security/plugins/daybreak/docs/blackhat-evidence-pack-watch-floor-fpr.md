# Black Hat evidence pack — Watch Floor FPR (alert-analysis)

**Capability:** Alert-analysis false-positive reduction worker  
**Profile ID:** `watch-floor-fpr`  
**Demo date target:** 2026-08-04  
**Environment:** `worker-m1max`, Kibana `:5631`, `config/kibana.dev.eis.yml`  
**Generated:** 2026-07-13

---

## 0. MVP scope boundary

**Black Hat bet (2026-08-04):** demonstrate **one mature alert-analysis FPR worker** with an **internal E&T evidence pack** per **demonstrated** capability — **not** full Daybreak MVP, platform ratification, or live Defend dispatch.

Closing all 13 Watch Floor **spike gaps** makes the demo credible; it does **not** mean Daybreak MVP is complete. This pack documents only what the spike can reproduce and what the PM demo actually shows.

### In scope (this pack)

| Capability | Profile | Evidence in this doc |
|---|---|---|
| Alert-analysis FPR worker (primary) | `watch-floor-fpr` | §§1–6 below |
| Managed worker install | `workflows-managed` | Annex A |
| Endpoint Act (demo stub) | `endpoint-act` | Annex B |
| AD → Proposal slice | `ad-integration-slice` | Annex C |
| Watch Officer / SSE / Investigation UI | `pm-demo-slices` | Annex D + screenshot index |

### Out of scope (post-demo — do not claim in pack)

| Item | Why deferred | Track elsewhere |
|---|---|---|
| Weekly matrix **9.5** score | Requires `fix/weekly-evals-matrix` + Buildkite weekly export | P1 in `blackhat-mvp-gap-analysis.md` |
| Buildkite required check | Kibana monorepo BK pipeline merge | P2 / `buildkite-daybreak-eval-gate.md` |
| Golden-cluster OTLP traces | `TRACING_ES_URL` + operator preflight | P3 |
| Shared Workflows HITL gate | Platform epic | security-team **#17944** (P4) |
| Proposal schema ratification | Platform epic | security-team **#17942** (P5) |
| Customer-zero sign-off | InfoSec reviewer | security-team **#17960** (P6) |
| Live Defend / Fleet dispatch | No enrolled endpoint in Scout cell | P7 / `endpoint-lab` |
| Mike Paquette PR #11 merge | Terminology alignment in flight | project-daybreak **#11** |
| Full Dark Watch / Deep Watch product | Beyond single-worker demo | Post-Black Hat initiative |

### Kill criteria (stop expanding scope)

- Offline golden gate passes (8/8 nominal + 1 broken fails).
- Live smoke passes on `:5631` with EIS connector (6 steps including AD + endpoint stub).
- `mvp_gate_verification.mjs` + `data/daybreak-mvp-verification.json` reproducible.
- Anything requiring Fleet enrollment, platform epic merge, or weekly matrix export → **post-Black Hat**.

**Core FPR narrative has no dependency on #17944, #17960, or Fleet.**

---

## 1. Profile

| Field | Value |
|---|---|
| Worker YAML | `server/workflow/alert_analysis_worker.yaml` |
| Managed workflow ID | `daybreak-alert-analysis-worker` |
| Runtime registry | `server/workflow/worker_registry.ts` |
| Builtin definitions | `server/workflow/builtin_workers.ts` |
| Phase model | Setup → Guard → Enrich → Reason → Act (5-phase YAML) |
| Autonomy mapping | `server/common/contracts/autonomy_mapping.ts` |
| Model (live) | EIS `anthropic-claude-5-sonnet` (verified 2026-07-13) |
| Model (offline gate) | `offline-deterministic-gate` (no LLM) |

---

## 2. Dataset

| Field | Value |
|---|---|
| Name | `daybreak-golden-alert-analysis-v1` |
| Source | `server/evals/golden_dataset.ts` |
| Rows | 8 nominal + 1 deliberately broken |
| Families | benign admin activity, duplicate cluster, low-confidence noise, missing entity, contradictory context, escalation-worthy, monitor-only, broken shape probe |
| AD slice (Gap #12) | `server/evals/attack_discovery_dataset.ts` — includes `ad-blackhat-golden-path` (see Annex C) |

**Regenerate offline artifact:**

```bash
cd ~/Projects/kibana.worktrees/daybreak-spike
node x-pack/solutions/security/plugins/daybreak/scripts/daybreak_eval_gate.mjs
```

---

## 3. Scorecard

### Offline gate (deterministic)

| Metric | Target | Last verified |
|---|---|---|
| Nominal shape match | 8/8 | 2026-07-13 |
| Broken row fails | 1/1 | 2026-07-13 |
| `summary.gatePassed` | `true` | 2026-07-13 |
| Schema version | `2` | — |

Artifact: `data/daybreak-alert-analysis-eval-report.json`

### Live EIS gate (agent output)

| Metric | Target | Last verified |
|---|---|---|
| Sequential golden score | 7/7 shape matches | 2026-07-13 |
| Harness | `.ao/score_golden_sequential.mjs` | — |
| Smoke | `.ao/daybreak_live_worker_smoke.mjs` | — |

**Black Hat quality bar:** offline gate **must** pass; live gate **should** match offline nominal count. Matrix 9.5 is a separate weekly matrix export — track via `fix/weekly-evals-matrix`, not this spike branch alone.

---

## 4. Known failures & mitigations

| Failure mode | Symptom | Mitigation | Demo impact |
|---|---|---|---|
| Broken row passes | `gatePassed: false` | Fix `offline_dataset_gate.ts` scorer | Blocks ship |
| Live shape drift | Sequential score < 7/7 | Tighten worker YAML / prompt | Show offline gate + explain live variance |
| Managed workflows hidden | Empty `/app/workflows` | `uiSettings.overrides.workflows:ui:showManagedWorkflows: true` | **Fixed** in `kibana.dev.eis.yml` |
| No Fleet hosts | `endpoint_not_found` on Act | Demo uses structured error + UI flyout | Expected; narrate as post-enrollment |
| Shared approval gate missing | Spike gate only | `server/client/proposals/gate.ts` | Accept for demo; #17944 tracks platform |

---

## 5. Gates (verification commands)

```bash
# From Kibana repo root (daybreak-spike worktree)

# Offline CI gate (jest + JSON report)
node x-pack/solutions/security/plugins/daybreak/scripts/daybreak_eval_gate.mjs

# Plugin contract (registerDaybreakWorker identity)
yarn jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js \
  --testPathPattern="server/plugin.test" --maxWorkers=4 --workerIdleMemoryLimit=512MB

# Worker registry
yarn jest --config x-pack/solutions/security/plugins/daybreak/jest.config.js \
  --testPathPattern="server/workflow/(worker_registry|run_daybreak_worker)" \
  --maxWorkers=4 --workerIdleMemoryLimit=512MB

# Live stack (Kibana on :5631)
KIBANA_URL=http://localhost:5631 \
  node x-pack/solutions/security/plugins/daybreak/.ao/daybreak_live_worker_smoke.mjs

# Live provenance report (Gap #6 — merges env overrides into eval report)
DAYBREAK_EVAL_MODEL_ID=anthropic-claude-5-sonnet \
DAYBREAK_EVAL_LATENCY_MS=4200 \
DAYBREAK_EVAL_INPUT_TOKENS=12000 \
DAYBREAK_EVAL_OUTPUT_TOKENS=1800 \
  node x-pack/solutions/security/plugins/daybreak/.ao/generate_live_provenance_eval_report.mjs
```

---

## 6. Provenance (schema v2)

Eval reports include a `provenance` block (`generate_eval_report.ts`):

```json
{
  "modelId": "anthropic-claude-5-sonnet",
  "connectorId": "eis-anthropic-claude-5-sonnet",
  "inputTokens": 12000,
  "outputTokens": 1800,
  "latencyMs": 4200,
  "costBasis": "priced"
}
```

| Run type | `costBasis` | Source |
|---|---|---|
| Offline gate | `self-hosted` | `OFFLINE_GATE_DEFAULT_PROVENANCE` |
| Live EIS | `priced` | `.ao/generate_live_provenance_eval_report.mjs` or trace export |

---

## 7. Screenshot index

All captures under `docs/evidence/`, taken 2026-07-13 on `:5631` (`kibana.dev.eis.yml`).

| File | Role | Demo use |
|---|---|---|
| `pm-demo-ui-brief-2026-07-13.png` | **Shown in demo** | Brief tab — daybreak overview |
| `pm-demo-ui-agents-2026-07-13.png` | **Shown in demo** | Agents tab — `daybreak-alert-analysis-agent` |
| `pm-demo-ui-workflows-2026-07-13.png` | **Shown in demo** | Workers tab — managed worker list |
| `pm-demo-ui-performance-2026-07-13.png` | **Shown in demo** | Performance tab — 15 eval runs, 100% shape-match |
| `pm-demo-ui-investigations-2026-07-13.png` | **Shown in demo** | Investigations tab |
| `pm-demo-ui-sse-2026-07-13.png` | **Shown in demo** | SSE tab |
| `pm-demo-ui-activity-2026-07-13.png` | **Shown in demo** | Activity tab |
| `daybreak-managed-workflows-2026-07-13.png` | **Supporting only** | `/app/workflows?query=daybreak&managed=all` — 5/5 registry verify (not a PM tab) |

**Excluded:** `pm-demo-ui-error.png` — failed capture during dry-run; do not cite in pack.

**UI pass result:** 7/7 Daybreak tabs verified (API dry-run 13/13). Screenshots above are the PM demo visual record; they support the demo narrative but do **not** constitute full product-scope evidence.

---

## 8. Demo script pointer

Walkthrough: `docs/demo-walkthrough.md`  
Workflows UI: `http://localhost:5631/app/workflows` → filter **Managed**, query `daybreak` (5 workers).

See §7 for screenshot paths. Managed-workflows supporting capture: `docs/evidence/daybreak-managed-workflows-2026-07-13.png`.

---

## 9. Secondary capability annexes

Short evidence slices for demo-adjacent capabilities. Each annex is **spike/demo scope only** — not platform ratification.

### Annex A — Managed worker install (`workflows-managed`)

| Field | Value |
|---|---|
| Registry | `server/workflow/builtin_workers.ts` + `registerDaybreakWorker` |
| Install contract | `server/plugin.test.ts` |
| Count | 5 managed workflows (alert-analysis, alert-trigger, investigation, response-action, forensic) |
| UI default | `uiSettings.overrides.workflows:ui:showManagedWorkflows: true` in `kibana.dev.eis.yml` |
| Gate | `worker_registry.test.ts` + browser verify |
| Screenshot | `docs/evidence/daybreak-managed-workflows-2026-07-13.png` (5/5 at `?query=daybreak&managed=all`) |

**Exclude from claims:** full Workflows UX ratification, PR #11 terminology as shipped.

### Annex B — Endpoint Act demo stub (`endpoint-act`)

| Field | Value |
|---|---|
| Mode | `DAYBREAK_STUB_ENDPOINT_ACTIONS=1` (default in demo env) |
| Route | response-action worker Act phase |
| Gate | live smoke step `endpoint-act-stub` in `.ao/daybreak_live_worker_smoke.mjs` |
| Expected demo behavior | Structured success/stub response without Fleet enrollment |

**Exclude from claims:** live Defend dispatch, enrolled endpoint, P7 Fleet gap closure.

### Annex C — AD → Proposal slice (`ad-integration-slice`)

| Field | Value |
|---|---|
| Dataset | `server/evals/attack_discovery_dataset.ts` (`ad-blackhat-golden-path`) |
| Adapter | AD row → investigation Proposal mapping |
| Gate | jest adapter tests + live smoke step `ad-proposal` |
| Provenance | offline only in spike |

**Exclude from claims:** full AD 2.0 agent-builder eval pipeline, golden OTLP traces, weekly matrix AD cohort.

### Annex D — Watch Officer / SSE / Investigation UI (`pm-demo-slices`)

| Field | Value |
|---|---|
| API dry-run | 13/13 pass (2026-07-13) |
| UI tab pass | 7/7 pass — screenshots in §7 |
| Performance signal | 15 eval runs, 100% shape-match (`pm-demo-ui-performance-2026-07-13.png`) |
| Routing | natural agent routing (no `skill_ids` force-load) |

**Exclude from claims:** Dark Watch / Deep Watch product scope, full Watch Officer autonomy ladder, platform inbox ratification.

---

## 10. Sign-off checklist (internal E&T)

- [ ] `mvp_gate_verification.mjs` exit 0 (offline)
- [ ] `RUN_LIVE=1 KIBANA_URL=http://localhost:5631 mvp_gate_verification.mjs` exit 0
- [ ] Evidence pack reviewed against **demonstrated capabilities only** (§0 in/out table)
- [ ] No dependency on #17944 / #17960 / Fleet for core FPR narrative
- [ ] PM demo uses natural agent routing (not `skill_ids` force-load)
- [ ] Screenshot index (§7) matches what will actually be shown vs supporting-only
- [ ] Secondary annexes (§9) cited only when demo includes that slice
