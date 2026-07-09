# PD-1 Spike — Workflow Engine Shape Validation

> Capability-validation spike for **Project Daybreak S1**. Confirms the Kibana
> Workflow Engine (`@kbn/workflows-execution-engine`) can express the
> alert-analysis worker step shape — **HTTP fetch → conditional guard → AI
> inference** — and run it end-to-end with structured per-step output.
>
> This is a spike only: no production trigger, no live model call. Gated behind
> the `xpack.daybreak.enabled` experimental flag, default off (FR-007, NFR-2).

---

## What was validated (FR-016)

The spike definition (`spike_workflow.yaml`) exercises all three critical step
types using **shipped YAML syntax** (not the README's illustrative form):

| Step | Step type | Purpose | FR |
|---|---|---|---|
| `fetch_alert_summary` | `kibana.request` | HTTP fetch of an internal Kibana API route, returns parsed structured output | FR-002 |
| `guard_has_alerts` | `if` | KQL conditional guard — only proceeds when alerts exist | FR-003, FR-005 |
| `analyze_alert` | `inference` | AI invocation via a connector with structured JSON output | FR-004 |

### Verified results

An end-to-end integration test
(`server/integration_tests/workflow_engine_shape.test.ts`) drives the workflow
through the real engine runtime via `WorkflowRunFixture.runWorkflow()` and
asserts each step's structured output shape. **All assertions pass:**

1. **End-to-end execution (FR-008, FR-010, FR-011):** the workflow reaches
   `ExecutionStatus.COMPLETED` with no error — the three-step composition runs to
   completion.
2. **HTTP-fetch output (FR-012):** the `kibana.request` step returns the parsed
   JSON response body as its `output` (the response is JSON-parsed by
   `readResponseBody` in the engine's `kibana_action_step.ts`).
3. **Conditional guard (FR-013):** the `if` step evaluates the KQL condition
   `steps.fetch_alert_summary.output.total:*` (a "field exists" wildcard),
   records `conditionResult: true`, and enters the then-branch so the nested
   `analyze_alert` step executes.
4. **AI-inference output (FR-014):** the `inference` step produces structured
   JSON output `[{ result: <text> }]` from the stub connector.

### How it runs

- **Definition + schema validation** — `alert_analysis_workflow.ts` parses the
  YAML against the engine's shipped `WorkflowSchema` (`@kbn/workflows`),
  returning a strongly-typed `WorkflowYaml` (FR-005). This proves the shape is
  schema-valid before any execution.
- **Runner** — `run_spike_workflow.ts` consumes the engine's public
  `executeWorkflow` start-contract method (`WorkflowsExecutionEnginePluginStart`),
  converting the definition via `toWorkflowExecutionEngineModel`. It logs each
  step's input before invocation and the execution response after (FR-009). The
  runner is wired into `DaybreakPlugin.start()`, guarded by
  `this.config.enabled` (FR-007).
- **Test harness** — the integration test uses the in-process
  `WorkflowRunFixture` (real engine runtime, mocked Task-Manager layer), so it
  is deterministic without needing a live stack.

---

## Engine limitations discovered (FR-017)

1. **`executeWorkflow` needs a request/task-manager context.** The public
   `executeWorkflow` throws when invoked without a `KibanaRequest` and outside a
   task-manager context. The plugin-level runner must thread a request through;
   the in-process test fixture sidesteps this by calling the internal
   `runWorkflow` with a fake request. Choose the path deliberately.

2. **Completion-semantic race.** `executeWorkflow` persists the execution then
   hands off to Task Manager. Asserting `COMPLETED` synchronously against the
   public API can race — the persisted document may still be `RUNNING` when the
   call returns. The fixture-based path awaits `runWorkflow` directly and is
   deterministic. **Any live-stack execution in PD-2 must await completion via
   the Task-Manager layer, not synchronously.**

3. **Fail-closed on error is NOT an engine built-in.** The KQL guard naturally
   returns `false` when a referenced field is absent (e.g. if
   `output.total` is missing the guard short-circuits to the else/skip branch —
   fail-closed for *missing* data). But fail-closed behavior *on a step error or
   inference timeout* is not provided by the engine; it is a boundary concern
   that the worker (PD-2) must enforce itself.

4. **Stub connector output shape is not real model output.** The `echo_inference`
   test stub returns `[{ result: params.text }]` — an echo, not structured model
   output. The `with: { text: ... }` key must match what the connector reads.
   Real inference connectors will return a different (richer) envelope, so the
   asserted `output` shape here is stub-specific and not portable to production.

5. **Conditions are KQL, not free booleans.** String conditions are evaluated as
   KQL via `@kbn/eval-kql`. This is expressive for field-existence/value checks
   but cannot express arbitrary boolean logic; complex gating must be decomposed
   into multiple `if` steps.

---

## What PD-2 must account for (FR-018)

The spike defers the following to PD-2 (the real 5-phase worker). They are the
leading edges of the A-1 (wiring) and A-2 (shape) unknowns:

1. **Swap the stub connector for a real inference / Agent Builder connector.**
   The spike uses `echo_inference` purely to flush the execution unknown. PD-2
   must wire a real `connector-id` and validate the actual model-output envelope.
   (Resolves the proposal's open question: stub-vs-real — PD-2 owns it.)

2. **Enforce fail-closed on inference error/timeout.** The engine provides no
   built-in; PD-2 must add explicit error-handling step(s) or a guard that
   treats a failed/timed-out inference as a hard stop.

3. **Handle the completion race for live-stack execution.** Await completion
   through the Task-Manager scheduling layer rather than reading the persisted
   execution synchronously after `executeWorkflow`.

4. **Schema-validate the AI step's structured output.** The stub returns
   free-form data; PD-2 needs a Zod-equivalent schema gate on the inference
   output before downstream steps consume it.

5. **Real HTTP-fetch output shape.** The spike mocks the alerts-summary
   response. PD-2 must validate against the actual
   `/internal/detection_engine/signals/_alerts_summary` route output and confirm
   the guard condition field (`output.total`) matches reality.

6. **Production trigger wiring.** The spike uses `triggers: [{ type: manual }]`.
   PD-2 needs a real trigger (e.g. new-alert or scheduler-driven).

7. **Custom-orchestration fallback (A-2 worst case).** If PD-2 finds the engine
   cannot express the full 5-phase worker shape, the documented fallback is
   custom orchestration (not core workflow engine). Pre-staged here so a pivot
   does not require re-planning from a cold start: the worker would invoke
   `kibana.request` and connector calls directly via the actions plugin + a
   bespoke step runner, replicating the fetch→guard→infer loop outside the
   workflow graph.

---

## Files

| File | Role |
|---|---|
| `spike_workflow.yaml` | The 3-step spike workflow definition (FR-001..FR-005) |
| `alert_analysis_workflow.ts` | Parses + schema-validates the YAML via `WorkflowSchema` (FR-005) |
| `run_spike_workflow.ts` | Runner: triggers via `executeWorkflow`, logs step I/O (FR-008..FR-010) |
| `../integration_tests/workflow_engine_shape.test.ts` | End-to-end shape-validation test (FR-011..FR-014) |
