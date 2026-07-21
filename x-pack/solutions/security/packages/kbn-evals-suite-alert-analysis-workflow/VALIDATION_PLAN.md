# Alert Analysis — Model Comparison Validation Plan

Validates the claims in the "Alert Analysis Slides" deck (Haiku vs Sonnet on
the managed `system-security-alert-analysis` workflow).

Branch: `feat/alert-analysis-model-validation`
Suite:  `kbn-evals-suite-alert-analysis-workflow`

## Source report — what it claimed

| # | Claim | Type |
|---|-------|------|
| C1 | Haiku & Sonnet agreed on all 35 alerts | Concordance |
| C2 | Haiku ~3x cheaper | Cost |
| C3 | Haiku ~2x faster | Latency |
| C4 | Sample = 35 "mostly easy" alerts from rules firing 1-100 each | Sampling |
| C5 | No default model until hard-case evals run | Recommendation |
| C6 | Product should surface cost/alert & cost/month per model | Product gap |

Report method (as run): main branch, manual — query rules producing 1-100
alerts, eyeball workflow executions + token output, single pass per model, no
ground truth, no repetitions.

## Key constraints discovered

1. The real 35 alerts are UNRECOVERABLE — this deck was not produced by us,
   and the PDF baked the data into unreadable images. We therefore validate
   on the suite's synthetic labeled alerts and treat the report's numbers as
   claims to re-derive on an equivalent labeled set, not data to reconstruct.
2. The managed workflow (`system-security-alert-analysis`) and this suite are
   NOT on `origin/main` yet — they live only on this branch line.
3. The suite intentionally omits token/latency capture for v1
   (`alert_analysis_classification.spec.ts` lines 37-38). C2/C3 cannot be
   reproduced by the suite as-is — that is the core Phase 1 patch.

## What the suite already gives us (do NOT rebuild)

| Plan need | Already present |
|-----------|-----------------|
| Ground-truth labels | `ALERT_ANALYSIS_EVAL_ALERTS[].expected` (Tier 1/2 = TP, Tier 3/4 = FP) |
| Accuracy vs label | `ClassificationAccuracy` evaluator (`src/evaluators.ts`) |
| Model A/B switch | `configureAlertAnalysisWorkflow({ connectorId })` in `beforeAll` — run suite once per connector |
| Run-to-run variance | `--repetitions N` (unique alert/rule/entity ids per run) |
| Zero-tool guardrail | `trajectory` evaluator |
| Rationale grounding | `RationaleQuality` LLM criteria |

## Phase 1 — Re-derive the numbers (reproduce before critiquing)

Invocation (once per model connector):

    node scripts/evals run --suite security-alert-analysis-workflow

- C1 (agreement): run both models over the labeled set, build a verdict-by-
  verdict concordance table (not just "all agreed"). Agreement is inter-model;
  it is NOT correctness.
- C2 (cost) — the missing capture: patch `src/workflow_task.ts` to read
  `metadata.usage.{inputTokens,outputTokens,cachedTokens,totalTokens}` off the
  agent step (mirror `readAgentStructuredOutput`), add fields to
  `AlertAnalysisVerdict`, surface in a `TokenUsage` evaluator. Cost = tokens x
  documented price basis (write the basis down in this doc).
- C3 (latency): capture per-execution wall time from step records; report
  p50/p90; separate cold (first call per model) from warm.

Exit: C1-C3 reproduced from a script with the price/latency basis written down.

## Phase 2 — Stress the evidence base

1. Agreement != correctness: compute per-model precision/recall/accuracy vs the
   golden labels (labels already exist). Catches "both agree, both wrong".
2. Variance: `--repetitions >=5`; report self-consistency per model. "All 35"
   implies a determinism LLMs do not have.
3. Sampling bias (C4): stratify by TP/FP mix, severity, MITRE technique, data
   source; measure agreement WITHIN each stratum (expect concordance to drop on
   FP-heavy / ambiguous strata).
4. Hard-case set (C5): build the "stealthy attack / convincing noise" alerts the
   author asked for. This is the decision-blocking eval — if the models diverge
   here, the "just use Haiku" temptation is falsified.
5. Cost realism (C2/C6): re-derive with caching on/off (`cachedTokens` tracked)
   at realistic monthly alert volume — feeds the C6 product ask.

## Phase 3 — Per-claim scorecard

Mark each claim Confirmed / Confirmed-but-narrow / Not-supported with the
re-derived number and its basis. Expected shape:

- C1 -> Confirmed-but-narrow (agreement holds on easy labeled alerts; drops to
  X% on FP-heavy / hard cases)
- C2/C3 -> Confirmed-if re-derived ratios land near 3x/2x WITH basis stated
- C5/C6 -> Confirmed-as-gaps (ship hard-case suite + per-alert/per-month cost)

## Price basis (fill in before deriving cost)

| Model | Connector id | $/1M input | $/1M output | Cache read $/1M | Source |
|-------|-------------|-----------|------------|-----------------|--------|
| Haiku  | TBD | TBD | TBD | TBD | TBD |
| Sonnet | TBD | TBD | TBD | TBD | TBD |

## Implementation status (this branch)

All analysis code is built, unit-tested, and typechecked. What remains is the
live run (needs a Scout stack + Haiku/Sonnet connectors), which produces the
numbers the scorecard consumes.

| Deliverable | Module | Test |
|-------------|--------|------|
| Token + latency capture (C2/C3) | `src/workflow_task.ts` (`readAgentUsage`, `readAgentStepLatency`) | `src/read_agent_usage.test.ts` |
| Token/latency reporter | `tokenUsage` evaluator (`src/evaluators.ts`) | `src/token_usage_evaluator.test.ts` |
| Per-model precision/recall (Phase 2) | `src/precision_recall_evaluators.ts` | `src/precision_recall_evaluators.test.ts` |
| Cross-model concordance + Cohen's kappa (C1) | `src/concordance.ts` | `src/concordance.test.ts` |
| Per-claim scorecard (Phase 3) | `src/scorecard.ts` | `src/scorecard.test.ts` |

## How to run (live)

Run the suite once per model connector (the `beforeAll` points the workflow's
`ai.agent` step at the connector under test):

    # variance / self-consistency: >=5 repetitions per model
    node scripts/evals run --suite security-alert-analysis-workflow \
      --connector <haiku-connector-id> --repetitions 5
    node scripts/evals run --suite security-alert-analysis-workflow \
      --connector <sonnet-connector-id> --repetitions 5

Each run reports, per model: `ClassificationAccuracy`, `Precision_/Recall_*`
(means = the aggregate metric), and `TokenUsage` (input/output/cached tokens +
wall-clock latency). Repetitions feed the framework's paired-t-test
(`@kbn/evals-common` `computePairedTTestResults`) for significance.

Then feed the two runs into the analyzers:

- `computeConcordance(modelAVerdicts, modelBVerdicts)` -> C1 agreement rate +
  Cohen's kappa + the disagreement list.
- Cost ratio = (mean total tokens x price basis) per model; latency ratio =
  mean latency per model. Fill the price-basis table above.
- `buildScorecard({ agreementRate, cohensKappa, accuracyByModel, costRatio,
  latencyRatio })` -> the Confirmed / Confirmed-but-narrow / Not-supported
  verdict per claim, with thresholds in `SCORECARD_THRESHOLDS`.

## Closing C2/C3 with the token-usage exporter + analyzer (no golden-cluster read)

The live run also writes a per-run JSONL via `src/token_usage_exporter.ts`
(wired into the spec's task closure) — each row carries `connectorId`,
`alertId`, `stratum`, `executionStatus`, predicted verdict, and the raw
`inputTokens`/`outputTokens`/`cachedTokens`/`totalTokens`/`latencyMs`/
`agentLatencyMs`. This survives stack teardown (append-only, local file) so
C2/C3 no longer depend on reading `.evaluation-scores` from the golden cluster
(the dev-vault ES key is write-only).

Post-run, one command emits the cost/latency ratios the scorecard needs:

    yarn analyze /tmp/alert-analysis-token-usage-<TEST_RUN_ID>.jsonl
    # or, outside the package:
    node scripts/analyze-token-usage.mjs /tmp/alert-analysis-token-usage-<TEST_RUN_ID>.jsonl

The pure-logic core lives in `src/analyze_token_usage.ts` (canonical, unit-tested
via `validation_results.test.ts`); the `.mjs` CLI mirrors it for direct shell use
because Node ESM cannot import `.ts` natively.

Output: per-model means (tokens, latency, runs, failures), `ratios.costRatio`
and `ratios.latencyRatio` (>= 1 means the deck's claim direction holds), and a
`stratified` breakdown (base vs hard-case) for the C5 decision gate. Optional
second arg is a `priceBasis.json` (`{connectorId: {input, output, cached}}` in
USD per 1M tokens); defaults to Anthropic-list Haiku/Sonnet per-1M prices.

### Scorecard is auto-derived from the JSONL

`validation_results.test.ts` reads `ALERT_ANALYSIS_TOKEN_USAGE_PATH` (or the
`TEST_RUN_ID` default), runs `computeTokenUsageAnalysis`, and feeds
`ratios.costRatio`/`latencyRatio` straight into `buildScorecard` — so once a
live run lands its JSONL, C2/C3 are graded automatically (no manual step).
When the JSONL is absent (fresh checkout, first run), C2/C3 fall back to
`insufficient-data` and the test still passes on C1 alone.

### Why a post-run analyzer rather than another `@kbn/evals` evaluator

The per-example pieces already ARE dedicated evaluators: `TokenUsage` (this
suite, `src/evaluators.ts`) emits input/output/cached/total tokens + latency
per run, and `@kbn/evals` ships trace-native equivalents under
`defaultEvaluators.traceBasedEvaluators.{inputTokens,outputTokens,cachedTokens,
latency,toolCalls}` (read from `TRACING_ES_URL`). `@kbn/evals` aggregates each
evaluator's per-example score into the dataset mean natively, so the per-model
token/latency numbers do not need a custom reducer.

What neither can express is the **cross-model** ratio (cost of Sonnet ÷ Haiku,
latency of slower ÷ faster) and the **stratified** breakdown (base vs
hard-case) — a CODE evaluator sees one example at a time and has no view into
the other model's experiment. C2/C3 are inherently cross-experiment claims, so
the reducer that computes them must run post-hoc over both result sets. That is
what `analyze_token_usage.ts` is; it is not duplicating an evaluator, it is the
only shape that can express the deck's ratio claims.


## Hard-case set (deck claim C5 — the model-choice decision gate)

Built in `src/hard_case_alerts.ts` (6 alerts), merged into the run via the spec's
`ALL_EVAL_ALERTS` with a `stratum: 'base' | 'hard-case'` tag on each example so
agreement/accuracy can be split by difficulty:

- `aa-eval-hard-lolbin-certutil` — stealthy **true_positive**: signed & trusted
  `certutil.exe` used as a LOLBin to download a remote payload (T1105). Defeats a
  "signed => benign" shortcut.
- `aa-eval-hard-noise-scanner` — convincing-noise **false_positive**: a
  high-severity LSASS/credential-access behavioral alert fired by a signed,
  authorized, scheduled Tenable Nessus scan under the scanner service account.
  Defeats a "scary technique => malicious" shortcut.
- `aa-eval-hard-lolbin-wmic-proccall` — stealthy **true_positive**: signed
  `wmic.exe` used to spawn a remote payload via `process call create`
  (T1047/T1210). Defeats "signed => benign" and "system tool => benign".
- `aa-eval-hard-noise-edr-remediation-ps` — convincing-noise **false_positive**:
  the EDR (CrowdStrike Falcon) launches a signed remediation that shells out to
  PowerShell with an encoded command. Defeats "encoded PowerShell => malicious".
- `aa-eval-hard-noise-admin-psexec` — convincing-noise **false_positive**:
  approved remote admin via PsExec from the platform-team jump host pushing a
  patch rollout (T1021). Defeats "remote service create => lateral movement".
- `aa-eval-hard-stealthy-macro-dotnet` — stealthy **true_positive**: a macro in
  a signed Office host loads a .NET assembly from a temp path (T1218.004/T1620).
  Defeats "trusted productivity app => benign".

If two models agree on the `base` stratum but diverge on `hard-case`, the deck's
"just use the cheaper model" temptation is falsified — that divergence is the C5
decision signal. Extend this file with more stealth/noise cases as needed; the
stratum tag and analyzers already support them.

## Results (live run, 2026-07-20)

`TEST_RUN_ID=alert-analysis-validation-rerun-20260720-171008`. Full results and scorecard in `VALIDATION_RESULTS.md`. Summary:

- **C1 (agreement): CONFIRMED.** Haiku vs Sonnet agreementRate=1.00, Cohen's kappa=1.00 over 49 compared runs; 0 disagreements. Both models jointly accurate (>= 0.8 floor).
- **C2 (cost ~3x): INSUFFICIENT-DATA.** Per-run TokenUsage score docs not readable this cycle (dev-vault ES key is write-only; golden Kibana evals route disabled).
- **C3 (latency ~2x): INSUFFICIENT-DATA.** Same read-path gap as C2.

Haiku accuracy 0.98 (1 transient workflow failure, not a misclassification); Sonnet 1.00. Precision/Recall ~1.00 for both. The suite ran on the 10-alert labeled set (5 reps) — the report's 35 alerts were unrecoverable (Phase 0).

### Read-path gap - resolution options for C2/C3

To close C2/C3 on a future run, one of:
1. Re-run with `EVALUATIONS_KBN_URL` explicitly pointing at an evals-plugin-enabled Kibana (e.g. the local Scout stack, kept up post-run), then `node scripts/evals compare <haiku-exp> <sonnet-exp>` for paired t-tests.
2. Provision a read-scoped API key against `.evaluation-scores` on the golden cluster.
3. Add a post-run exporter to the suite that dumps per-example `TokenUsage` metadata (tokens + latency) to a local JSON file before stack teardown.

Option 3 is the most robust (no extra infra/auth) and is the recommended follow-up.
