# Watch Floor gap status (daybreak-spike)

**Worktree:** `/Users/mac/Projects/kibana.worktrees/daybreak-spike`  
**Host:** `worker-m1max`  
**Updated:** 2026-07-12  
**Source handoff:** `project-daybreak/docs/working-groups/watch-floor-fpr/artifacts/watch-floor-gaps-handoff.md`

This checklist tracks the 13 Watch Floor gaps against evidence in the spike plugin.
Statuses: **closed** (acceptance met), **partial** (scaffolding or subset done),
**blocked** (external dependency), **open** (not started).

| # | Gap | Status | Evidence |
|---|---|---|---|
| 1 | Proposal schema not ratified across teams | **partial** | `docs/watch-floor-contract-ratification.md` (`spike-canonical schemas in server/common/schemas/; CWL export via mapProposalToCwlStub`); CWL stub mapping in `server/common/contracts/watch_floor_contract.ts` |
| 2 | Evidence package schema undefined | **partial** | EvidencePackage + builders: `server/common/schemas/evidence_package.ts`; ES index: `server/client/evidence/` |
| 3 | Golden dataset too small | **partial** | Expanded dataset (8 nominal + 1 broken, FPR families): `server/evals/golden_dataset.ts`; family coverage asserted in `server/evals/alert_analysis_eval.test.ts` |
| 4 | Real agent output not validated | **partial** | Offline deterministic gate green; live `ai.agent` connector run not scored yet. Harness: `.ao/daybreak_live_worker_smoke.mjs`; worker YAML: `server/workflow/alert_analysis_worker.yaml` |
| 5 | Live-stack end-to-end not proven | **partial** | Fixture e2e: `server/integration_tests/alert_analysis_e2e.test.ts`; live smoke probes proposals + workflow execute: `.ao/daybreak_live_worker_smoke.mjs`. No live `WorkerEvaluationRecord` from real agent yet |
| 6 | Eval report lacks cost/token/latency provenance | **partial** | Schema v2 + `provenance` block: `server/evals/generate_eval_report.ts` (`EVAL_REPORT_SCHEMA_VERSION = 2`); offline defaults in `OFFLINE_GATE_DEFAULT_PROVENANCE`; L4 record: `server/evals/worker_evaluation_record.ts` |
| 7 | Shared Approval Gate not integrated | **open** | Spike-local gate only: `server/client/proposals/gate.ts`; blocked on #17944 |
| 8 | CI gate for offline eval not wired | **partial** | Jest suite: `server/evals/alert_analysis_eval.test.ts`, `server/evals/l4_round_trip.test.ts`; CI entrypoint: `scripts/daybreak_eval_gate.mjs`; artifact: `data/daybreak-alert-analysis-eval-report.json`. Buildkite required-check wiring still pending |
| 9 | Customer-zero plan not operational | **blocked** | External ops dependency (#17960); no spike artifact |
| 10 | Demo environment not provisioned | **partial** | Scout stack on `:5631` with `xpack.daybreak.enabled=true` (`.scout/servers/local.json`); seed route: `server/http_routes/seed_demo_data.ts`; live smoke: `.ao/daybreak_live_worker_smoke.mjs` |
| 11 | Autonomy taxonomy unreconciled | **partial** | POC mapping: `server/common/contracts/autonomy_mapping.ts`; ratification note: `docs/watch-floor-contract-ratification.md` § Autonomy taxonomy |
| 12 | Attack Discovery output integration not started | **partial** | AD adapter: server/common/schemas/attack_discovery_adapter.ts (mapAttackDiscoveryToProposal) |
| 13 | Project docs out of sync with spike | **partial** | Spike-side docs: `server/workflow/README.md`, `docs/watch-floor-contract-ratification.md`, this file; `project-daybreak` canonical docs not yet reconciled |

## Harness commands

No `package.json` at the plugin root — run from Kibana repo root:

```bash
# Gap #8 — offline eval CI gate (jest + JSON artifact)
node x-pack/solutions/security/plugins/daybreak/scripts/daybreak_eval_gate.mjs

# Gaps #4, #5, #10 — live stack smoke (Kibana on :5631)
KIBANA_URL=http://localhost:5631 \
  node x-pack/solutions/security/plugins/daybreak/.ao/daybreak_live_worker_smoke.mjs
```

## Gaps targeted this session (4, 5, 8, 10)

| Gap | What landed | Remaining |
|---|---|---|
| **4** | Live smoke confirms stack + API surface; offline gate proves shape logic | Score real `ai.agent` output against golden dataset on live connector |
| **5** | Integration fixture + live smoke (proposals, workflow execute) | Emit `WorkerEvaluationRecord` from a live agent run; human review loop |
| **8** | `daybreak_eval_gate.mjs` runs jest + writes JSON; exits non-zero on fail | Register as required Buildkite check for daybreak plugin |
| **10** | Repeatable smoke against seeded demo data on m1max Scout stack | Scripted demo walkthrough doc + connector/Fleet/license checklist |

## Related evidence paths

| Artifact | Path |
|---|---|
| Golden dataset | `server/evals/golden_dataset.ts` |
| Offline gate + scorer | `server/evals/offline_dataset_gate.ts` |
| Eval report generator | `server/evals/generate_eval_report.ts` |
| Eval jest suite | `server/evals/alert_analysis_eval.test.ts` |
| L4 record round-trip | `server/evals/l4_round_trip.test.ts` |
| CI eval gate script | `scripts/daybreak_eval_gate.mjs` |
| Live smoke script | `.ao/daybreak_live_worker_smoke.mjs` |
| Eval report artifact | `data/daybreak-alert-analysis-eval-report.json` |
| Worker YAML | `server/workflow/alert_analysis_worker.yaml` |
| E2E fixture gate | `server/integration_tests/alert_analysis_e2e.test.ts` |
| Seed demo route | `server/http_routes/seed_demo_data.ts` |
| Proposals API | `server/http_routes/proposals.ts` |
| Workflows API | `server/http_routes/workflows.ts` |
