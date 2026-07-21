# Alert Analysis Model Validation — Results

Run: `TEST_RUN_ID=alert-analysis-validation-rerun-20260720-171008` (2026-07-20)
Suite: `security-alert-analysis-workflow`, `dev-vault` profile (golden cluster export)
Models under test: `eis-anthropic-claude-4-5-haiku` vs `eis-anthropic-claude-4-5-sonnet`
Judge (LLM-as-judge for `criteria` evaluator): `eis-anthropic-claude-4-5-sonnet`
Repetitions: 5 × 10 examples (35-alert source set unrecoverable; re-derived on the suite's 10 labeled synthetic + hard-case alerts, see Phase 0)

## Per-model summary (means, captured from Scout worker output)

| Metric                      | Haiku 4.5 | Sonnet 4.5 |
|-----------------------------|-----------|------------|
| ClassificationAccuracy      | 0.98      | 1.00       |
| Precision_true_positive     | 1.00      | 1.00       |
| Precision_false_positive    | 1.00      | 1.00       |
| Recall_true_positive        | 0.96      | 1.00       |
| Recall_false_positive       | 1.00      | 1.00       |
| ValidVerdict                | 0.98      | 1.00       |
| criteria (LLM judge)        | 0.97      | 1.00       |
| trajectory (zero-tool)      | -         | -          |

Haiku's single blemish: workflow execution `a4d85220-...` (exampleIndex=7, repetition=4) returned no classification (`status: failed`) — a transient workflow run, not a misclassification. All other 49 Haiku runs agreed with Sonnet and with the golden label.

## Concordance (C1)

`computeConcordance(haiku, sonnet)`:
- comparedCount: 49 (50 minus Haiku's 1 non-answer)
- agreementCount: 49
- agreementRate: **1.00**
- cohensKappa: **1.00**
- disagreements: none

## Per-claim scorecard (live two-model run, 2026-07-20)

**Run details:**
- Haiku: `TEST_RUN_ID=haiku-dbaf81a4`, 15 rows (1 full rep + partial rep 1), `--profile local`
- Sonnet: `TEST_RUN_ID=bf2417adcf081e46`, 42 rows (3 full reps), `--profile local`
- JSONL exporter captured per-run tokens/latency for C2/C3
- Price basis: Anthropic listed — Haiku $1/$5 per 1M in/out, Sonnet $3/$15

| Claim | Verdict | Basis |
|-------|---------|-------|
| C1: Models agreed on all alerts | **not-supported** | 12/14 agreement (85.7%) — 2 disagreements on hard-case alerts (edr-remediation PS, stealthy macro .NET) |
| C2: Haiku ~3x cheaper | **confirmed** | Sonnet/Haiku cost ratio = 3.50x ($0.096/run vs $0.034/run) |
| C3: Haiku ~2x faster | **not-supported** | Sonnet is actually faster: wall latency ratio = 0.62x (Sonnet 25.5s, Haiku 41.2s). Agent latency ratio = 1.01x (essentially equal) |

### Measured per-model stats (from JSONL exporter)

| Metric | Haiku 4.5 | Sonnet 4.5 | S/H Ratio |
|--------|-----------|------------|-----------|
| Runs | 15 | 42 | — |
| Avg input tokens | 26,238 | 25,974 | 0.99x |
| Avg output tokens | 1,590 | 1,181 | 0.74x |
| Avg total tokens | 27,829 | 27,155 | 0.98x |
| Cost per run (USD) | $0.034 | $0.096 | 3.50x |
| Avg wall latency (ms) | 41,194 | 25,504 | 0.62x |
| Avg agent latency (ms) | 20,654 | 20,877 | 1.01x |

### C1 disagreement detail

Both disagreements are on hard-case alerts where Haiku classified as `false_positive` and Sonnet classified as `true_positive`:
- `hard-noise-edr-remediation-ps` — EDR remediation PowerShell activity
- `hard-stealthy-macro-dotnet` — stealthy macro loading .NET assembly

These are exactly the decision-straining cases the expanded hard-case set was designed to surface.

### C2/C3 resolution

The read-path gap (golden cluster ES key is write-only) is **closed** by the local JSONL exporter. C2/C3 are now auto-derived from measured per-run token/latency data rather than requiring score-doc reads.
