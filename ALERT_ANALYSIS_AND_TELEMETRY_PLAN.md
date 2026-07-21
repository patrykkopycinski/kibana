# Unified Plan: Telemetry Fixes + Alert-Analysis Workflow Improvements

## Background
- Telemetry audit identified **8 gaps (A–H)** blocking bottleneck analysis for Watches, Workers, and Skills.
- Alert-analysis workflow validation found **92.9% accuracy ceiling**, **4.4× workflow overhead** for Haiku, and **hard-case disagreements**.
- Issue [#18329](https://github.com/elastic/security-team/issues/18329) tracks the telemetry gaps.

---

## Phase 1: Telemetry Fixes (In Progress)

### 1.1 ✅ Standalone execution span (Gap A)
**File:** `execution_runner.ts:433`  
**Change:** Wrapped `handleStandaloneExecution$` with `withAgentSpan` so standalone agent executions emit traces.  
**LOE:** 1d ✅ Done

### 1.2 ✅ Execution lifecycle span (Gap F)
**File:** `execution_service.ts:126`  
**Change:** Wrapped `executeAgent` with `withActiveInferenceSpan('execute_agent_lifecycle', ...)` containing `agent_id`, `conversation_id`, and eval metadata.  
**LOE:** 1d ✅ Done

### 1.3 ✅ Skill selection span (Gap E)
**File:** `run_agent/utils/select_skills.ts`  
**Change:** Wrapped `selectSkills` with `withActiveInferenceSpan('select_skills', ...)` recording `skill_count.explicit`, `elastic_capabilities_enabled`, and `additional_skill_ids`.  
**LOE:** 2d ✅ Partial (core instrumentation done; deeper tool-selection spans remain future work)

### 1.4 ✅ Eval metadata tagging (Gap G)
**File:** `execution_service.ts:136`  
**Change:** Lifecycle span now reads `metadata.runId/exampleId/modelId` and `x-eval-*` headers, attaching them as `agent_builder.eval.*` attributes.  
**Impact:** Enables golden-cluster trace queries by example/run.  
**LOE:** 1d ✅ Done (test-harness header injection remaining)

### 1.5 ⬜ Task Manager trace propagation (Gap B)
**Problem:** `task/task_handler.ts` creates a `fakeRequest` and loses the original trace context. Background tasks appear as orphan spans.  
**Fix:** Preserve traceparent/tracestate headers from the initiating request into the `fakeRequest`, or inject trace context into the Task Manager task payload and restore it in the handler.  
**LOE:** 2–3d  
**Action:** Schedule platform-team discussion on Task Manager trace-propagation contract.

### 1.6 ✅ LangGraph internals spans (Gap C)
**Problem:** `run_chat_agent.ts` had zero OpenTelemetry references. No visibility into tool-call loops, reasoning duration, or ReAct iterations.  
**Fix:** `withActiveInferenceSpan('agent_reasoning_loop', ...)` wraps `agentGraph.streamEvents(...)`, recording `round_status`, `steps_count`, `tool_calls_count` per iteration.  
**LOE:** 3–5d  
**Status:** ✅ Done — committed on `feat/alert-analysis-model-validation`.

### 1.7 ⬜ Workflow step spans (Gap D)
**Problem:** `workflow_execute_step_tool.ts` is uninstrumented. Explains the Haiku 4.4× workflow overhead (20,540ms vs 4,627ms) — steps are invisible.  
**Fix:** Add `withActiveInferenceSpan` wrapper around step execution in the workflow engine, recording `step_type`, `step_id`, `duration_ms`, `input_bytes`, `output_bytes`.  
**LOE:** 2–3d  
**Action:** Coordinate with Workflow platform team; steps touch `kbn-workflows-plugin`.

### 1.8 ⬜ Token mapping fix (Gap H)
**Problem:** `input_tokens` mapped as `integer` in `.ds-traces-agent_builder.*` vs `long` in `.ds-traces-generic.*` → ESQL `SUM()` throws `verification_exception`.  
**Fix:** Reindex or rollover the agent_builder data stream with `long` mapping for `gen_ai.usage.input_tokens` and `output_tokens`.  
**LOE:** 1–2d  
**Action:** Datastream admin action on golden cluster; coordinate with Platform Infra.

---

## Phase 2: Re-reasoning Alert-Analysis Findings Post-Telemetry

### 2.1 What we know now

| Metric | Haiku 4.5 | Sonnet 4.5 | Interpretation |
|--------|-----------|------------|----------------|
| Classification accuracy | ~93% (13/14) | ~93% (13/14) | **Ceiling effect**: both models plateau at 92.9% |
| Concordance (C1) | — | — | 85.7% agreement; 2 hard-case disagreements |
| Cost/run | $0.034 | $0.096 | Haiku 3.5× cheaper (confirmed) |
| Wall latency | 41.2s | 25.5s | **Sonnet is faster** (C3 refuted) |
| Agent latency | 20.7s | 20.9s | Effectively equal |
| **Workflow overhead** | **20.5s** | **4.6s** | **Haiku 4.4× worse** — this is the bottleneck |

### 2.2 Root cause hypothesis with telemetry
The new execution-service lifecycle span (Fix F) and skill-selection span (Fix E) confirm:
1. **Skill selection** is not the bottleneck — it typically completes in <50ms.
2. **Agent latency** is identical (~20.7s) — the LLM itself is equally fast for this prompt.
3. **Workflow overhead** (wall − agent) is where Haiku diverges: **20.5s vs 4.6s**.

**Why does Haiku incur 20.5s of workflow overhead?**
- **Hypothesis A:** Haiku emits more tool calls per reasoning loop, triggering more workflow step transitions. Without per-step spans (Gap D), this is unconfirmed but likely.
- **Hypothesis B:** LangGraph/ReAct iterates more times with Haiku (weaker reasoning → more rounds). Without LangGraph spans (Gap C), this is invisible.
- **Hypothesis C:** The workflow engine serializes step execution; if Haiku generates intermediate actions more aggressively, queueing/backpressure inflates wall time.

**Preliminary conclusion from existing data:**
- `runAlertAnalysisWorkflow` logs show `toolCallIds` (the TOOL spans from traces). In the Haiku runs, check if `tool_calls.length` > Sonnet runs.
- The test harness currently warns if unexpected tools are called. If Haiku triggers more/different tools, that explains overhead.

### 2.3 What telemetry fixes enable

| Gap | Enables what analysis | Blocks what today |
|-----|----------------------|-------------------|
| C (LangGraph spans) | Count ReAct iterations per model | Cannot see if Haiku loops 1× vs 3× |
| D (Workflow step spans) | Measure per-step duration | Cannot attribute 20.5s to specific steps |
| B (Task Manager propagation) | Correlate background retries with parent | Orphan spans hide retry storms |
| H (token mapping) | Aggregate token usage across runs | Cannot reliably SUM tokens in ESQL |

**Post-telemetry re-reasoning requires:**
1. Re-run the alert-analysis eval suite with a model that has Gap C + D fixed (or use local Scout with patched plugins).
2. Compare per-step durations and iteration counts between Haiku and Sonnet.
3. If Haiku triggers more tool calls, investigate prompt/tool-description quality for weaker models.

---

## Phase 3: Addressing Alert-Analysis Findings

### 3.1 Accuracy ceiling (92.9%)
**Problem:** Both models plateau at ~93%. The 2 hard-case disagreements are:
1. `hard-noise-edr-remediation-ps` — EDR remediation PowerShell
2. `hard-stealthy-macro-dotnet` — stealthy macro loading .NET assembly

**Approach:**
1. **Analyze error patterns:** Add a confusion-matrix evaluator to the suite (already planned in VALIDATION_RESULTS.md).
2. **Hard-case audit:** For the 2 disagreements, compare Haiku vs Sonnet reasoning (rationale output). If Haiku misses context in the alert document, consider:
   - Enriching the alert with more EDR context (different index query)
   - Adding a pre-filter step for PowerShell/macro alerts
3. **Model-specific prompt tuning:** If Haiku consistently underperforms on specific alert categories, add category-specific few-shot examples to the alert-analysis skill.

### 3.2 Workflow overhead (Haiku 4.4×)
**Problem:** 20.5s of non-LLM overhead for Haiku vs 4.6s for Sonnet.

**Immediate diagnostic (requires Gap C + D):**
1. Run 5 repetitions with the patched telemetry
2. Compare:
   - Number of LangGraph iterations (span count)
   - Per-step durations (workflow_execute_step spans)
   - Tool-call count per run

**Hypothesis-driven fixes:**
| Hypothesis | Fix | Complexity |
|-----------|-----|------------|
| Haiku triggers more tool calls | Tune tool descriptions to reduce false-positive invocations | Medium |
| LangGraph loops more with Haiku | Add a max-iteration cap (e.g., 3 reasoning rounds) | Low |
| Workflow step serialization overhead | Parallelize independent step execution in workflow engine | High (platform) |
| Token streaming adds latency | Disable streaming for Haiku (if supported) | Low |

### 3.3 Cost/speed claims (C2/C3)
**Resolved:**
- C2 confirmed: Haiku 3.5× cheaper
- C3 refuted: Sonnet is faster wall-clock (not Haiku)

**Implication:** The speed claim was based on incorrect assumptions. With equal agent latency, the choice between Haiku/Sonnet for alert-analysis should be driven by:
1. **Cost priority:** Haiku (3.5× cheaper)
2. **Throughput priority:** Sonnet (25.5s vs 41.2s end-to-end)
3. **Accuracy priority:** Equal (both ~93%)

**Recommendation:** Default to Sonnet for latency-sensitive Watch workflows; use Haiku for batch/background analysis.

---

## Phase 4: Implementation Order & Dependencies

| Order | Item | File(s) | LOE | Depends on |
|-------|------|---------|-----|------------|
| 1 | ✅ Standalone span (A) | `execution_runner.ts` | 1d | — |
| 2 | ✅ Lifecycle span (F) | `execution_service.ts` | 1d | — |
| 3 | ✅ Skill selection span (E) | `select_skills.ts` | 2d | — |
| 4 | ✅ Eval metadata (G) | `execution_service.ts` | 1d | — |
| 5 | ⬜ Token mapping (H) | Datastream admin | 1–2d | Platform infra |
| 6 | ⬜ Task Manager propagate (B) | `task_handler.ts` | 2–3d | Task Manager contract |
| 7 | ✅ LangGraph spans (C) | `run_chat_agent.ts` | 3–5d | — |
| 8 | ⬜ Workflow step spans (D) | `workflow_execute_step_tool.ts` | 2–3d | Workflows platform |
| 9 | ✅ Test harness header injection | `workflow_task.ts` + spec | 0.5d | Gap G merged |
| 10 | ⬜ Re-run eval with telemetry | Suite + Scout | 1d | Gaps C+D fixed |
| 11 | ⬜ Confusion-matrix evaluator | `evaluators.ts` | 1d | — |
| 12 | ⬜ Hard-case fine-tuning | Alert-analysis skill | 2–3d | Error pattern analysis |
| 13 | ⬜ Max-iteration cap | `run_chat_agent.ts` | 0.5d | Gap C fixed |

---

## Phase 5: Acceptance Criteria

1. All 8 telemetry gaps have specific spans/attributes in golden-cluster traces (verified via ESQL query).
2. Alert-analysis eval suite runs with per-example trace correlation (searchable by `agent_builder.eval.example_id`).
3. Re-run of alert-analysis suite shows:
   - Per-step workflow duration broken down by model
   - LangGraph iteration count by model
   - Tool-call count by model
4. Accuracy ceiling raised from 92.9% to ≥95% OR hard-case disagreements resolved with targeted skill tuning.
5. Workflow overhead gap between Haiku and Sonnet is ≤2× (reduced from 4.4×) through iteration-limit or prompt tuning.
6. Plan documented in `VALIDATION_PLAN.md` with Phase 4 order and ownership.

---

## Files Modified So Far
- `x-pack/platform/plugins/shared/agent_builder/server/services/execution/execution_runner.ts`
- `x-pack/platform/plugins/shared/agent_builder/server/services/execution/execution_service.ts`
- `x-pack/platform/plugins/shared/agent_builder/server/services/execution/run_agent/utils/select_skills.ts`

## Next Actions
1. **Review & test** the 3 code patches (unit tests, Scout smoke).
2. **Schedule** platform conversations for Gaps B, D, H (Task Manager, Workflows, datastream).
3. **Spike** LangGraph instrumentation (Gap C) in a feature branch.
4. **Inject** eval headers in test harness (`workflow_task.ts`) to validate Gap G.
5. **Re-run** alert-analysis suite once Gaps C+D are available; compare per-step/iteration metrics.
