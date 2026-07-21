---
tasks_completed: 16
tasks_total: 16
---
All anchors confirmed. Key verified grounding:
- **Greenfield confirmed**: no `x-pack/solutions/security/plugins/daybreak/`, no `daybreak` flag/config anywhere — so the spike must scaffold both (research Finding 6, `Forward: tasks`).
- **Step handlers exist**: `server/step/kibana_action_step.ts`, `server/step/connector_step.ts`, `server/step/if_step/` (Finding 2).
- **Composition ships**: streams `continuous_extraction_workflow.yaml:56` (`type: kibana.request`) → `:73-74` (`type: if` + `condition:`) (Finding 3).
- **Runner entry points**: engine `executeWorkflow` + agent_builder `execute_workflow.ts:30,51` wrapper (Finding 4).
- **Test template**: `integration_tests/workflow_run_fixture.ts` + `tests/single_step_run.test.ts` + `echo_inference` at `mocks/actions_plugin_mock/fake_connectors.ts:24` (Finding 5).
- **`if` form pinned**: `if_step/README.md` — `condition:` (required, KQL/`${{ }}` expr) + `steps:` array + optional `else:` (Finding 7, refines the README-vs-shipped syntax fork).

Now writing the task list.

# Tasks

## Phase 0: Reconnaissance & Plugin Foundation

#### 1.1 Explore the workflow-engine surface and confirm the daybreak greenfield anchors

**File**: `.ao/recon.md`

**Intent**: De-risk the spike before any code is written. research.md is already confirmatory (the engine expresses all three step types), but a focused read-only pass pins the exact current integration points against the live repo — the greenfield `daybreak` plugin/flag gap (research Finding 6), the three step-type handlers, the `WorkflowRunFixture` + `echo_inference` test template, the runner entry point, and the shipped `if`-condition form — so downstream tasks contract against real anchors, not second-hand claims.

**Contract**:
- `.ao/recon.md` documents each of the following with a verified `file:line` anchor:
  - Confirmation that no `x-pack/solutions/security/plugins/daybreak/` directory and no `daybreak` experimental flag/config key exist anywhere in the repo (research Finding 6).
  - The three step-type handlers: `src/platform/plugins/shared/workflows_execution_engine/server/step/kibana_action_step.ts`, `…/step/if_step/` (`README.md` pins `condition:` + `steps:` + optional `else:`), `…/step/connector_step.ts` (research Finding 2; `if_step/README.md:3,11,22-24`).
  - The shipped HTTP→guard composition: `x-pack/platform/plugins/shared/streams/server/lib/workflows/continuous_extraction_workflow.yaml:56,73-74` (research Finding 3).
  - The integration-test template: `integration_tests/workflow_run_fixture.ts`, `integration_tests/tests/single_step_run.test.ts` and `if_condition.test.ts`, and the `echo_inference` stub at `integration_tests/mocks/actions_plugin_mock/fake_connectors.ts:24` (research Finding 5).
  - The chosen runner entry point — `workflowsExecutionEngine.executeWorkflow`/`executeWorkflowStep` or the `agent_builder/server/services/workflow/execute_workflow.ts:30,51` wrapper — and which the spike adopts (research Finding 4).
  - The experimental-feature gating pattern a new flag must mirror (research Finding 6 cites `security_solution/server/plugin.ts` `experimentalFeatures` threading).

**Traces**: (infrastructure — unblocks FR-001, FR-006, FR-007)

#### 1.2 Scaffold the `daybreak` plugin and experimental flag (default off)

**File**: `x-pack/solutions/security/plugins/daybreak/`

**Intent**: Stand up the greenfield plugin home and its default-off experimental flag so the spike's workflow, runner, test, and README have a place to live and are safely gated for a mid-spike merge (NFR-1, NFR-2). The proposal's "existing flag" wording is contradicted by the repo state, so this scaffold is a prerequisite the tasks wave owns (research Finding 6; `Forward: tasks`).

**Contract**:
```typescript
// x-pack/solutions/security/plugins/daybreak/common/config.ts
export const config = {
  // mirrors the security_solution experimentalFeatures gating pattern (research Finding 6)
  exposes an `experimentalFeatures.daybreak: boolean` flag
};
// x-pack/solutions/security/plugins/daybreak/server/plugin.ts
// setup()/start() read this.config.experimentalFeatures.daybreak — default false (NFR-2)
```
- Plugin skeleton present: `kibana.jsonc`, `common/config.ts`, `server/index.ts` (defers `./plugin` per the server-entry rule), `server/plugin.ts`, `tsconfig.json`.
- The `daybreak` flag defaults to `false` and the plugin does no work when it is off.

**Traces**: FR-006, FR-007

### Verification:

#### Automated:
- [ ] 1.1 `test -f .ao/recon.md` succeeds and `grep -qE 'daybreak|if_step|workflow_run_fixture|executeWorkflow|echo_inference' .ao/recon.md` matches all five required anchors (FR-001, FR-006, FR-007) @host:kibana-i9
- [ ] 1.2 `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-006) @host:kibana-i9
- [ ] 1.2 `grep -rq "daybreak" x-pack/solutions/security/plugins/daybreak/common/config.ts` and the flag resolves to `false` by default (FR-007) @host:kibana-i9
- [ ] 1.2 `node scripts/eslint --fix $(git diff --name-only HEAD)` passes on the new plugin files (FR-006) @host:kibana-i9

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 1: Workflow Definition & Runner (Engine Shape Validation)

#### 2.1 Author the minimal spike workflow definition (three step types, shipped syntax)

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/spike_workflow.yaml`

**Intent**: The core A-2 validation artifact — a single minimal workflow that exercises all three required step types in the shipped/tested syntax, proving the engine can express the HTTP-fetch → conditional-guard → AI-invocation-with-structured-output shape the NotDaybreak worker needs.

**Contract**:
- `spike_workflow.yaml` defines a workflow containing:
  - A `type: kibana.request` (or `http`) step returning parsed structured output (FR-002; handler `server/step/kibana_action_step.ts`, research Finding 2).
  - A `type: if` step with a `condition:` expression and a nested `steps:` array, in the shipped form — `type:` + `condition:` + nested `steps:`, not the engine README's `if:`/`then:`/`action:`/`params:` form (FR-003, FR-005; `if_step/README.md:3,11,22-24` and `continuous_extraction_workflow.yaml:73-74`, research Findings 2 & 7).
  - A `type: connector` step with a `connector-id` resolving to the `echo_inference` stub and a `with:` sub-action, producing structured JSON — not a live model call (FR-004; handler `server/step/connector_step.ts`, stub at `fake_connectors.ts:24`, research Findings 2 & 5).

**Traces**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006

#### 2.2 Implement the minimal runner that triggers the workflow once and logs per-step I/O

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/run_workflow.ts`

**Intent**: Provide a thin runner that executes the spike workflow once to completion through an existing engine entry point (no new execution path authored), and logs each step's input and output so the engine's runtime behaviour is observable during the spike (FR-008–FR-010; research Finding 4).

**Contract**:
```typescript
// Wraps an existing engine entry point (research Finding 4):
//   workflowsExecutionEngine.executeWorkflow / executeWorkflowStep
//   or the agent_builder execute_workflow.ts:30,51 wrapper (workflowApi.executeWorkflow).
// No new execution path is authored — see design.md §"Confirmatory, not exploratory".
export const runWorkflowOnce = async (args: {
  workflow: /* parsed spike_workflow.yaml definition */;
  request: KibanaRequest;
  spaceId: string;
}): Promise<Array<{ stepId: string; input: unknown; output: unknown }>>;
// logs each step's input/output (FR-009); throws on engine error, never silently (FR-008).
```
- The runner is gated on `experimentalFeatures.daybreak` and does nothing when the flag is off (FR-007).

**Traces**: FR-008, FR-009, FR-010

### Verification:

#### Automated:
- [ ] 2.1 `grep -qE 'type:\s*kibana\.request' …/server/workflow/spike_workflow.yaml` matches the HTTP-fetch step (FR-002) @host:kibana-i9
- [ ] 2.1 `grep -qE 'type:\s*if' …/server/workflow/spike_workflow.yaml` and a `condition:` key are present with a nested `steps:` array (FR-003, FR-005) @host:kibana-i9
- [ ] 2.1 `grep -qE 'connector-id:|type:\s*connector' …/server/workflow/spike_workflow.yaml` matches the AI step (FR-004) @host:kibana-i9
- [ ] 2.2 `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes (FR-008, FR-010) @host:kibana-i9
- [x] 2.2 `grep -qE 'executeWorkflow' …/server/workflow/run_workflow.ts` confirms the runner reuses an existing entry point rather than authoring a new one (FR-010) @host:kibana-i9

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 2: Integration Test

#### 3.1 Add `workflow_engine_shape.test.ts` asserting each step type's structured output

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/workflow_engine_shape.test.ts`

**Intent**: Prove, end-to-end via the engine's own harness, that each of the three step types produces the expected structured output shape — the yes/no evidence that A-2 resolves in the engine's favour. Built on the engine's `WorkflowRunFixture` with the inline spike workflow and the `echo_inference` stub as the AI step, mirroring `single_step_run.test.ts` / `if_condition.test.ts` (research Finding 5).

**Contract**:
- A `jest.integration.config.js` exists under the daybreak plugin enabling the integration test.
- `workflow_engine_shape.test.ts` runs the spike workflow end-to-end using `WorkflowRunFixture` (`src/platform/plugins/shared/workflows_execution_engine/integration_tests/workflow_run_fixture.ts`) with the `echo_inference` `FakeConnectors` stub as the AI-invocation step (FR-011, FR-015; research Finding 5).
- The test asserts:
  - The HTTP-fetch (`kibana.request`) step produced its expected structured output shape (FR-012).
  - The `if` step produced its expected branch output, including the `conditionResult` the engine records (`src/platform/plugins/shared/workflows_execution_engine/server/step/if_step/exit_if_node_impl.ts:22-24`) (FR-013).
  - The `connector` step produced its expected structured JSON output via the `echo_inference` stub (FR-014).

**Traces**: FR-011, FR-012, FR-013, FR-014, FR-015

### Verification:

#### Automated:
- [ ] 3.1 `node scripts/jest_integration --config x-pack/solutions/security/plugins/daybreak/server/jest.integration.config.js workflow_engine_shape` passes (FR-011, FR-012, FR-013, FR-014) @host:kibana-i9
- [x] 3.1 `grep -qE 'WorkflowRunFixture' …/server/workflow/workflow_engine_shape.test.ts` confirms it reuses the engine harness, not a bespoke one (FR-015) @host:kibana-i9
- [x] 3.1 `grep -qE 'echo_inference' …/server/workflow/workflow_engine_shape.test.ts` confirms the AI step is the stub connector, not a live model call (FR-004, FR-015) @host:kibana-i9

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 3: Findings Documentation

#### 4.1 Document what the spike validated, engine limitations, and PD-2 forward notes

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/README.md`

**Intent**: Capture the spike's conclusions so PD-2 (the real 5-phase worker) starts from a grounded, written record rather than a re-investigation — what the engine can do, where it is limited, and what PD-2 must account for (including the fail-closed output-validation guard that research establishes is not an engine built-in).

**Contract**:
- README contains three sections:
  - **"What was validated"** — records that the engine expresses the HTTP-fetch + conditional-guard + stub-AI-invocation shape end-to-end (FR-016; grounded in the PD-1 results and research Summary).
  - **"Engine limitations discovered"** — documents any limits surfaced (e.g. condition-DSL form, completion-semantic behaviour, connector type-split), or states "none discovered beyond research.md" if so (FR-017).
  - **"What PD-2 must account for"** — records the spike's PD-2 implications, explicitly including that FR-6's fail-closed output-validation guard is not an engine built-in and must be a PD-2 boundary concern (FR-018; research Open Questions / design.md failure modes).

**Traces**: FR-016, FR-017, FR-018

### Verification:

#### Automated:
- [ ] 4.1 `test -f x-pack/solutions/security/plugins/daybreak/server/workflow/README.md` succeeds (FR-016) @host:kibana-i9
- [ ] 4.1 `grep -qiE 'what was validated|validated' …/server/workflow/README.md` matches the validation section (FR-016) @host:kibana-i9
- [ ] 4.1 `grep -qiE 'limitation' …/server/workflow/README.md` matches the limitations section (FR-017) @host:kibana-i9
- [ ] 4.1 `grep -qiE 'PD-2|fail.closed|output.validation' …/server/workflow/README.md` matches the PD-2 forward notes and the fail-closed guard caveat (FR-018) @host:kibana-i9

#### Manual:
*(none — fully machine-checkable)*
