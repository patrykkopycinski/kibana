---
tasks_completed: 8
tasks_total: 8
---
# PD-3 Tasks — Eval Harness

## Phase 0: Research and Setup

- [ ] 0-1: Research @kbn/evals dataset/scorer primitives and document the exact API to use for the offline gate. Check whether the workflow engine exposes step-level retry/backoff config for ai.agent steps. **Traces:** FR-8, A-4 @host:worker-m1max
- [ ] 0-2: Create the golden dataset file server/evals/golden_dataset.ts with 3 alert scenarios including the deliberately-broken variant. **Traces:** FR-8, FR-10, A-3 @host:worker-m1max

## Phase 1: Offline Dataset Gate

- [ ] 1-1: Create server/evals/alert_analysis_eval.test.ts using @kbn/evals primitives. Assert passing rows pass and broken row FAILS. **Traces:** FR-8, FR-10, A-3 @host:worker-m1max
- [ ] 1-2: Add retry/backoff for ai.agent calls. Wire engine config if available or add wrapper in run_alert_analysis_worker.ts. **Traces:** A-4 @host:worker-m1max

## Phase 2: Eval Report Artifact

- [ ] 2-1: Create server/evals/generate_eval_report.ts that runs the dataset gate and writes JSON report. **Traces:** FR-8 @host:worker-m1max

## Phase 3: Live UI-Journey Gate

- [ ] 3-1: Create server/integration_tests/alert_analysis_e2e.test.ts using WorkflowRunFixture. Assert Proposal document emitted correctly. **Traces:** FR-9 @host:worker-m1max
- [ ] 3-2: Run jest and verify ALL tests pass. Fix any failures. **Traces:** FR-8, FR-9, A-3 @host:worker-m1max

## Phase 4: Documentation

- [ ] 4-1: Create server/workflow/README.md documenting the two-gate architecture. **Traces:** FR-8, FR-9, FR-10, A-3, A-4 @host:worker-m1max
