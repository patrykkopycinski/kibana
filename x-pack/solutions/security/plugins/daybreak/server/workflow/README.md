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

## PD-2 — The real 5-phase worker (`alert_analysis_worker.yaml`)

PD-2 delivered the production worker as a single shipped workflow definition,
`alert_analysis_worker.yaml`, gated behind `xpack.daybreak.enabled` (default
`false`, FR-007/NFR-2). Five phases, each a step (or nested `if` guard) in the
same file the runtime executes — there is no separate "prod" copy that can
drift from what CI validates:

| Phase | Step id | Step type | Purpose | FR |
|---|---|---|---|---|
| 1. Setup | `setup` | `kibana.request` | Load per-space runtime config (`enabled`, `connector`, `thresholds`, `already_tagged`) | FR-007 |
| — enabled gate | `guard_enabled` | `if` | Short-circuits the whole worker when the space config has `enabled: false` — every later phase nests inside this guard | FR-007 |
| 2. Guard | `guard` | `if` | Idempotency/dedup check — skips when the alert already carries this worker's result tag (`NOT ... already_tagged: true`) | FR-008 |
| 3. Enrich | `enrich` | `kibana.request` | Packages real alert evidence from `/internal/detection_engine/signals/_alerts_summary`, kept structurally separate from Reason-phase framing (NFR-4 prompt-injection control) | FR-009 |
| 4. Reason | `reason` | `ai.agent` | Structured triage via the Agent Builder agent (`ALERT_ANALYSIS_AGENT_ID`); guarded by `validate_reasoning` so a malformed/missing `structured_output` fails closed before Act runs | FR-010 |
| 5. Act | `act` | `kibana.request` | Emits the Proposal via `POST /internal/daybreak/proposals`, producing a document that satisfies the full `ProposalProperties` shape | FR-011 |

`reason` always uses the recognized `ai.agent` step type, never a deprecated
connector type — asserted directly by the FR-9 e2e gate below
(`isDeprecatedStepType`).

---

## PD-3 — The two-gate eval architecture

PD-3 answers "how do we know the worker still works?" with **two independent
gates**, each catching a different class of regression. Both must be green;
neither substitutes for the other.

```
                 ┌─────────────────────────────┐        ┌──────────────────────────────┐
                 │   Gate 1 — Offline Dataset   │        │  Gate 2 — Live UI-Journey     │
                 │   (server/evals/*)           │        │  (server/integration_tests/  │
                 │                               │        │   alert_analysis_e2e.test.ts)│
                 ├───────────────────────────────┤        ├───────────────────────────────┤
                 │ Golden alert evidence         │        │ Real 5-phase worker YAML       │
                 │  → deterministic reasoning    │        │  → WorkflowRunFixture engine   │
                 │  → shape-match scorer         │        │  → full Proposal ES document   │
                 │                               │        │                               │
                 │ Fast, no engine, no HTTP      │        │ Exercises the real workflow    │
                 │ Proves the REASONING is right │        │ Proves the WIRING is right     │
                 └───────────────────────────────┘        └───────────────────────────────┘
```

### Gate 1 — Offline Dataset Gate (FR-8)

Files: `server/evals/golden_dataset.ts`, `server/evals/offline_dataset_gate.ts`,
`server/evals/alert_analysis_eval.test.ts`, `server/evals/generate_eval_report.ts`.

- **Dataset** (`golden_dataset.ts`) — a small golden set of
  `AlertEvidence → ExpectedProposalShape` rows (`daybreakGoldenDataset`). Two
  nominal rows (one true-positive/escalate, one false-positive/dismiss) plus
  one **deliberately-broken** row (see FR-10/A-3 below). Deliberately
  framework-agnostic (no `@kbn/evals` runtime import) so it can be adopted
  verbatim by a future `kbn-evals-suite-daybreak` package via
  `satisfies EvaluationDataset`.
- **Reasoning task** (`reasonOverAlertEvidence` in `offline_dataset_gate.ts`) —
  a deterministic mirror of the Reason phase's triage logic (stance-signal
  balance → true/false positive, severity weight → confidence, both →
  status/recommendation polarity). Deterministic on purpose: the gate must be
  reproducible without a live model call.
- **Scorer** (`scoreProposalShape`) — compares the produced
  `ExpectedProposalShape` against the golden expected shape: exact match on
  `capability`/`severity`/`status`, `confidence` within
  `CONFIDENCE_TOLERANCE` (0.15), escalate/dismiss polarity match on
  `recommendation` prose, non-empty `title`. Returns `score: 1` (match) or
  `score: 0` (mismatch) with a mismatch-list `explanation`.
- **Runner** (`runOfflineExperiment`) — a minimal in-process mirror of
  `@kbn/evals`'s `EvalsExecutorClient.runExperiment`: iterates every example
  through the task then every evaluator, structurally identical to the real
  contract so swapping to `executorClient.runExperiment` later is a drop-in
  change.
- **Report** (`generate_eval_report.ts`) — `generateEvalReport` /
  `writeEvalReport` roll the per-example scores into a versioned JSON report
  (`data/daybreak-alert-analysis-eval-report.json` via `@kbn/fs`) with a single
  `summary.gatePassed` boolean CI can key off of.

**Pass condition (FR-8):** every nominal row scores `1` AND every broken row
scores `0`.

### Gate 2 — Live UI-Journey Gate (FR-9)

File: `server/integration_tests/alert_analysis_e2e.test.ts`.

FR-9 calls for a Playwright/Scout test against a live stack. Since no UI panel
exists yet (PD-4 not delivered on this branch), this gate takes the documented
fallback: it drives the **real, shipped** `alert_analysis_worker.yaml`
end-to-end through `WorkflowRunFixture` (real engine runtime; `fetch` and the
Reason-phase `ai.agent` step definition are the only mocked boundaries) and
asserts against the ES document directly instead of a rendered panel.

- Mocks `fetch` for the three HTTP boundaries the worker calls
  (`/internal/daybreak/config`, `/internal/detection_engine/signals/_alerts_summary`,
  `/internal/daybreak/proposals`).
- Stubs the `ai.agent` step definition with a deterministic
  `structured_output` triage verdict so `validate_reasoning` passes and Act
  actually runs (the fixture cannot host a live Agent Builder execution
  service).
- Runs `workflowRunFixture.runWorkflow({ workflowYaml: ALERT_ANALYSIS_WORKER_YAML })`
  — the **production YAML import**, not an inline copy, so the gate fails the
  moment the shipped definition drifts.
- Asserts:
  1. the workflow execution reaches `ExecutionStatus.COMPLETED` with no error;
  2. the Reason phase dispatches as `ai.agent` (never a deprecated connector
     type — `isDeprecatedStepType`) and carries the expected `agent_id`;
  3. the Act phase's output matches the full `ProposalProperties` shape field
     by field (not a subset);
  4. a freshly-emitted (`status: 'new'`) Proposal fails
     `requireReadinessGate(..., 'approved')` — fail-closed is enforced at the
     document level, not just by convention.

### FR-10 / A-3 — Non-vacuous gate proof

`golden_dataset.ts` ships one row, `BROKEN_FLIPPED_RECOMMENDATION`
(`daybreak-golden-broken-flipped-ransomware`), whose evidence unambiguously
describes a critical ransomware true positive but whose `output` is
**intentionally flipped** (dismiss, low severity, confidence 0.1). Gate 1
scores this row `0` — the worker's real reasoning cannot match the wrong
expected shape — and `alert_analysis_eval.test.ts` asserts:

- the broken row scores `0` (mismatch), never `1`;
- the mismatch `explanation` is non-empty;
- at least **two independent fields** disagree (severity, status, confidence,
  and recommendation polarity all flip together), so a single-field
  false-negative in the scorer cannot mask the regression;
- the full-gate contract holds: `gatePassed` is `true` **iff** all nominal
  rows match **and** all broken rows fail.

If this row ever scored `1`, the gate would be vacuous (matching anything) —
that is the exact regression `BROKEN_EXAMPLE_IDS` / this test exists to catch.

---

## Files

| File | Role |
|---|---|
| `spike_workflow.yaml` | PD-1 spike: 3-step shape-validation definition (FR-001..FR-005) |
| `alert_analysis_workflow.ts` | Parses + schema-validates the spike YAML via `WorkflowSchema` (FR-005) |
| `run_spike_workflow.ts` | PD-1 spike runner: triggers via `executeWorkflow`, logs step I/O (FR-008..FR-010) |
| `alert_analysis_worker.yaml` | PD-2: the real, shipped 5-phase worker (Setup → Guard → Enrich → Reason → Act) (FR-006..FR-011) |
| `run_alert_analysis_worker.ts` | PD-2 runner wiring the worker into `DaybreakPlugin.start()`, gated by config | 
| `output_validation_guard.ts` | `validate_reasoning` guard — fails closed when the Reason phase's `structured_output` is missing/malformed | 
| `../evals/golden_dataset.ts` | Gate 1 (FR-8): golden `AlertEvidence → ExpectedProposalShape` dataset, including the FR-10/A-3 broken row |
| `../evals/offline_dataset_gate.ts` | Gate 1 (FR-8): deterministic reasoning task + shape-match scorer + experiment runner |
| `../evals/generate_eval_report.ts` | Gate 1: rolls per-example scores into a versioned JSON report via `@kbn/fs` |
| `../evals/alert_analysis_eval.test.ts` | Gate 1 (FR-8, FR-10, A-3) suite-level pass/fail assertions |
| `../integration_tests/alert_analysis_e2e.test.ts` | Gate 2 (FR-9): live-journey e2e against the real worker YAML via `WorkflowRunFixture` |
| `../integration_tests/workflow_engine_shape.test.ts` | PD-1 spike: end-to-end shape-validation test (FR-011..FR-014) |
