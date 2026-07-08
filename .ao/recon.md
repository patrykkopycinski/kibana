# Reconnaissance — Daybreak S1 / PD-1 Workflow Engine Shape Spike

> Recon for plan **daybreak-s1-pd1-workflow-engine-spike**. Scope: validate the Kibana
> Workflow engine can express the alert-analysis worker step shape (HTTP fetch +
> conditional guard + stub AI invocation). This document is exploration only — no
> source files were modified. All anchors re-verified against disk on this pass.
>
> FR map: FR-001 (3-step shape) · FR-002 (`kibana.request`) · FR-003 (`if` guard) ·
> FR-004 (connector AI stub) · FR-005 (shipped YAML syntax) · FR-006 (path under
> `daybreak/server/workflow/`) · FR-007 (`daybreak` flag, default off).

---

## 0. Headline finding — the spike is NOT greenfield on the plugin/flag axis

The spec/design framed the `daybreak` plugin and its experimental flag as
"greenfield / Forward: tasks" (grounded in research.md Finding 6). **That framing
is now stale.** A prior tasks wave has already scaffolded the plugin in full:

```
x-pack/solutions/security/plugins/daybreak/
├── kibana.jsonc                         # manifest: @kbn/daybreak-plugin, group security, configPath [xpack, daybreak]
├── tsconfig.json / tsconfig.type_check.json / jest.config.js
├── common/
│   ├── config.ts                        # FR-007 flag: { enabled: boolean, defaultValue: false }
│   └── config.test.ts                   # asserts default-off, accepts true/false, rejects bad input
└── server/
    ├── index.ts                         # lazy `await import('./plugin')` (AGENTS.md server-entry rule honored)
    ├── plugin.ts                        # DaybreakPlugin: gates setup/start on `this.config.enabled`
    ├── types.ts                         # DaybreakPluginSetup/Start = Record<string, never>
    └── workflow/
        └── alert_analysis_workflow.ts   # FR-001..FR-005 YAML + WorkflowSchema.parse()
```

So FR-006 (`daybreak/server/workflow/` exists) and FR-007 (`daybreak` flag, default
off) are **already satisfied**. What the spike still owes, per the proposal's "What
Changes", is the **runner/executor invocation** ("run once end-to-end, log each
step's I/O"), the **`workflow_engine_shape.test.ts` integration test**, and the
**README documenting what was validated / engine limitations**.

Repo-wide, the only other `daybreak` references outside the plugin itself are two
**prose docstrings** about a `.daybreak-proposals` ES entity
(`entity_store/common/domain/definitions/proposals.gen.ts:11`,
`security_solution/server/lib/entity_analytics/entity_store/entity_definitions/entity_descriptions/proposals.ts:15-16`)
— unrelated to the feature flag. There is **no** `daybreak` entry in
`security_solution/common/experimental_features.ts` (`allowedExperimentalValues`);
the flag lives solely in the daybreak plugin's own config namespace.

---

## 1. Architecture Overview

The spike composes three concerns; the data flow is:

```
daybreak plugin (flag-gated)
   │
   │  reads  ALERT_ANALYSIS_WORKFLOW_YAML (alert_analysis_workflow.ts)
   │  parses via WorkflowSchema.parse()  ← @kbn/workflows (shipped Zod schema)
   ▼
workflows_execution_engine (@kbn/workflows-execution-engine)
   │
   │  public API:  WorkflowsExecutionEnginePluginStart.executeWorkflow  (plugin.ts:785)
   │  internal:    runWorkflow()  (execution_functions/run_workflow.ts)
   ▼
step runtime — NodesFactory dispatches each graph node to a step impl:
   ├── kibana.*        → KibanaActionStepImpl   (kibana_action_step.ts)   [FR-002 HTTP]
   ├── if              → EnterIfNodeImpl + branch/exit nodes (if_step/)   [FR-003 guard]
   └── <actionType>    → ConnectorStepImpl      (connector_step.ts)       [FR-004 AI stub]
```

**Engine package layout** (`src/platform/plugins/shared/workflows_execution_engine/`):
`common/` (ES index/mapping constants), `server/` (plugin lifecycle + runtime,
`browser:false`), `integration_tests/` (the `WorkflowRunFixture` + specs), `docs/`,
`README.md`. `kibana.jsonc`: module `@kbn/workflows-execution-engine`, plugin id
`workflowsExecutionEngine`, required plugins `taskManager`, `actions`,
`workflowsExtensions`, `licensing`.

**Two distinct execution entry surfaces** (both verified, both relevant to the spike):

| Surface | Symbol | Where | When to use |
|---|---|---|---|
| Plugin start contract (public) | `executeWorkflow` | `server/plugin.ts:785`, exposed `server/types.ts:61` | Live-stack / plugin-level smoke (needs user context + Task Manager) |
| Internal function (testable in-process) | `runWorkflow` | `server/execution_functions/run_workflow.ts` | Engine integration tests via `WorkflowRunFixture.runWorkflow()` |

The spec cited `executeWorkflow (plugin.ts:794)`; 794 is a comment line — the actual
`const executeWorkflow: ExecuteWorkflow = async (...) => {` is at **line 785**.

---

## 2. Relevant Code Locations

### 2.1 The daybreak plugin (spike target — already scaffolded)

| File | Lines | Notes |
|---|---|---|
| `x-pack/.../daybreak/kibana.jsonc` | 1-23 | `configPath:["xpack","daybreak"]`; `optionalPlugins:["workflowsExecutionEngine"]` |
| `x-pack/.../daybreak/common/config.ts` | 16-20 | `enabled: schema.boolean({ defaultValue: false })` — **FR-007** |
| `x-pack/.../daybreak/common/config.test.ts` | 10-29 | 5 tests: default-off, true/false opt-in, rejects non-bool, rejects extra props |
| `x-pack/.../daybreak/server/index.ts` | 15-22 | `config` descriptor + lazy `import('./plugin')` |
| `x-pack/.../daybreak/server/plugin.ts` | 19-49 | gates setup/start on `this.config.enabled`; empty contracts today |
| `x-pack/.../daybreak/server/types.ts` | 12-16 | `DaybreakPluginSetup/Start = Record<string, never>` |
| `x-pack/.../daybreak/server/workflow/alert_analysis_workflow.ts` | 23-66 | **FR-001..FR-005** YAML + `getAlertAnalysisWorkflow()` → `WorkflowSchema.parse()` |

The shipped workflow YAML (lines 23-54) exercises all three step types in the
shipped syntax (FR-005), not the README's illustrative `action:`/`params:` form:

```yaml
version: '1'
name: Daybreak Alert Analysis Spike
enabled: false
triggers:
  - type: manual
steps:
  - name: fetch_alert_summary          # FR-002  HTTP fetch
    type: kibana.request
    with: { method: GET, path: /internal/detection_engine/signals/_alerts_summary, headers: {...} }
  - name: guard_has_alerts             # FR-003  conditional guard
    type: if
    condition: 'steps.fetch_alert_summary.output.total:*'   # KQL "field exists"
    steps:
      - name: analyze_alert            # FR-004  stub AI invocation
        type: inference
        connector-id: inference_connector
        with: { text: 'Analyze alert summary for triage insights.' }
```

### 2.2 Step handlers (engine side — consumed, not modified)

- **HTTP fetch** — `server/step/kibana_action_step.ts:51` `KibanaActionStepImpl`.
  Routed by `nodes_factory.ts:132-143` for any `stepType.startsWith('kibana.')`.
  `_run()` (line 72) reads `with:` → builds the HTTP request (`executeKibanaRequest`,
  lines 165-268) → returns `{ input, output: <parsed body>, error }` (line 118).
  `readResponseBody()` (416-442) JSON-parses JSON, returns Buffer for binary, string
  otherwise, `null` for 204/304.
- **AI stub connector** — `server/step/connector_step.ts:83` `ConnectorStepImpl`.
  Config interface at 78-81: `{ 'connector-id'?, with? }`. `_run()` (line 100) splits
  sub-actions on `.` (105-108), renders `connector-id` through context (159-162),
  calls `connectorExecutor.execute({ connectorType, connectorNameOrId, input })`
  (174-179); on `status==='ok'` returns `{ input: withInputs, output: data }`
  (195-200). Falls back to a system connector if no `connector-id` (181-187).
- **if_step** — directory `server/step/if_step/`, barrel `index.ts`. Four node impls:
  `EnterIfNodeImpl` (`enter_if_node_impl.ts:17`) evaluates the condition and selects
  a branch; `enter_condition_branch_node_impl.ts`, `exit_condition_branch_node_impl.ts`,
  `exit_if_node_impl.ts` manage branch/exit. The `if` is compiled into graph nodes
  (`enter-if` → `enter-then-branch`/`enter-else-branch` → … → `exit-if`) by
  `nodes_factory.ts:311-333`; the nested `steps:` array becomes those branch nodes,
  not inline execution. `README.md` in the directory documents the full
  `type: if` + `condition:` + `steps:`/`else:` contract.
- **Condition evaluation** — `server/step/evaluate_condition.ts:13`
  `evaluateCondition()`: boolean returned directly, `undefined`→`false`, **string
  evaluated as KQL** via `@kbn/eval-kql` (lines 25-36). The daybreak condition
  `steps.fetch_alert_summary.output.total:*` is a KQL "field exists" wildcard —
  valid per the `if_step` README §"Wildcard Matching" (`fieldName:*` → Field exists).

### 2.3 Execution entry + types

- `executeWorkflow` definition — `server/plugin.ts:785`. Exposed in
  `WorkflowsExecutionEnginePluginStart` at `server/types.ts:61`; registered on the
  start contract at `plugin.ts:1366`. Mocked at `server/mocks.ts:20`.
- Full start contract — `server/types.ts:60-70`: `executeWorkflow`,
  `executeWorkflowStep`, `cancelWorkflowExecution`, `cancelAllActiveWorkflowExecutions`,
  `resumeWorkflowExecution`, `workflowEventLoggerService`, `scheduleWorkflow`,
  `bulkScheduleWorkflow`, `triggerEvents`.
- Internal `runWorkflow` — `server/execution_functions/run_workflow.ts`
  (consumed by the test fixture, not the plugin boundary).

### 2.4 Test harness + stub connector (the spike's test substrate)

- **`WorkflowRunFixture`** — `integration_tests/workflow_run_fixture.ts:29`. Fields
  of note: `dependencies` (mocked), `actionsClientMock`/`unsecuredActionsClientMock`/
  `scopedActionsClientMock`, `configMock` (`maxResponseSize` 10mb), `fakeKibanaRequest`,
  `workflowExecutionRepositoryMock`, `stepExecutionRepositoryMock`, `taskManagerMock`.
  Methods: `runWorkflow({workflowYaml, inputs?, event?})` (98-140),
  `resumeWorkflow()` (142-154), `runSingleStep({workflowYaml, stepId, contextOverride?})`
  (156-198). It calls the real `runWorkflow` (imports line 22) with mocked deps — i.e.
  it exercises the **real engine runtime**, just without the Task-Manager scheduling
  layer that `executeWorkflow` adds.
- **`echo_inference` stub** — `integration_tests/mocks/actions_plugin_mock/fake_connectors.ts:24-28`:
  `{ id:'b2c3d4e5-…', actionTypeId:'inference', name:'inference_connector' }`. Semantics
  (comment line 23): "Returns input value as connector result". The mock result at
  lines 72-82 returns `{ status:'ok', data:[{ result: params?.text }] }`. Re-exported
  from `actions_plugin_mock/index.ts:10`.
- **Authoritative `if` integration test** — `integration_tests/tests/if_condition.test.ts`
  (true-branch ~line 22, false-branch ~121, missing-else ~220, nested if ~301).
- **echo_inference used in YAML** — `integration_tests/tests/single_step_run.test.ts:34-35,111-112`:
  `type: ${FakeConnectors.echo_inference.actionTypeId}` / `connector-id: ${FakeConnectors.echo_inference.name}`.

> Note: the daybreak workflow's `connector-id: inference_connector` **exactly matches**
> `FakeConnectors.echo_inference.name`, and the mock resolves connectors by name/id, so
> the stub connector is already wired for a fixture-based test without any mock changes.

### 2.5 Shipped workflow YAML references (composition precedents)

> ⚠️ The design's `continuous_extraction_workflow.yaml:56,73-74` citation is **stale —
> that file does not exist** in the repo (verified by glob + grep; only `.ao/` logs
> reference the string). The real "streams" composition artifact is:

- `src/platform/packages/shared/kbn-workflows/managed/definitions/significant_events/knowledge_indicators/continuous_onboarding.yaml`
  — composes `type: kibana.request` (62-75, 112-117, 139-149) with `type: if` +
  `condition:` + nested `steps:` (78-81, 118-125, 151-158). Top-level shape:
  `version/name/enabled/description/tags/consts/settings/triggers/steps`.
- `…/significant_events/significant_events/triage.yaml:273-282` — `type: if` guarding
  an `ai.agent` connector step (`type: ai.agent` + `connector-id`, 172-179).
- `…/significant_events/significant_events/detection.yaml:413-429` — `type: if` whose
  nested `steps:` contains `kibana.request` sub-steps.
- `…/investigation/investigation_workflow.yaml` — `kibana.request` (56) + `ai.agent`
  with `connector-id` (70-73, 166).
- Cleanest minimal `if`/`steps`/`else` demo:
  `src/platform/plugins/shared/workflows_management/common/examples/national_parks.yaml:21-37`.

---

## 3. Existing Patterns

1. **Plugin server-entry rule** (AGENTS.md) — `server/index.ts` keeps
   `./plugin` out of the synchronous module graph: static exports are `import type`
   only, and the class is instantiated via `await import('./plugin')` inside the
   async `plugin()` initializer. The daybreak `server/index.ts:19-22` already follows
   this; the `@kbn/eslint/no_sync_import_from_plugin` rule enforces it.
2. **Standalone-plugin config flag (Pattern A)** — daybreak defines its own
   `xpack.daybreak.enabled` boolean (config schema + `configPath`), rather than
   registering under `security_solution`'s `enableExperimental` array registry
   (`security_solution/common/experimental_features.ts:14`, parsed at 334). This is
   the right pattern for an isolated experimental spike. `session_view/kibana.jsonc`
   is the canonical minimal external-plugin manifest for comparison.
3. **Flag-gated lifecycle** — `DaybreakPlugin.setup/start` early-return `{}` when
   `!this.config.enabled` (plugin.ts:29,39). New runtime wiring (the runner/executor
   the proposal asks for) must be added **inside** these guarded blocks so the
   default-off guarantee (NFR-2) holds.
4. **Schema-then-execute** — `alert_analysis_workflow.ts` already proves the shape is
   *parseable* by the shipped engine schema (`WorkflowSchema.parse` from
   `@kbn/workflows`). Schema validity ≠ runtime execution; the spike's value-add is
   the latter (run once end-to-end and assert each step's output shape).
5. **Engine integration-test idiom** — instantiate `new WorkflowRunFixture()` in
   `beforeAll`/`beforeEach`, `await fixture.runWorkflow({ workflowYaml })`, then
   assert on `fixture.workflowExecutionRepositoryMock.workflowExecutions.get(id)`
   (status `ExecutionStatus.COMPLETED`, no error) and on
   `fixture.stepExecutionRepositoryMock.stepExecutions` per step. This is exactly the
   shape a `workflow_engine_shape.test.ts` should take — and it runs in-process (no
   live stack needed) because the fixture replaces the Task-Manager layer.

---

## 4. Integration Points

- **Where the runner connects** — the daybreak `plugin.ts` `start()` currently returns
  `{}`. The runner/executor invocation (proposal "What Changes" bullet 2) would call
  `executeWorkflow` on the optional `workflowsExecutionEngine` start dep
  (`kibana.jsonc` already lists it optional), guarded by `this.config.enabled`. The
  contract is `WorkflowsExecutionEnginePluginStart` (`engine/server/types.ts:60-70`).
- **Test wiring** — a `workflow_engine_shape.test.ts` does **not** need the daybreak
  plugin's own lifecycle; it can import `ALERT_ANALYSIS_WORKFLOW_YAML` /
  `getAlertAnalysisWorkflow` and drive it through `WorkflowRunFixture.runWorkflow()`
  directly (matching `if_condition.test.ts`). This keeps the test hermetic and avoids
  the `executeWorkflow` "needs user context / Task Manager" requirement
  (`plugin.ts:799-801` throws `'Workflows cannot be executed without the user context'`
  unless running in a task-manager context or with a request).
- **Connector resolution** — `connector-id: inference_connector` in the YAML is
  resolved by the actions mock to `FakeConnectors.echo_inference` (name match). No
  mock edits required for the stub path. (The proposal's open question about whether
  to mirror a real Agent Builder connector shape is deferred to PD-2.)
- **`getAlertAnalysisWorkflow()` reuse** — already exported; the test and any runner
  can share one parsed definition to avoid YAML drift.

---

## 5. Constraints & Gotchas

1. **`executeWorkflow` needs a request/task-manager context.** `plugin.ts:799-801`
   throws if `!isRunningInTaskManager && !request`. So a live-stack smoke test calling
   the public `executeWorkflow` must pass a `KibanaRequest`; the in-process fixture
   path sidesteps this by calling the internal `runWorkflow` with `fakeKibanaRequest`.
   Choose the path deliberately when authoring the smoke step.
2. **Completion-semantic race.** `executeWorkflow` persists the execution then hands
   off to Task Manager (`createAndPersistWorkflowExecution`, plugin.ts:814+). Asserting
   `COMPLETED` synchronously against the public API can race; the fixture-based path
   awaits `runWorkflow` directly and is deterministic. The design flagged this as a
   known failure mode — favor the fixture for assertions.
3. **FR-006 / FR-007 are already satisfied** — re-stating because the spec's
   "Forward: tasks" wording implies they are not. Do **not** re-scaffold the plugin or
   re-add the flag; that would be duplicate work. Verify with the existing files.
4. **`echo_inference` returns `params?.text`, not `params?.input`.** The mock's output
   shape is `[{ result: <text> }]` (fake_connectors.ts:72-82). The daybreak YAML passes
   `with: { text: '…' }`, which the connector step renders into the executor `input`.
   Confirm at runtime that `params.text` is populated (the `with:` map flows to
   `withInputs` → executor `input`); if the key differs, adjust the `with:` key to
   `text` to match the stub — it already matches, but this is the one wiring seam to
   watch during the spike.
5. **Condition is KQL, not a free boolean.** `evaluate_condition.ts` evaluates string
   conditions as KQL via `@kbn/eval-kql`. The daybreak guard
   `'steps.fetch_alert_summary.output.total:*'` is a field-exists wildcard. If the
   HTTP step's output omits `output.total` entirely, KQL returns `false` (no error) —
   so the guard is naturally fail-closed for a missing field, which is the desired
   FR-003/FR-006 semantics. (A true fail-closed *on error* is a PD-2 boundary concern,
   not an engine built-in.)
6. **Stale citation.** Any reference to `continuous_extraction_workflow.yaml` in
   downstream specs should be corrected to `continuous_onboarding.yaml` (or the
   `triage.yaml`/`detection.yaml` examples) — the cited file does not exist.
7. **`browser:false`.** The daybreak plugin is server-only; there is no client/public
   bundle. A UI route/panel is PD-4 (out of scope) — don't add public code.

---

## 6. Spike completion checklist (what remains after recon)

- [x] FR-006 — `daybreak/server/workflow/` exists (`alert_analysis_workflow.ts`)
- [x] FR-007 — `daybreak` flag, default off (`common/config.ts`, tested)
- [x] FR-001/002/003/004/005 — workflow YAML exercises the 3 step types in shipped syntax
- [ ] Runner/executor invocation: run the workflow once end-to-end, log each step I/O
      (add inside `DaybreakPlugin.start()` guarded by `this.config.enabled`, OR drive
      via the test fixture only — proposal wants both a runner and a test)
- [ ] `workflow_engine_shape.test.ts` — assert each step type's structured output shape
      (use `WorkflowRunFixture.runWorkflow(getAlertAnalysisWorkflow())` + assert
      `COMPLETED` + per-step `stepExecutionRepositoryMock` entries)
- [ ] `server/workflow/README.md` — document what was validated + engine limitations
      (completion race, fail-closed boundary, `echo_inference` vs real connector swap)

Anchors present for the task gate: `daybreak`, `if_step`, `workflow_run_fixture`,
`executeWorkflow`, `echo_inference`.
