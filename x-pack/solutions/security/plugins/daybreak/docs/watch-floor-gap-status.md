# Watch Floor gap status (daybreak-spike)

**Worktree:** `/Users/mac/Projects/kibana.worktrees/daybreak-spike`  
**Host:** `worker-m1max`  
**Updated:** 2026-07-13  
**Source handoff:** `project-daybreak/docs/working-groups/watch-floor-fpr/artifacts/watch-floor-gaps-handoff.md`

This checklist tracks the 13 Watch Floor gaps against evidence in the spike plugin.
Statuses: **closed** (acceptance met), **partial** (scaffolding or subset done),
**blocked** (external dependency), **open** (not started).

| # | Gap | Status | Evidence |
|---|---|---|---|
| 1 | Proposal schema not ratified across teams | **partial** | `docs/watch-floor-contract-ratification.md` (`spike-canonical schemas in server/common/schemas/; CWL export via mapProposalToCwlStub`); CWL stub mapping in `server/common/contracts/watch_floor_contract.ts` |
| 2 | Evidence package schema undefined | **partial** | EvidencePackage + builders: `server/common/schemas/evidence_package.ts`; ES index: `server/client/evidence/` |
| 3 | Golden dataset too small | **partial** | Expanded dataset (8 nominal + 1 broken, FPR families): `server/evals/golden_dataset.ts`; family coverage asserted in `server/evals/alert_analysis_eval.test.ts` |
| 4 | Real agent output not validated | **closed** | Live `ai.agent` run scored 7/7 shape matches on EIS `anthropic-claude-5-sonnet` (2026-07-13). Harness: `.ao/daybreak_live_worker_smoke.mjs`; sequential scorer: `.ao/score_golden_sequential.mjs`; worker YAML: `server/workflow/alert_analysis_worker.yaml` |
| 5 | Live-stack end-to-end not proven | **closed** | Fixture e2e: `server/integration_tests/alert_analysis_e2e.test.ts`; live smoke probes proposals + workflow execute: `.ao/daybreak_live_worker_smoke.mjs`; `WorkerEvaluationRecord` written from live agent runs and verified via `.ao/score_golden_sequential.mjs` |
| 6 | Eval report lacks cost/token/latency provenance | **partial** | Schema v2 + `provenance` block: `server/evals/generate_eval_report.ts` (`EVAL_REPORT_SCHEMA_VERSION = 2`); offline defaults in `OFFLINE_GATE_DEFAULT_PROVENANCE`; L4 record: `server/evals/worker_evaluation_record.ts` |
| 7 | Shared Approval Gate not integrated | **open** | Spike-local gate only: `server/client/proposals/gate.ts`; blocked on #17944 |
| 8 | CI gate for offline eval not wired | **partial** | Jest suite: `server/evals/alert_analysis_eval.test.ts`, `server/evals/l4_round_trip.test.ts`; CI entrypoint: `scripts/daybreak_eval_gate.mjs`; artifact: `data/daybreak-alert-analysis-eval-report.json`. Buildkite required-check wiring still pending |
| 9 | Customer-zero plan not operational | **partial** | Template draft created: `project-daybreak/docs/working-groups/watch-floor-fpr/artifacts/customer-zero-plan-alert-analysis.md`; remains blocked on InfoSec / customer-zero reviewer sign-off (#17960) |
| 10 | Demo environment not provisioned | **closed** | Scout stack on `:5631` with `xpack.daybreak.enabled=true` (`.scout/servers/local.json`); seed route: `server/http_routes/seed_demo_data.ts`; live smoke: `.ao/daybreak_live_worker_smoke.mjs`; polished demo walkthrough: `docs/demo-walkthrough.md` includes Watches UI, autonomy labels, troubleshooting, and 7/7 verified score |
| 11 | Autonomy taxonomy unreconciled | **closed** | Reconciled mapping: `server/common/contracts/autonomy_mapping.ts`; docs updated in project-daybreak `daybreak-watch-catalog.md`, `daybreak-operating-model.md`, `watch-interface-mapping.md`; UI labels in `public/application/components/watches_console.tsx` |
| 12 | Attack Discovery output integration not started | **partial** | AD adapter: `server/common/schemas/attack_discovery_adapter.ts` (`mapAttackDiscoveryToProposal`); runnable dataset + test slice added in `server/evals/attack_discovery_dataset.ts` and `server/common/schemas/attack_discovery_adapter.test.ts` |
| 13 | Project docs out of sync with spike | **closed** | Spike-side docs: `server/workflow/README.md`, `docs/watch-floor-contract-ratification.md`, this file, `docs/handoff-summary-2026-07-13.md`; `project-daybreak` canonical docs reconciled: `daybreak-watch-catalog.md`, `daybreak-operating-model.md`, `watch-interface-mapping.md`, `contract-verification-notes.md` |

## Endpoint skill wiring (Watch Officer Act phase)

| Capability | Status | Evidence |
|---|---|---|
| `endpoint-response-actions` registered | **closed** | Skill visible via `/api/agent_builder/skills/endpoint-response-actions`; flags in `common/experimental_features.ts` |
| Response action worker + approval Act route | **closed** | `server/workflow/response_action_worker.yaml`, `run_response_action_worker.ts`, `POST /api/daybreak/proposals/{id}/act/response`, `POST /api/daybreak/proposals/{id}/run-response-action`; skill tool bridge: `server/workflow/execute_skill_bounded_tool.ts` |
| `endpoint-forensic-analysis` registered | **closed** | Skill visible via `/api/agent_builder/skills/endpoint-forensic-analysis` |
| Forensic worker + escalated investigation handoff | **closed** | `server/workflow/forensic_worker.yaml`, `run_forensic_worker.ts`, `POST /api/daybreak/investigations/{id}/forensic`, `POST /api/daybreak/investigations/{id}/run-forensic` |
| Entity-based investigation enrich | **closed** | Host/user correlation: `server/workflow/correlate_investigation_entities.ts`; enrich route upgraded in `server/http_routes/investigations.ts`; builder seeds host/user entities in `server/common/schemas/investigation_builder.ts` |
| UI buttons wired for act/response + run-forensic | **closed** | `public/services/proposals_service.ts`, `public/services/investigations_service.ts`, `public/application/hooks/use_proposal_actions.ts`, `public/application/hooks/use_investigations.ts`, `public/application/components/gate/approval_gate.tsx` (ActionFlyout confirm for isolate), `public/application/components/investigations_console.tsx`; tests: `public/application/hooks/use_proposal_actions.test.tsx`, `public/application/components/gate/approval_gate.test.tsx` |
| Live Defend endpoint enrolled for real dispatch | **open** | `get_processes` / forensic discover return structured `endpoint_not_found` or empty indices without enrolled hosts — expected in Scout cell without Fleet |

## Harness commands

No `package.json` at the plugin root — run from Kibana repo root:

```bash
# Gap #8 — offline eval CI gate (jest + JSON artifact)
node x-pack/solutions/security/plugins/daybreak/scripts/daybreak_eval_gate.mjs

# Gaps #4, #5, #10 — live stack smoke (Kibana on :5631)
KIBANA_URL=http://localhost:5631 \
  node x-pack/solutions/security/plugins/daybreak/.ao/daybreak_live_worker_smoke.mjs

# Endpoint Act phase smoke
curl -u elastic:changeme -X POST http://localhost:5631/api/daybreak/proposals/demo-proposal-1/act/response \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -d '{"action":"get_processes","hostName":"FIN-WS-04"}'

curl -u elastic:changeme -X POST http://localhost:5631/api/daybreak/investigations/{id}/run-forensic \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -d '{"hosts":["FIN-WS-09"],"timeWindowHours":72}'
```

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
| Alert analysis worker YAML | `server/workflow/alert_analysis_worker.yaml` |
| Response action worker YAML | `server/workflow/response_action_worker.yaml` |
| Forensic worker YAML | `server/workflow/forensic_worker.yaml` |
| Entity correlation helper | `server/workflow/correlate_investigation_entities.ts` |
| E2E fixture gate | `server/integration_tests/alert_analysis_e2e.test.ts` |
| Seed demo route | `server/http_routes/seed_demo_data.ts` |
| Proposals API | `server/http_routes/proposals.ts` |
| Investigations API | `server/http_routes/investigations.ts` |
| Proposal actions hook test | `public/application/hooks/use_proposal_actions.test.tsx` |
| Approval gate response UI test | `public/application/components/gate/approval_gate.test.tsx` |
| Workflows API | `server/http_routes/workflows.ts` |
