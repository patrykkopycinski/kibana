# Reconnaissance — Daybreak S1 / PD-3 Eval Harness

> Recon for plan **daybreak-s1-pd3-eval-harness**. Scope: document the exact
> `@kbn/evals` dataset/scorer primitives to use for the **offline dataset gate**
> (FR-8), and determine whether the workflow engine exposes **step-level
> retry/backoff config for `ai.agent` steps** (A-4). This document is exploration
> only — no source files were modified. All anchors re-verified against disk on
> this pass.
>
> FR map: FR-8 (offline dataset gate: golden dataset → worker → Proposal scorer).
> A-4 (does the engine expose step-level retry/backoff for `ai.agent`?).
>
> **NOTE:** This recon supersedes the prior `.ao/recon.md`, which documented the
> *PD-1* workflow-engine-shape spike (a different plan). The prior plan's
> deliverables (plugin scaffold, spike workflow, integration test, README) are
> **already merged on this branch** and are treated as given inputs here.

---

## 0. Headline findings

### FR-8 — the offline gate is a CODE-evaluator over an inline dataset; no new framework needed

The `@kbn/evals` framework (`x-pack/platform/packages/shared/kbn-evals/`) already
ships every primitive FR-8 needs:

| FR-8 requirement | `@kbn/evals` primitive | Location |
|---|---|---|
| "Loads a golden dataset of alert evidence → expected Proposal shape" | `EvaluationDataset<TExample>` + `Example<I, O, M>` | `src/types.ts:22-58` |
| "Runs each row through the worker's reasoning logic" | `ExperimentTask<TExample, TTaskOutput>` passed to `executorClient.runExperiment({ datasets, task })` | `src/types.ts:126-167` |
| "Scores the actual Proposal against the expected shape" | `Evaluator<TExample, TTaskOutput>` (`kind: 'CODE'`, returns `score ∈ {0,1}`) | `src/types.ts:105-112` |
| "Passes if all non-broken rows match; fails if the broken row does NOT fail" | A CODE evaluator keyed off `metadata.broken` + an assertion over `DatasetRunResult` | (convention — see §3) |

The gate is a **deterministic CODE evaluator** (inline `{ name, kind: 'CODE', evaluate }`),
not an LLM-as-a-judge evaluator. The built-in `createQuantitativeCorrectnessEvaluators`
is LLM-kind and is overkill for a shape-matching gate — but it is the right reference
for how evaluators read `output`/`expected`/`metadata`. **No new package or framework
abstraction is required.** This satisfies the anti-overengineering gate: the consumers
(dataset rows, task, evaluator) all exist as shipped primitives.

### A-4 — YES, the engine exposes step-level retry/backoff for `ai.agent` (via generic step props, not the ai.agent config schema)

The `ai.agent` step's own `ConfigSchema`
(`agent_builder/common/step_types/run_agent_step.ts:129-205`) does **not** define
retry/backoff. But every connector-type step — including `ai.agent` — inherits the
**generic step-level properties** from `BaseConnectorStepSchema`
(`kbn-workflows/spec/schema.ts:223-231`), which merges:

- `timeout: DurationSchema` (e.g. `'600s'`) — already used by the daybreak worker
  (`alert_analysis_worker.yaml:63`)
- `on-failure.retry` → `WorkflowRetrySchema` (`schema.ts:36-51`): `max-attempts`,
  `condition`, `delay`, `strategy` (`'fixed' | 'exponential'`), `multiplier`,
  `max-delay`, `jitter`
- `on-failure.fallback` (array of fallback steps)
- `on-failure.continue` (boolean / Liquid expression)

This is **fully wired into the engine runtime**, not just schema: the graph builder
compiles `on-failure.retry` into `enter-retry` / `exit-retry` graph nodes
(`kbn-workflows/graph/types/nodes/on_failure_nodes.ts:30-43`), and step-level
`on-failure` overrides workflow-level `on-failure`
(`on_failure_graph.test.ts:90`). So the daybreak worker can add retry/backoff to
the `ai.agent` Reason phase **declaratively in YAML, with no engine changes**.

---

## 1. Architecture Overview

### 1.1 The @kbn/evals framework (FR-8 surface)

```
@kbn/evals (x-pack/platform/packages/shared/kbn-evals)
  │
  ├── index.ts                         # public barrel — all exports below
  ├── src/
  │   ├── evaluate.ts                  # `evaluate` = Playwright test.extend<{}, EvaluationSpecificWorkerFixtures>
  │   ├── types.ts                     # data model: Example, EvaluationDataset, Evaluator, runExperiment contract
  │   ├── evaluators/
  │   │   ├── correctness/             # LLM-judge correctness (Factuality / Relevance / Sequence Accuracy)
  │   │   ├── criteria/                # LLM-judge against free-text criteria
  │   │   ├── groundedness/            # LLM-judge grounding
  │   │   ├── rag/                     # Precision@K / Recall@K / F1@K
  │   │   ├── esql/                    # ES|QL equivalence
  │   │   ├── trace_based/             # OTel-trace-native evaluators (latency, tokens, tool calls)
  │   │   └── ...
  │   ├── kibana_evals_executor/       # in-Kibana executor client (KibanaEvalsClient)
  │   ├── utils/
  │   │   ├── retry_utils.ts           # `withRetry` — exponential backoff for test-call sites
  │   │   ├── evals_client.ts          # scores/datasets CRUD against the evals plugin
  │   │   └── ...
  │   └── config/create_playwright_eval_config.ts
  └── README.md                        # authoring guide + entry-point reference
```

**Boundary split (vision §5.2.3):** `@kbn/evals` owns framework primitives
(evaluator contracts, trace-based evaluators, data model, persistence, reporting,
CLI). **Solution suites** (separate `kbn-evals-suite-<name>` packages) own the
datasets, tasks, and solution-specific evaluators. The daybreak offline gate is a
**solution-suite concern** — it consumes `@kbn/evals` primitives, it does not
modify them.

**Data flow for a single experiment (the offline gate):**

```
Solution suite spec (Playwright test)
  │  builds an inline EvaluationDataset<{ input: AlertEvidence, output: ProposalProperties, metadata: { broken?: boolean } }>
  │  defines task: (example) => runWorker(example.input) → ProposalProperties   ← the worker's reasoning logic
  │  defines evaluator: { kind:'CODE', evaluate: ({ output, expected, metadata }) => score ∈ {0,1} }
  ▼
executorClient.runExperiment({ datasets:[dataset], task }, [evaluator])
  │  for each example:  task(example) → output ;  evaluator({ input, output, expected, metadata }) → result
  ▼
DatasetRunResult[]  ←  runs (per example) + evaluationRuns (per evaluator per example)
  │
  ▼  suite-level assertion: every non-broken row score==1 AND the broken row score==0
PASS / FAIL
```

### 1.2 The workflow engine retry surface (A-4)

```
WorkflowSchema (kbn-workflows/spec/schema.ts)
  │
  ├── BaseConnectorStepSchema (schema.ts:223-231)   ← ai.agent extends this shape
  │     ├── timeout: DurationSchema                 ← already used by daybreak (600s)
  │     ├── if / foreach                            ← flow control
  │     └── on-failure: WorkflowOnFailureSchema
  │           ├── retry: WorkflowRetrySchema        ← max-attempts, strategy, delay, multiplier, jitter, condition
  │           ├── fallback: BaseStepSchema[]        ← run alternative steps
  │           └── continue: boolean | Liquid        ← swallow-and-continue
  │
  └── (compiled by) build_execution_graph
        └── enter-retry / exit-retry graph nodes    ← runtime wiring (on_failure_nodes.ts)
```

---

## 2. Relevant Code Locations

### 2.1 The @kbn/evals data model (FR-8 primitives — the exact API to use)

| Symbol | File:Lines | Signature / Notes |
|---|---|---|
| `Example<I,O,M>` | `kbn-evals/src/types.ts:36-58` | `{ id?, input?: I, output?: O (expected/ground-truth), metadata?: M \| null }`. `output` is the **expected** value. All three are `Record<string,unknown>`-ish. |
| `EvaluationDataset<TExample>` | `kbn-evals/src/types.ts:22-27` | `{ name: string; description: string; examples: TExample[]; id?: undefined }`. Inline datasets have `id: undefined`. |
| `TaskOutput` | `kbn-evals/src/types.ts:34` | `unknown` — the worker's actual output type (the Proposal). |
| `ExperimentTask<TExample, TTaskOutput>` | `kbn-evals/src/types.ts:126-128` | `(example: TExample) => Promise<TTaskOutput>` — runs the worker's reasoning logic per row. |
| `EvaluatorParams<TExample, TTaskOutput>` | `kbn-evals/src/types.ts:60-65` | `{ input, output (actual), expected (from example.output), metadata }` — what the evaluator callback receives. |
| `EvaluationResult` | `kbn-evals/src/types.ts:79-86` | `{ score?: number\|null, label?, explanation?, reasoning?, details?, metadata? }` — evaluator return shape. `score` may be `null` for "unavailable". |
| `Evaluator<TExample, TTaskOutput>` | `kbn-evals/src/types.ts:105-112` | `{ name: string; kind: 'LLM' \| 'CODE'; evaluate: EvaluatorCallback }` — the core evaluator interface. |
| `EvalsExecutorClient.runExperiment` | `kbn-evals/src/types.ts:135-167` | `({ datasets, task, metadata?, concurrency?, trustUpstreamDataset? }, evaluators) => Promise<DatasetRunResult[]>` |
| `DatasetRunResult` | `kbn-evals/src/types.ts:191-200` | `{ id, experimentName, datasetId, datasetName, runs: Record<string,TaskRun>, evaluationRuns: EvaluationRun[] }` — what to assert over. |
| `TaskRun` | `kbn-evals/src/types.ts:173-181` | `{ exampleIndex, repetition, input, expected, metadata, output, traceId? }` — per-example actual output. |
| `EvaluationRun` | `kbn-evals/src/types.ts:183-189` | `{ name (evaluator name), result?: EvaluationResult, experimentRunId, traceId?, exampleId? }` — per-evaluator-per-example result. |

### 2.2 The `evaluate` fixture + runner wiring

| File:Lines | Notes |
|---|---|
| `kbn-evals/src/evaluate.ts:88-465` | `evaluate = base.extend<{}, EvaluationSpecificWorkerFixtures>(...)`. Wires `inferenceClient`, `executorClient` (a `KibanaEvalsClient`), `evalsClient`, `evaluators` (the `DefaultEvaluators` factory bag), `reportModelScore`, `traceEsClient`. All worker-scoped. |
| `kbn-evals/src/kibana_evals_executor/client.ts` | `KibanaEvalsClient` — the default `executorClient` impl. Persists scores via `onEvaluationComplete`. |
| `kbn-evals/index.ts:68` | `export { evaluate } from './src/evaluate'` — the public entry. |
| `kbn-evals/index.ts:79-91` | Public re-exports of `Example`, `TaskOutput`, `ExperimentTask`, `Evaluator`, `EvaluationResult`, `DatasetRunResult`, `EvalsExecutorClient`, `EvaluationDataset`. |

### 2.3 Built-in evaluator factories (reference, not necessarily to use)

| Factory | File | Kind | Relevance to FR-8 |
|---|---|---|---|
| `createQuantitativeCorrectnessEvaluators` | `evaluators/correctness/index.ts:126-173` | LLM | Reference only — LLM-judge, returns Factuality/Relevance/Sequence scores. Overkill for a shape gate. Shows the `quantitativeEvaluator(name, scoreCalculator, summaryKey)` pattern. |
| `createCriteriaEvaluator` (via `evaluators.criteria`) | `evaluators/criteria/` | LLM | Free-text criteria judge. Could be used if the gate wanted fuzzy matching, but FR-8 wants exact-shape scoring. |
| inline CODE evaluator | (convention — README §"Writing evaluation tests") | CODE | **The FR-8 primitive.** `{ name, kind: 'CODE', evaluate: async ({ output, expected, metadata }) => ({ score: ... ? 1 : 0 }) }`. See `kbn-evals/README.md:300-310` for the canonical example. |
| `withRetry` | `utils/retry_utils.ts:139-175` | util | Exponential-backoff retry for **test-call sites** (not the worker). Retries on 429, 502/503/504, ECONNRESET, etc. Useful inside the `task` if the worker endpoint is flaky. |

### 2.4 The Proposal shape (what the gate scores against)

`x-pack/solutions/security/plugins/daybreak/server/client/proposals/types.ts:34-51`:

```ts
export interface ProposalProperties {
  id: string;
  title: string;
  sourceWatch?: string;
  capability: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  status: ProposalStatus; // 'new'|'needs-evidence'|'approved'|'modified'|'dismissed'|'escalated'|'deferred'
  owner?: string;
  createdAt: string;
  recommendation?: string;
  evidenceRefs: string[];
  expectedImpact?: string;
  riskCaveats?: string[];
  approvalRequirement?: 'manual' | 'automatic';
  decisionHistory: DecisionHistoryEntry[];
  space?: string;
}
```

This is the **expected output type** for each dataset row. The worker's reasoning
logic (the `task`) must produce an object conforming to this shape; the CODE
evaluator compares the actual against `example.output`.

### 2.5 The daybreak worker (the system under test)

| File | Notes |
|---|---|
| `daybreak/server/workflow/alert_analysis_worker.yaml` | 5-phase worker: Setup → Guard(enabled) → Guard(dedup) → Enrich → Reason(`ai.agent`, `timeout: 600s`) → validate_reasoning → Act(POST `/internal/daybreak/proposals`). |
| `daybreak/server/workflow/run_alert_analysis_worker.ts` | `runAlertAnalysisWorker({ executeWorkflow, logger, request })` — the engine entry. `getAlertAnalysisWorkerWorkflow()` parses YAML via `WorkflowSchema.parse`. |
| `daybreak/server/workflow/output_validation_guard.ts` | `validateReasonOutput()` + `ReasonStructuredOutput` (`{ verdict, confidence, rationale }`) + `WorkflowHaltError`. This is the **in-workshop** shape gate (PD-2 deliverable). The offline eval gate (PD-3) is a **separate, dataset-driven** gate over the full `ProposalProperties`, not over `ReasonStructuredOutput`. |
| `daybreak/server/client/proposals/client.ts` | `ProposalClient` — CRUD over `.daybreak-proposals` index. The `task` in the eval would either call the worker end-to-end or call `ProposalClient.create` with the worker's output. |
| `daybreak/server/integration_tests/alert_analysis_worker.test.ts` | Existing PD-2 integration test (WorkflowRunFixture-based). The PD-3 eval gate is a **separate suite package**, not an addition to this file. |

### 2.6 Workflow retry/backoff schema (A-4 — the exact config surface)

`src/platform/packages/shared/kbn-workflows/spec/schema.ts`:

| Symbol | Lines | Fields |
|---|---|---|
| `DurationSchema` | 21 | `z.string().regex(/^\d+(ms\|[smhdw])$/)` — `'5s'`, `'1m'`, `'600s'`. |
| `WorkflowRetrySchema` | 36-51 | `max-attempts` (min 1), `condition?` (Liquid string), `delay?` (Duration), `strategy?` (`'fixed'\|'exponential'`), `multiplier?` (min 1, default 2), `max-delay?` (Duration), `jitter?` (boolean, default false). |
| `WorkflowOnFailureSchema` | 62-66 | `{ retry?: WorkflowRetrySchema, fallback?: BaseStepSchema[], continue?: boolean\|string }`. |
| `TimeoutPropSchema` | 177-179 | `{ timeout?: DurationSchema }`. |
| `StepWithOnFailureSchema` | 219-221 | `{ 'on-failure'?: WorkflowOnFailureSchema }`. |
| `BaseConnectorStepSchema` | 223-231 | `BaseStepSchema` + `with` + `if` + `foreach` + `timeout` + `on-failure`. **`ai.agent` conforms to this shape.** |
| `BuiltInStepProperties` | 233-245 | The allowlist: `name, type, with, if, foreach, timeout, max-step-size, on-failure, max-iterations, iteration-timeout, iteration-on-failure`. |

### 2.7 Workflow retry runtime wiring (A-4 — proof it executes)

| File | Lines | Notes |
|---|---|---|
| `kbn-workflows/graph/types/nodes/on_failure_nodes.ts` | 30-43 | `EnterRetryNodeSchema` (`type: 'enter-retry'`) + `ExitRetryNodeSchema` (`type: 'exit-retry'`) — the graph nodes that the retry config compiles into. |
| `kbn-workflows/graph/types/guards.ts` | 109-113 | `isEnterRetry` / `isExitRetry` type guards. |
| `kbn-workflows/graph/build_execution_graph/tests/on_failure_graph.test.ts` | 90, 142-235 | "step level on-failure should override workflow level on-failure"; "should have correct topological order for step with retry"; "should configure retry node correctly". **Proves step-level retry compiles + executes.** |
| `kbn-workflows/graph/build_execution_graph/tests/loop_step_graph.test.ts` | 195-235 | `foreach` with `iteration-on-failure: { retry: { 'max-attempts': 3 } }`. |
| `kbn-workflows/graph/build_execution_graph/tests/parallel_step_graph.test.ts` | 260-280 | `on-failure: { retry: { 'max-attempts': 2, delay: '3s' }, continue: true }` — shows fixed-delay retry in a parallel branch. |
| `agent_builder_workflows/server/attachment_types/workflow_yaml_attachment.ts` | 161 | Generated YAML includes `retry:` under `on-failure` — confirms the pattern is in active use for AI workflow authoring. |

### 2.8 The `ai.agent` step schema (A-4 — what it does NOT define)

`x-pack/platform/plugins/shared/agent_builder/common/step_types/run_agent_step.ts`:

- `ConfigSchema` (129-205): only `agent-id`, `connector-id`, `inference-id`,
  `create-conversation`, `plugin-id`, `aggregate-by`. **No retry/backoff fields.**
- `InputSchema` (26-77): `schema`, `message`, `attachments`, `conversation_id`.
- `OutputSchema` (82-117): `message`, `structured_output` (when `schema` given),
  `conversation_id`, `metadata.usage` (tokens).
- The retry/backoff config comes from the **generic** `BaseConnectorStepSchema`
  merge, not from this file. This is the key A-4 clarification.

---

## 3. Existing Patterns

1. **Inline CODE evaluator for deterministic pass/fail gates** — the README's
   canonical example (`kbn-evals/README.md:300-310`):
   ```ts
   {
     name: 'equals',
     kind: 'CODE',
     evaluate: async ({ output, expected }) => ({
       score: output?.content === expected?.content ? 1 : 0,
       metadata: { output: output?.content, expected: expected?.content },
     }),
   }
   ```
   This is exactly the FR-8 shape: compare actual `Proposal` against expected
   shape, score ∈ {0,1}. The alert-triage suite's `attachmentReadCompliance`
   (`kbn-evals-suite-security-alert-triage/src/evaluators.ts:17-37`) is a
   real-world CODE evaluator that reads `metadata.expectedAttachmentReads` and
   returns `Math.min(1, readCalls.length / expected)` — the same "metadata-driven
   threshold" pattern the broken-row gate needs.

2. **Suite package layout** — each eval suite is its own `kbn-evals-suite-<name>`
   package: `playwright.config.ts` (uses `createPlaywrightEvalsConfig`), `evals/`
   (spec files), `src/` (task, evaluate re-export, evaluators, datasets), `package.json`,
   `kibana.jsonc`, `moon.yml`. There is **no** `kbn-evals-suite-daybreak` package
   yet — it must be scaffolded. The `evals-create-suite` skill
   (`.agents/skills/evals-create-suite/SKILL.md`) automates this; register in
   `.buildkite/pipelines/evals/evals.suites.json` for CI.

3. **Dataset-as-inline-object pattern** — datasets are passed inline to
   `runExperiment({ datasets: [...] })`, not loaded from a snapshot unless the
   suite needs real ES data. The alert-triage suite indexes synthetic alerts in
   `beforeAll` (`alert_triage_quality.spec.ts:148-171`) and cleans up in
   `afterAll` (173-181). The daybreak gate's golden dataset is **alert evidence →
   expected Proposal**, so rows can be inline objects (no snapshot loader needed
   for the gate itself).

4. **`task` = the worker call** — in the alert-triage suite, `task` calls
   `callConverse` (a thin `fetch('/api/agent_builder/converse')` wrapper). For
   daybreak, `task` would call the worker's reasoning logic — either
   `runAlertAnalysisWorker` end-to-end (needs a request + engine context) or a
   thinner direct call to the Reason-phase reasoning. The alert-triage precedent
   favors a thin HTTP task that exercises the real shipped path.

5. **Metadata-driven row tagging** — `Example.metadata` carries scenario-specific
   flags. FR-8's "broken row" is `metadata: { broken: true }`; the evaluator and
   the post-run assertion branch on it. This matches the alert-triage pattern of
   `metadata.expectedAttachmentReads` driving the CODE evaluator.

6. **`selectEvaluators` for runtime filtering** — `selectEvaluators([...])`
   (`kbn-evals/index.ts:135`) + `SELECTED_EVALUATORS` env var lets CI opt into a
   subset. The daybreak gate's evaluator should be selectable the same way.

---

## 4. Integration Points

1. **New suite package `kbn-evals-suite-daybreak`** (to scaffold) — consumes
   `@kbn/evals` primitives only; does not modify them. Lives under
   `x-pack/solutions/security/packages/` (security domain). The `task` calls the
   daybreak worker via HTTP (`/internal/daybreak/...`) or imports the worker's
   reasoning function directly if a hermetic in-process call is feasible.

2. **The golden dataset** — `EvaluationDataset<DaybreakExample>` where
   `DaybreakExample = Example<{ alertEvidence: ... }, ProposalProperties, { broken?: boolean; description?: string }>`.
   The `output` field is the expected `ProposalProperties` (full or subset
   depending on how strict the gate is). One row tagged `broken: true` whose
   expected shape is intentionally wrong / malformed.

3. **The CODE evaluator** — `{ name: 'ProposalShapeMatch', kind: 'CODE', evaluate }`
   compares the actual `ProposalProperties` (from the task) against
   `expected` (from the row). Returns `score: shapeMatches ? 1 : 0`. For the
   broken row, the evaluator should return `0` (the worker is expected to fail to
   produce a valid Proposal — the `validateReasonOutput` guard halts the
   workflow).

4. **The pass/fail assertion** — after `runExperiment`, assert over
   `DatasetRunResult[]`: for every row where `metadata.broken !== true`, the
   evaluator `score === 1`; for the broken row, `score === 0` (or the task itself
   threw / the Proposal was not emitted). This is a suite-level `expect`, not an
   evaluator concern.

5. **Worker retry/backoff wiring (A-4 → FR follow-on)** — to add retry/backoff
   to the `ai.agent` Reason step, edit `alert_analysis_worker.yaml`:
   ```yaml
   - name: reason
     type: ai.agent
     agent-id: daybreak-alert-analysis-agent
     timeout: 600s
     on-failure:
       retry:
         max-attempts: 3
         strategy: exponential
         delay: 5s
         multiplier: 2
         max-delay: 2m
         jitter: true
         condition: "${{ error.type == 'http_error' }}"
       continue: false   # fail-closed: do NOT emit a Proposal on retry exhaustion
     with: { ... }
   ```
   No engine or plugin changes required — this is pure YAML. The `on-failure` +
   `continue: false` gives the fail-closed boundary that PD-1 flagged as
   missing (README §"Engine limitations" #3).

6. **Suite registration** — add to
   `.buildkite/pipelines/evals/evals.suites.json` for CI label-triggered runs
   (`evals:daybreak` + `models:<group>`). Local runs via
   `node scripts/evals start --suite daybreak`.

---

## 5. Constraints & Gotchas

1. **`evaluate` requires a live stack + evals plugin.** The `evaluate` fixture
   (`evaluate.ts:88`) extends `@kbn/scout`'s base and spins up connectors,
   inference clients, and the `KibanaEvalsClient` (which calls
   `evalsClient.assertPluginEnabled()` at `evaluate.ts:100`). The offline gate
   **cannot run hermetically in-process** like the PD-1
   `WorkflowRunFixture`-based test — it needs Scout + EDOT + a connector. This is
   a heavier smoke requirement than the PD-1/PD-2 integration tests. The
   "mandatory smoke test" instruction in the task applies to the **later
   implementation tasks**, not this recon task.

2. **`Example.output` is the *expected* value, not the task's output.** The
   naming is easy to misread: `output` on the dataset row is the ground truth;
   the task's actual output is delivered to the evaluator as the `output` param.
   Confirmed at `types.ts:60-65` (`EvaluatorParams`).

3. **`score` may be `null`.** `EvaluationResult.score` is `number | null | undefined`
   (`types.ts:80`). CODE evaluators should return an explicit `0` or `1` (number),
   never `null`, so the suite assertion can use strict equality. LLM evaluators
   use `null` for "unavailable". The alert-triage `attachmentReadCompliance`
   always returns a number — follow that.

4. **The `ai.agent` `timeout` is already present but `on-failure` is not.** The
   shipped worker YAML (`alert_analysis_worker.yaml:56-63`) sets `timeout: 600s`
   on the Reason step but has **no `on-failure`**. Adding retry is a one-block YAML
   edit (see §4.5), but it changes runtime behavior (retries delay failure) —
   gate it behind a separate concern from the eval harness itself.

5. **`on-failure` inside flow-control steps is restricted.**
   `parallel_step_graph.test.ts:260-280` shows `on-failure` inside a parallel
   branch body is rejected (`unsupported flow-control|on-failure`). The daybreak
   Reason step is nested inside two `if` guards (`guard_enabled` → `guard`), but
   `on-failure` on a connector step **inside an `if` branch is allowed** (the
   restriction is on `on-failure` on the `if`/`foreach`/`parallel` step itself,
   not on children). Verify by checking `build_execution_graph` handling of
   nested connector steps — the `on_failure_graph.test.ts:559` ("should not set
   workflow level on-failure for steps inside fallback") implies children can
   carry their own `on-failure`.

6. **Two distinct "validation" surfaces — do not conflate.** PD-2's
   `output_validation_guard.ts` validates the **Reason-phase structured output**
   (`ReasonStructuredOutput`: verdict/confidence/rationale) inside the workflow.
   PD-3's offline gate validates the **final Proposal document**
   (`ProposalProperties`) against a golden dataset. They are different shapes at
   different points in the pipeline. The eval `task` should exercise the full
   pipeline (Enrich → Reason → validate → Act → Proposal), not just the Reason
   phase, so the gate covers the end-to-end Proposal shape.

7. **Broken-row semantics: "fails if the broken row does NOT fail."** This means
   the gate has an **inverted expectation** for the broken row: the worker is
   *expected* to fail (the `validateReasonOutput` guard throws `WorkflowHaltError`,
   so no Proposal is emitted). The evaluator/task must distinguish "Proposal not
   emitted (expected for broken row)" from "Proposal emitted but wrong shape
   (failure for non-broken rows)". Encode this in `metadata.broken` and branch in
   both the task (catch the halt) and the assertion.

8. **`withRetry` is for test call-sites, not the worker.** `utils/retry_utils.ts`
   retries on 429/5xx/network errors at the **eval harness** level (e.g. retrying
   a flaky `kbnClient.request`). It is separate from the workflow engine's
   `on-failure.retry` (which retries the step inside the engine). Do not confuse
   the two when implementing the gate.

9. **SCS (semantic code search) is down.** The prompt notes the SCS ES endpoint
   is unreachable (`getaddrinfo ENOTFOUND`). This recon was done with
   Grep/Glob/Read only — no semantic search was available. All anchors are
   disk-verified.

---

## 6. Answers to the two research questions

### FR-8: exact @kbn/evals API for the offline gate

```ts
import { evaluate, selectEvaluators, type Example, type EvaluationDataset } from '@kbn/evals';

type DaybreakExample = Example<
  { alertEvidence: AlertEvidence },        // input
  Partial<ProposalProperties>,             // output = EXPECTED Proposal shape (ground truth)
  { broken?: boolean; description?: string } // metadata
>;

// 1. The dataset (golden rows)
const dataset: EvaluationDataset<DaybreakExample> = {
  name: 'daybreak-alert-analysis-proposal-shape',
  description: 'Golden alert-evidence → expected Proposal shape. Includes one broken row.',
  examples: [
    { input: { alertEvidence: {...} }, output: { capability: '...', severity: 'high', ... }, metadata: { description: 'nominal' } },
    // ...
    { input: { alertEvidence: {...malformed...} }, output: {}, metadata: { broken: true, description: 'broken — worker must NOT emit a Proposal' } },
  ],
};

// 2. The task = run the worker's reasoning logic per row
const task: ExperimentTask<DaybreakExample, ProposalProperties | null> = async (example) => {
  // call the worker (HTTP or in-process); return the emitted Proposal or null if it halted
};

// 3. The scorer = CODE evaluator comparing actual vs expected Proposal shape
const proposalShapeEvaluator: Evaluator<DaybreakExample, ProposalProperties | null> = {
  name: 'ProposalShapeMatch',
  kind: 'CODE',
  evaluate: async ({ output, expected, metadata }) => {
    if (metadata?.broken) {
      // broken row: pass (score 1) when NO valid Proposal was emitted
      return { score: output == null ? 1 : 0, metadata: { broken: true, emitted: output != null } };
    }
    // nominal row: score 1 when the emitted Proposal matches the expected shape
    return { score: shapeMatches(output, expected) ? 1 : 0, metadata: { output, expected } };
  },
};

// 4. Run + assert
await executorClient.runExperiment({ datasets: [dataset], task }, selectEvaluators([proposalShapeEvaluator]));
// then assert over the returned DatasetRunResult[]: all nominal scores == 1, broken score == 1
```

Key types: `Example` (`types.ts:36`), `EvaluationDataset` (`types.ts:22`),
`ExperimentTask` (`types.ts:126`), `Evaluator` (`types.ts:105`),
`EvalsExecutorClient.runExperiment` (`types.ts:135`),
`DatasetRunResult` (`types.ts:191`). All exported from `@kbn/evals` (`index.ts`).

### A-4: does the engine expose step-level retry/backoff for ai.agent?

**Yes — via the generic `BaseConnectorStepSchema` properties (`timeout`,
`on-failure.retry`), not via the `ai.agent`-specific `ConfigSchema`.** The
`WorkflowRetrySchema` (`schema.ts:36-51`) supports `max-attempts`, `condition`,
`delay`, `strategy` (`fixed`/`exponential`), `multiplier`, `max-delay`, and
`jitter`. It is compiled into `enter-retry`/`exit-retry` graph nodes and executes
at runtime (proven by `on_failure_graph.test.ts`). Step-level `on-failure`
overrides workflow-level. Adding retry to the daybreak Reason step is a
declarative YAML edit with no engine/plugin changes.
