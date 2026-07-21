---
change_id: daybreak-s1-pd2-worker-core
status: draft
created_at: 2026-07-09
treadmill_artifact_version: 1
feature_id: f943d973-90ab-4834-8e7f-d7fed23afe31
feature_slug: daybreak-s1-alert-analysis-worker-spike
---
# PD-2: Worker Core — Real 5-Phase Alert-Analysis Worker (NotDaybreak S1)

## Why
PD-1 validated that the Kibana Workflow Engine can express the HTTP-fetch + conditional-guard + AI-invocation step shape end-to-end, resolving A-2. PD-2 is the shape-notes plan-decomposition row **PD-2**: "Worker core: implement the real 5-phase Setup/Guard/Enrich/Reason/Act workflow (FR-1..FR-7) against a real Agent Builder skill (resolves A-1), feature-flagged (NFR-2), with security hardening (NFR-4)." Per the shape session's reconciliation table, A-1 (Agent Builder skill/tool wiring unknown) is "the top execution risk of the whole spike" and must be resolved as PD-2's opening task. Research this session also found that the S0 `server/client/evidence/` and `server/client/proposals/` modules exist only as stale build artifacts (`target/types/**/*.d.ts`, no committed `.ts` source and no stash) — this plan re-authors that source from scratch, using the `.d.ts` shapes only as a reference.

## What Changes
- Add `server/client/evidence/` (client + storage + types) implementing the Evidence store, re-authored from the `target/types/server/client/evidence/*.d.ts` shape.
- Add `server/client/proposals/` (client + storage + types + fail-closed readiness gate), re-authored from the `target/types/server/client/proposals/*.d.ts` shape, including `evaluateReadinessGate`/`requireReadinessGate`.
- Add `server/workflow/alert_analysis_worker.yaml`, a real 5-phase workflow: Setup (config load, FR-2) → Guard (idempotency/dedup, FR-3) → Enrich (evidence packaging, FR-4) → Reason (`ai.agent` invoking the `alert-analysis` skill with a Zod-derived JSON-schema `with.schema`, FR-5) → Act (Proposal emission + approval-gate-bounded action, FR-7).
- Add an explicit output-validation guard step (hook 5, FR-6) between Reason and Act that halts on malformed/empty `ai.agent` output rather than emitting a silent wrong verdict.
- Add a runner entry point extending PD-1's `run_spike_workflow.ts` pattern (same `executeWorkflow` wrapper) to invoke the 5-phase workflow.
- Add security hardening (NFR-4): input validation on alert data at the Enrich boundary, structural separation of the evidence ground-truth block from the Reason-phase framing/rubric, and verification (not widening) of the `alert-analysis` skill's existing tool allowlist.
- Add an integration test extending PD-1's `WorkflowRunFixture` pattern, asserting each of the 5 phases produces its expected structured output, plus a fail-closed case.
- Delete the stale `target/types/server/client/{evidence,proposals}/*.d.ts` build artifacts once the real `.ts` source lands.

## Impact
- All new code lands under the existing `daybreak` plugin scaffolded by PD-1 — no new plugin boundary.
- Continues to be gated behind `experimentalFeatures.daybreak` (default false, FR-12/NFR-2) — no new flag.
- The `alert-analysis` Agent Builder skill (`security_solution` plugin) is reused via `ai.agent`'s `agent-id`, not modified or forked.
- Executed entirely on the i9 `daybreak-spike` worktree (NFR-1), same worktree/branch PD-1 used.

## Open Questions
- Does a workflow-invocable Agent Builder *agent* wrapping the `alert-analysis` skill already exist, or must PD-2's opening task create one? `invoke_agent.yml`'s `agent-id: alert.triage` needs confirmation as real vs. illustrative.
- Which `.inference`/`.eis-*` connector-id is available in the i9 dev stack for the `ai.agent` step to route through — design must confirm via the dev stack's configured connectors or create one.
- Forward: design — confirm whether the minimal Agent Builder agent created to resolve A-1 needs its own committed scaffolding/tests beyond binding to the existing skill.

## Suggested Enhancements (not in original description)
- **(suggested)** Capture the fail-closed guard's error shape (halted-workflow reason, phase, raw malformed output snippet) in a structured log field so PD-5's eval report can surface it directly rather than re-deriving it from workflow run state.
- **(suggested)** Once the readiness gate lands, add a unit test asserting it rejects an approved-status Proposal with empty `evidenceRefs` OR empty `recommendation` independently, not just the combined case — cheap extra coverage on a fail-closed boundary.
