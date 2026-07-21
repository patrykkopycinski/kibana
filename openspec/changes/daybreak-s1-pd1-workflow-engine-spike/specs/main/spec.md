# Specification

> change_id: `pd-1-workflow-engine-shape-validation-spike` · shape session `da4f07f3` (anchors: PD-1, A-2, NFR-2) · grounded in the PD-1 research findings and the PD-1 proposal "What Changes".

This specification covers the PD-1 unknown-flushing spike only — validating that the Kibana Workflow engine can express the step shape (HTTP fetch + conditional guard + stub AI invocation with structured output) the NotDaybreak Alert-Analysis worker needs. It does not cover the real 5-phase worker, the eval harness, or the UI panel (see Out of Scope).

## Requirements

### Workflow Definition (Engine Shape Validation)

- **FR-001 MUST**: The spike adds a minimal experimental Kibana workflow definition that exercises three step types — an HTTP-fetch step, a conditional-guard step, and a stub AI-invocation step — to validate the engine can express the required step shape (PD-1; resolves A-2).
- **FR-002 MUST**: The HTTP-fetch step is expressed using the engine's `kibana.request` (or `http`) step type and returns parsed structured output (research Finding 2 — `server/step/kibana_action_step.ts`).
- **FR-003 MUST**: The conditional-guard step is expressed using the engine's `if` step type with a `condition:` expression (research Findings 2 & 7 — control-flow step; shipped `type: if` + `condition:` + nested `steps:` form, as composed in `streams`'s `continuous_extraction_workflow.yaml:56,73-74`).
- **FR-004 MUST**: The stub AI-invocation step is expressed using the engine's `connector` step type with a `connector-id` and `with:` sub-action, producing structured JSON output via a stub connector such as `echo_inference` — not a live model call (research Findings 2 & 5 — `server/step/connector_step.ts`; `echo_inference` `FakeConnectors`).
- **FR-005 MUST**: The workflow definition uses the shipped and tested YAML syntax (`type:` + `condition:` / `connector-id:` / `with:`), not the engine README's illustrative `if:`/`then:`/`action:`/`params:` form (research Finding 7).
- **FR-006 MUST**: The workflow definition resides under `x-pack/solutions/security/plugins/daybreak/server/workflow/` (PD-1). (Forward: tasks — research Finding 6: neither the `daybreak` plugin nor this path exists yet; the tasks wave must scaffold the plugin and directory.)
- **FR-007 MUST**: The workflow is gated behind the `daybreak` experimental feature flag, default off (PD-1, NFR-2). (Forward: tasks — research Finding 6: no `daybreak` experimental flag exists anywhere in the repo; the tasks wave must create it. The proposal's "existing flag" wording is contradicted by the repo state.)

### Workflow Runner / Executor Invocation

- **FR-008 MUST**: A minimal runner/executor invocation triggers the workflow once to completion, end-to-end, without engine errors (PD-1).
- **FR-009 MUST**: The runner logs each step's input and output (PD-1).
- **FR-010 SHOULD**: The runner invokes the workflow through an existing engine entry point — `workflowsExecutionEngine.executeWorkflow` / `executeWorkflowStep`, or the Agent Builder `execute_workflow.ts` wrapper — rather than authoring a new execution path (research Finding 4 — `x-pack/platform/plugins/shared/agent_builder/server/services/workflow/execute_workflow.ts`).

### Integration Test

- **FR-011 MUST**: An integration test named `workflow_engine_shape.test.ts` executes the workflow end-to-end (PD-1).
- **FR-012 MUST**: The test asserts the HTTP-fetch step produces its expected structured output shape (PD-1).
- **FR-013 MUST**: The test asserts the conditional-guard step produces its expected output shape (PD-1).
- **FR-014 MUST**: The test asserts the stub AI-invocation step produces its expected structured JSON output shape (PD-1).
- **FR-015 SHOULD**: The test is built on the engine's `WorkflowRunFixture` harness with an inline YAML workflow and the `echo_inference` stub connector as the AI step, mirroring the `single_step_run.test.ts` pattern (research Finding 5 — `integration_tests/workflow_run_fixture.ts`).

### Findings Documentation (README)

- **FR-016 MUST**: A README under the workflow directory documents what was validated (PD-1).
- **FR-017 MUST**: The README documents any engine limitations discovered (PD-1).
- **FR-018 SHOULD**: The README records what PD-2 must account for based on the spike's findings (per the spike Definition of Done).

## Out of Scope

The following are explicitly deferred by the shape session and are NOT part of this spike (cited to preserve scope boundaries; not numbered requirements):

- The real 5-phase Alert-Analysis worker (Setup/Guard/Enrich/Reason/Act) — PD-2 (Hard Constraints; implements FR-1..FR-7).
- The `@kbn/evals` offline dataset gate and live UI-journey eval — PD-3 (implements FR-8, FR-9, FR-10).
- The Kibana UI route/panel — PD-4 (implements FR-11).
- Multiple Watch capabilities / worker types beyond alert-analysis — FR-13 (post-spike decomposition).
- Full autonomy-level policy editing UI — FR-14 (post-spike decomposition).
- Production-grade rollback/revert framework — FR-15 (recommend omit).
- Production-scale performance / concurrent alert volume — NFR-5 (deferrable).
- Multi-region/multi-tenant isolation — NFR-6 (recommend omit).

## Forward Notes

- **Forward: design** — If validation shows the engine cannot express the shape, the fallback substrate (custom orchestration, flagged during shaping) must be decided before PD-2 begins (proposal Open Questions).
- **Forward: design** — Whether the stub AI step should mirror a real Agent Builder connector shape now (for clean PD-2 reuse) or remain a pure stub is unresolved; this is the leading edge of the A-1 wiring unknown and is decided in PD-2's design (proposal Open Questions).
- **Forward: tasks** — Plugin scaffolding and `daybreak` experimental-flag creation are prerequisites the task list must include; the proposal assumes they already exist (research Finding 6).

## Suggested Enhancements (not in original description)

- *(suggested)* Pre-stage a one-paragraph sketch of the custom-orchestration fallback in the README, so that if the engine fails validation the team can pivot immediately rather than re-plan from a cold start (carried from the proposal's Suggested Enhancements).
