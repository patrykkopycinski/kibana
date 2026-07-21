# Specification

## Requirements

### Evidence Store (`server/client/evidence/`)

- FR-001 MUST: Implement an `EvidenceClient` with `create`, `get`, `list`, `update`, and `delete` methods, persisting records to a `.daybreak-evidence` index (What Changes bullet "Add `server/client/evidence/`").
- FR-002 MUST: Evidence records carry the fields `id`, `kind`, `sourceRef`, `summary`, `provenance`, `confidence`, `stance`, `limitations`, `sensitivityLabel`, and `createdAt` (What Changes bullet "Add `server/client/evidence/`").
- FR-003 MUST: The `.ts` source for this module is re-authored from scratch, using `target/types/server/client/evidence/*.d.ts` only as a type-shape reference, not as a scaffold to extend in place — the compiled `.d.ts` files are the only artifact confirmed to exist on the `daybreak-spike` worktree; no committed `.ts` source or stash entry for `server/client/*` exists (research.md Finding 6; Hard Constraints).

### Proposal Store (`server/client/proposals/`)

- FR-004 MUST: Implement a `ProposalClient` with equivalent CRUD operations, re-authored from `target/types/server/client/proposals/*.d.ts` under the same source-recovery constraint as FR-003 (What Changes bullet "Add `server/client/proposals/`"; research.md Finding 6).
- FR-005 MUST: Implement `evaluateReadinessGate`/`requireReadinessGate` as a fail-closed gate: a Proposal may only reach `approved` status when it has both a non-empty `evidenceRefs` list AND a non-empty `recommendation` (What Changes bullet "Add `server/client/proposals/`"; grounds FR-7's "auditable shape" and approval-gate requirement).

### 5-Phase Worker Workflow (Setup → Guard → Enrich → Reason → Act)

- FR-006 MUST: `server/workflow/alert_analysis_worker.yaml` (or `spike_workflow.yaml` extended into this) defines 5 named phases — Setup, Guard, Enrich, Reason, Act — matching the step structure required by FR-1 (What Changes bullet "Add `server/workflow/alert_analysis_worker.yaml`").
- FR-007 MUST: The Setup phase loads per-space runtime config (enabled flag, connector, thresholds) via a real config-fetch step (FR-2).
- FR-008 MUST: The Guard phase implements an idempotency/dedup check that skips processing when the alert already carries this worker's result tag (FR-3).
- FR-009 MUST: The Enrich phase packages real evidence from a real alert into a compact ground-truth block, structurally separate from the Reason-phase's reasoning prompt/rubric (FR-4; this separation is also the NFR-4 prompt-injection control, see FR-018).
- FR-010 MUST: The Reason phase is implemented as a `type: ai.agent` workflow step invoking the existing `alert-analysis` Agent Builder skill, with a Zod-derived JSON-schema in `with.schema` for structured output (FR-5; grounds in research.md Finding 1 — `RunAgentStepTypeId = 'ai.agent'` defined at `x-pack/platform/plugins/shared/agent_builder/common/step_types/run_agent_step.ts:21` and registered via `registerStepDefinition` at `x-pack/platform/plugins/shared/agent_builder/server/plugin.ts:128-131`).
- FR-011 MUST NOT: The Reason phase MUST NOT use a deprecated raw connector-family AI step type (`inference.*`, `bedrock.*`, `gen-ai.*`, `gemini.*`) — PD-1's stub `type: inference` step is not carried forward (research.md Finding 2 — `deprecated_step_metadata.ts:53-57` marks these deprecated in favor of the `ai.*` family; grounds A-2's resolution being honored rather than reverted).
- FR-012 MUST: If no Agent Builder agent scoped to the `alert-analysis` skill already exists, PD-2's opening task creates a minimal one bound via `configuration.skill_ids: ['alert-analysis']` on an `AgentCreateRequest` — the `agent-id: alert.triage` referenced in `invoke_agent.yml` is confirmed illustrative, not a real registered agent (A-1; research.md Findings 3 and 4).
- FR-013 MUST NOT: The `alert-analysis` skill (`alert_analysis_skill.ts`) MUST NOT be modified or forked — it is invoked as-is via `ai.agent`'s `agent-id` (Hard Constraints; Impact section).
- FR-014 MUST: The Act phase emits a Proposal/Result record with an auditable shape (actor, timestamp, rationale) and gates any consequential action behind an approval step that fails closed without approval (FR-7).

### Output Validation Guard

- FR-015 MUST: An explicit workflow step sits between Reason and Act that validates the `ai.agent` structured output (FR-6). This is a workflow-authored step, not an engine built-in, per the boundary distinction documented in PD-1's `server/workflow/README.md` ("What was validated").
- FR-016 MUST: On malformed or empty `ai.agent` output, this guard step halts the workflow with a visible error and MUST NOT allow a Proposal to be silently emitted with a wrong or empty verdict (FR-6).

### Runner Entry Point

- FR-017 MUST: A runner entry point extends PD-1's `run_spike_workflow.ts` pattern, reusing the same `executeWorkflow` wrapper rather than replacing it, and invokes the 5-phase `alert_analysis_worker.yaml` workflow in place of PD-1's 3-step spike workflow (What Changes bullet "Add a runner entry point").

### Security Hardening

- FR-018 MUST: Alert data is schema-validated at the Enrich-phase boundary before being packaged as evidence (NFR-4).
- FR-019 MUST: The evidence ground-truth block passed into the Reason-phase prompt is structurally separated from the framing/rubric text, so that content within evidence cannot be interpreted as instructions (NFR-4; FR-009's separation requirement; per the hook-3 contract referenced in the proposal's Why section).
- FR-020 MUST: The `alert-analysis` skill's existing tool allowlist (`SECURITY_ALERTS_TOOL_ID`, `SECURITY_LABS_SEARCH_TOOL_ID`, `SECURITY_ENTITY_RISK_SCORE_TOOL_ID`, and the inline related-alerts tool) is verified as sufficient, not widened (NFR-4; research.md Finding 5 — `alert_analysis_skill.ts:93-148`; Hard Constraints).

### Integration Testing

- FR-021 MUST: An integration test extends PD-1's `WorkflowRunFixture` pattern (from `workflow_engine_shape.test.ts`) to exercise the 5-phase workflow end-to-end (What Changes bullet "Add integration test(s)").
- FR-022 MUST: The test asserts that each of the 5 phases (Setup, Guard, Enrich, Reason, Act) produces its expected structured output.
- FR-023 MUST: The test includes a fail-closed case asserting that malformed AI output halts the workflow at the output-validation guard and does not result in a silently emitted Proposal (FR-6; FR-016).

### Stale Build-Artifact Cleanup

- FR-024 MUST: Once the real `.ts` source for `server/client/evidence/` and `server/client/proposals/` lands, the stale `target/types/server/client/{evidence,proposals}/*.d.ts` build artifacts are deleted from the working tree, since they will regenerate correctly from the real source (What Changes bullet "Delete the stale `target/types/...` build artifacts"; research.md Finding 6).

## Suggested Enhancements (not required by this specification)

- **(suggested)** Capture the output-validation guard's failure shape (halted-workflow reason, phase, raw malformed-output snippet) in a structured log field so a later eval-report artifact can surface it directly.
- **(suggested)** Add a unit test asserting the readiness gate (FR-005) independently rejects an empty `evidenceRefs` case and an empty `recommendation` case, not only the combined case.
