---
change_id: daybreak-s1-workflow-shape-spike
status: draft
created_at: 2026-07-08
treadmill_artifact_version: 1
research_topic: whether the Kibana workflows engine can express the spike's HTTP/guard/AI step shape
feature_id: f943d973-90ab-4834-8e7f-d7fed23afe31
feature_slug: daybreak-s1-alert-analysis-worker-spike
---
# Research: PD-1 Spike — Validate the Kibana Workflow Engine Step Shape (NotDaybreak S1)

## Research Question
Does the Kibana Workflow engine, as it exists in this repository today, support the exact step shape PD-1 needs to validate — an HTTP-fetch step, a conditional-guard step, and a stub AI-invocation step with structured JSON output — and what concrete engine surface (definition schema, runner API, test harness) would a spike build on?

## Summary
The engine PD-1 is betting on is real, shipped, and already expresses all three required step types. It is the `workflows_execution_engine` plugin (`src/platform/plugins/shared/workflows_execution_engine`), a stateless, Elasticsearch-backed executor that runs YAML-defined workflows over Task Manager; a production workflow in the `streams` plugin already combines a `kibana.request` (HTTP) step with an `if` (conditional guard) step, and the engine's `connector` step invokes Kibana Actions connectors (the AI-invocation primitive) with an `echo_inference` fake connector available for a stub. The runner API (`executeWorkflow` / `executeWorkflowStep`) and an integration-test fixture (`WorkflowRunFixture`) both exist, so PD-1 is largely confirmatory rather than exploratory. The one material gap: the proposal assumes an "existing `daybreak` experimental feature flag" (FR-12, NFR-2), but no `daybreak` plugin or flag exists anywhere in the repo — the spike is greenfield on the plugin/flag axis.

## Detailed Findings

### 1. The "Kibana Workflow engine" is the `workflows_execution_engine` plugin
The substrate PD-1 must validate is a concrete, shipped plugin: `src/platform/plugins/shared/workflows_execution_engine`. It is a stateless execution engine — each step is stateless and state is persisted to Elasticsearch — that schedules runs through Kibana's Task Manager, executes steps in topological (DAG) order, manages a runtime context across steps, and emits per-step events (resolves A-2's "does the engine exist and what does it do" half of the question). The plugin sits underneath `workflows_management` (which exposes the saved-object/UI layer) and `workflows_extensions` (the trigger/emit layer that `alerting_v2` calls into); `alerting_v2`'s `WorkflowService` is only a thin adapter that forwards `(triggerId, payload)` events to `workflows_extensions` and is not itself the engine.

### 2. All three required step types already exist in the engine
The step shape PD-1 needs to prove is expressible is already first-class in the engine:

| Required primitive (PD-1) | Engine step type | Handler |
| --- | --- | --- |
| HTTP-fetch step | `kibana.request` (internal Kibana API) and generic `http` | `server/step/kibana_action_step.ts` |
| Conditional-guard step | `if` with a `condition:` expression | control-flow step (see Finding 3/7) |
| AI-invocation step (structured JSON output) | `connector` with `connector-id` + `with` (supports sub-actions) | `server/step/connector_step.ts` |

The `kibana.request` handler accepts a Dev-Console-style `request: { method, path, body, query, headers }` and executes it as an HTTP fetch against the Kibana server, returning parsed JSON/text. The `connector` handler resolves a `connector-id` (or a system connector), invokes it through the Actions plugin's `connectorExecutor`, and returns the connector's `data` payload; `step.type` is split on `.` so a value like `gen-ai.invoke` is parsed as connector type `gen-ai` with sub-action `invoke`. This is the strongest single piece of evidence that A-2 resolves in the engine's favor: none of the three step types is hypothetical.

### 3. A production workflow already ships the exact HTTP + conditional-guard composition
The `streams` plugin's `continuous_extraction_workflow.yaml` is a real, scheduled workflow that chains a `kibana.request` step directly into an `if` conditional step (lines 56 and 73-74), then into `foreach`/`while`/`wait` loops. This proves the engine not only defines these step types but composes them in a running, shipped workflow — the composition PD-1 wants to validate is already in production use on a stricter schedule (every 10m) than a spike needs.

### 4. Two concrete runner/executor entry points exist for the "trigger once end-to-end" requirement
PD-1 calls for "a minimal workflow runner/executor invocation that triggers the workflow once end-to-end and logs each step's input/output." Two patterns are available:
- **Execution-engine public API**: `workflowsExecutionEngine.executeWorkflow(workflow, context, request)` (returns `workflowExecutionId`) and `executeWorkflowStep(workflow, stepId, contextOverride)` for running a single step.
- **Agent Builder wrapper**: `x-pack/platform/plugins/shared/agent_builder/server/services/workflow/execute_workflow.ts` wraps `workflows_management`'s `workflowApi.executeWorkflow({ workflowId, inputs, request, spaceId, waitForCompletion, completionTimeoutSec })`, awaits completion, and emits inference tracing spans — a ready model for a request-bound, completion-awaiting runner.

Either entry point grounds the runner requirement; the Agent Builder wrapper is the closer analog because it already handles completion-wait and tracing.

### 5. An integration-test harness for `workflow_engine_shape.test.ts` already exists
The engine ships a reusable `WorkflowRunFixture` (`integration_tests/workflow_run_fixture.ts`) that takes an inline YAML workflow, runs it, and exposes mocks for the execution repository, step-execution repository, and Actions client so assertions can be made on per-step status/output. `integration_tests/tests/single_step_run.test.ts` demonstrates the pattern and, critically, uses an `echo_inference` `FakeConnectors` connector as the AI-invocation step — i.e. a stub inference/gen-ai connector already exists for exactly the "stub AI invocation" PD-1 needs. This is the direct template for the spike's `workflow_engine_shape.test.ts`.

### 6. The `experimentalFeatures` gating pattern exists — but the `daybreak` plugin and flag do not
The proposal states the spike is "gated behind the existing `daybreak` experimental feature flag" (FR-12, NFR-2). The flag-gating pattern itself is real and grounded — e.g. `security_solution/server/plugin.ts` reads `this.config.experimentalFeatures` and threads it through setup/start. However, an exhaustive repo search for `daybreak` returns matches **only** in the OpenSpec proposal files themselves; there is no `x-pack/solutions/security/plugins/daybreak/` directory and no `daybreak` key in any plugin config or experimental-features map. The target path `x-pack/solutions/security/plugins/daybreak/server/workflow/` therefore does not exist. On the plugin-and-flag axis, PD-1 is greenfield: the spike must stand up a new plugin and a new experimental flag rather than gate behind an existing one. (Forward: tasks — the spike's first concrete steps must include plugin scaffolding + flag creation, which the current task list assumes already exist.)

### 7. Authoritative YAML syntax differs from the engine README's illustrations
The engine README documents step syntax with `if:`/`then:`/`else:` and `action:`/`params:` keys. The actual shipped and tested syntax (streams YAML and the integration tests) uses `type: if` + `condition:` + a nested `steps:` array, and `type: <connector>` + `connector-id:` + `with:` for connector steps. PD-1 should follow the shipped/tested form, not the README's illustrative snippets, when writing the minimal workflow definition.

## Code References
- `src/platform/plugins/shared/workflows_execution_engine/README.md:24-46` — engine is a stateless, ES-backed executor supporting DAG execution, varied step types, templating (grounds Finding 1).
- `src/platform/plugins/shared/workflows_execution_engine/server/plugin.ts:794` — `executeWorkflow` public API (grounds Finding 4).
- `src/platform/plugins/shared/workflows_execution_engine/server/plugin.ts:1094` — `executeWorkflowStep` single-step API (grounds Finding 4).
- `src/platform/plugins/shared/workflows_execution_engine/server/step/kibana_action_step.ts:196-235` — `kibana.request`/HTTP step accepts `request: { method, path, body, query, headers }` and fetches (grounds "HTTP-fetch step", Finding 2).
- `src/platform/plugins/shared/workflows_execution_engine/server/step/connector_step.ts:104-108` — connector `step.type` split into connector type + sub-action (grounds AI-invocation step shape, Finding 2).
- `src/platform/plugins/shared/workflows_execution_engine/server/step/connector_step.ts:195-200` — connector step returns the connector's `data` payload on `status === 'ok'` (grounds AI-invocation output, Finding 2).
- `x-pack/platform/plugins/shared/streams/server/lib/workflows/continuous_extraction_workflow.yaml:56` — shipped `type: kibana.request` step (grounds Finding 3).
- `x-pack/platform/plugins/shared/streams/server/lib/workflows/continuous_extraction_workflow.yaml:73-74` — shipped `type: if` + `condition:` step composing directly after the HTTP step (grounds conditional-guard + composition, Findings 2–3).
- `x-pack/platform/plugins/shared/agent_builder/server/services/workflow/execute_workflow.ts:30-59` — runner wrapping `workflowApi.executeWorkflow` with completion-wait + tracing (grounds Finding 4).
- `src/platform/plugins/shared/workflows_execution_engine/integration_tests/workflow_run_fixture.ts` — reusable inline-YAML run + repository/actions mocks (grounds Finding 5).
- `src/platform/plugins/shared/workflows_execution_engine/integration_tests/tests/single_step_run.test.ts:30-67` — `WorkflowRunFixture` pattern using `echo_inference` fake connector as the stub AI step (grounds Finding 5 + "stub AI invocation").
- `x-pack/platform/plugins/shared/alerting_v2/server/lib/services/workflow_service/README.md` — documents that `alerting_v2`'s `WorkflowService` is only a thin trigger-emit adapter into `workflows_extensions`, not the engine (grounds Finding 1's boundary claim).
- `x-pack/solutions/security/plugins/security_solution/server/plugin.ts:221` — `this.config.experimentalFeatures` read at setup (grounds the experimental-flag gating pattern, Finding 6).
- Absence (verified by exhaustive `grep -rin "daybreak"`): no `x-pack/solutions/security/plugins/daybreak/` directory and no `daybreak` experimental flag; only the OpenSpec proposal references the name (grounds Finding 6).

## Open Questions
- The `daybreak` plugin and its experimental flag do not exist in the repo, yet the proposal gates the spike behind "the existing `daybreak` experimental feature flag" (FR-12, NFR-2). Does the operator intend PD-1 to first scaffold a new `daybreak` plugin + flag, or is there an existing/seed plugin to clone that this research could not locate? (Forward: tasks — resolves whether plugin scaffolding is in-scope for PD-1.)
- FR-2 references "mirroring `fetch_runtime_config` from the source workflow," but no `fetch_runtime_config`/`fetchRuntimeConfig` symbol exists anywhere in the repo. Where is "the source workflow" James's 9.5 design derives from, and is it external to this repo? (Out of scope for PD-1's stub Setup, but it blocks PD-2's real config-fetch step.)
- The engine's `connector` step returns the connector's raw `data` with no per-step Zod/JSON-schema output enforcement visible in the handler. PD-1 can demonstrate a stub returning structured JSON, but the fail-closed structured-output guard (FR-6) is not an engine built-in. (Forward: design — confirm whether output-schema validation is the worker's responsibility at the Reason/Act boundary, which is a PD-2 concern.)
- The integration fixture centers on `runSingleStep`; whether a single `WorkflowRunFixture` full run (all three step types, not single-step) is exercised by an existing test, or needs a small addition for the spike's end-to-end assertion, was not confirmed.
- Does executing a `connector` step in the test harness require a live connector binding, or is the `echo_inference` fake sufficient to prove the structured-output path end-to-end? The fake's existence suggests yes, but the spike's README should record the answer explicitly (one of the integration unknowns PD-1 is meant to flush).
