# B3 — Production-grounded FP baseline

> Status: **partially resolved 2026-05-05** — pure-logic estimator
> ships with full unit-test coverage (22 tests), index template +
> per-index doc + ingestion workflow ship; the baseline-to-override
> applier workflow is the explicit follow-up that closes the loop with
> B6.

## 1. The gap

Vision-doc §1.3.3 calls for grounding gate thresholds in **environment
baselines** — the actual per-rule alert volumes and FP rates, rather
than the global `DEFAULT_GATE_THRESHOLDS = { min_precision: 0.9,
min_recall: 0.6, min_variant_coverage: 0.5, max_fp_rate: 0.02 }`
constants in `evaluators.ts:49`.

B6 already shipped the *override surface*:
`resolveGateThresholds(default, run, perRule)` plus
`CandidateRule.gate_overrides`. What B6 cannot answer is **"what
numbers should go in the per-rule override?"**. Today an operator
would have to hand-tune those values per rule, and the matrix correctly
flags 1.3.3 as the remaining ❌.

Without B3, AutoDEX gates every rule against the same `max_fp_rate =
0.02`, regardless of whether the rule is `Suspicious PowerShell` (high
volume, high TP rate) or `Discovery via NetBIOS` (low volume, mostly
FPs in default networks). That mismatch is the single largest source of
gate-threshold complaints in the issue tracker for `kbn-evals-suite-
argus-detection`.

## 2. What ships today

### 2.1 Pure-logic estimator

[`lib/argus/governance/fp_baseline_estimator.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/governance/fp_baseline_estimator.ts).
`estimateRuleFpBaseline(snapshot, thresholds?) → RuleFpBaselineSnapshot`.
22 unit tests cover threshold resolution (clamping, flooring,
non-finite handling, defaults), the four-verdict matrix
(`cold_start` / `volume_only` / `labelled` / `insufficient_labels`),
defensive coercion of malformed counts, Laplace smoothing
(`(fp+1)/(tp+fp+2)` so a `0/0` snapshot doesn't NaN, and a
`5fp/0tp` snapshot doesn't claim 100% FP rate), confidence-curve
shape (`1 - exp(-N/floor)` is `~0.63` at the floor and asymptotes
to 1), and per-rule identity preservation.

### 2.2 Two snapshot shapes

The estimator accepts either:

- **`VolumeOnlySnapshot`** — alert count + window only. Suitable when
  TP/FP labels haven't been collected yet (cold-start).
- **`LabelledSnapshot`** — alert count + window + TP/FP counts.
  Suitable once `.soc-outcomes` has accumulated `≥
  min_labels_for_fp_rate` (default 20) labels for the rule.

This split matches reality: most orgs have alerts long before they have
analyst-confirmed TP/FP labels, and the estimator should be useful
**now** for the volume signal even if the FP-rate signal needs more
data.

### 2.3 Verdict matrix

| # | Condition | Verdict | Consumer guidance |
|---|---|---|---|
| 1 | `alert_count < min_alerts_for_baseline` OR `window_hours <= 0` | `cold_start` | Fall back to `DEFAULT_GATE_THRESHOLDS`. |
| 2 | Volume-only snapshot with sufficient alerts | `volume_only` | Use `expected_alerts_per_hour`; FP-rate falls back. |
| 3 | Labelled snapshot but `tp+fp < min_labels_for_fp_rate` | `insufficient_labels` | Use volume; FP-rate falls back. |
| 4 | Labelled snapshot AND labels meet floor | `labelled` | Use both volume and FP-rate. |

Verdict represents **telemetry maturity**, NOT rule health (rule health
is B7's `evaluateRuleTuning`). Conflating these two would be a category
error: a healthy rule with lots of TPs and few FPs is `labelled` AND
`healthy`; an unhealthy rule with lots of FPs and few TPs is also
`labelled` (the data is there) but `disable`-recommended (the data says
to act on it).

### 2.4 Default thresholds

- `min_alerts_for_baseline: 50` — fewer alerts than this in 7 days
  isn't enough to ground a per-hour rate.
- `min_labels_for_fp_rate: 20` — labels below this don't satisfy
  Laplace's stability conditions.
- `volume_quantile: 0.95` — reserved for future quantile-based
  baselines (today the estimator returns the mean rate; the
  threshold is stamped for forward-compat).
- `smoothing_alpha: 0.1` — reserved for EMA-based baseline updates
  (today each roll is independent; the threshold is stamped for
  forward-compat).
- `default_fp_rate: 0.02` — falls back to the
  `DEFAULT_GATE_THRESHOLDS.max_fp_rate` value so the consumer always
  has something to use.

All five thresholds are per-call overridable and stamped on the
output `thresholds_applied` for audit replay.

### 2.5 Storage envelope

`.soc-rule-fp-baseline` is a new index template with `dynamic: false`
mapping covering every field in `RuleFpBaselineSnapshot`. Doc id =
`rule_id` so each rule has a single most-recent baseline (the workflow
upserts via `op_type: index`). Per-index doc:
[`schemas/soc-rule-fp-baseline.md`](../schemas/soc-rule-fp-baseline.md).

### 2.6 Producer workflow

[`soc-argus-fp-baseline-roller.yaml`](../../../workflows/soc-argus-fp-baseline-roller.yaml).
Every 24h + manual. Aggregates alerts by `kibana.alert.rule.uuid`
across the last 7 days, then fans out one row per rule. The Liquid
template mirrors the verdict matrix conservatively: today only
`cold_start` and `volume_only` are emitted from YAML — see §6 for the
migration path.

## 3. Why this design

### 3.1 Why two snapshot shapes

Cold-start is the common case. An estimator that requires labelled
data to produce *any* output is useless until the org has months of
analyst feedback. Splitting the input shape lets the estimator ship
value on day one (volume baselines for B6 to consume), then upgrade
seamlessly to labelled baselines as outcomes accumulate.

### 3.2 Why Laplace smoothing

`fp_rate = fp / (tp + fp)` collapses to NaN when `tp = fp = 0` and
swings wildly with small label counts (a single FP in a 5-label
sample claims 20% FP rate). Laplace smoothing
`(fp + 1) / (tp + fp + 2)` adds two pseudo-counts (one TP, one FP)
that anchor the estimate at 0.5 in the absence of data and decay
toward the empirical rate as labels accumulate. The
`min_labels_for_fp_rate` threshold further prevents shipping
estimates from samples too small to be honest about.

### 3.3 Why a separate `verdict` enum, not a boolean

Three distinct "this baseline isn't fully grounded" cases
(`cold_start`, `volume_only`, `insufficient_labels`) need different
consumer behaviour: cold-start should fall back entirely, volume-only
should partially ground (volume yes, FP-rate no), insufficient-labels
should partially ground in the same way but is *closer* to upgrading.
A boolean flag would conflate all three.

### 3.4 Why this lives in `lib/argus/governance/`

`governance/` already houses `rule_tuning_advisor.ts` (B7),
`prebuilt_lifecycle_advisor.ts` (B8), the gate threshold resolver
(B6), and the crown-jewel impact evaluator (B5). All four are
"what should AutoDEX *propose* about a rule" engines that share the
operator-tunable threshold pattern and the `*Snapshot →
*Recommendation` envelope shape. B3 is the same shape on the
"what should AutoDEX *measure* about a rule" axis — co-locating it
keeps the governance taxonomy coherent.

## 4. What does not ship today (deliberately deferred)

- **Registered server-side step** `security.argusEstimateFpBaseline`.
  The pure-logic estimator's `LabelledSnapshot` path needs an ES
  query that joins alert counts with `.soc-outcomes` rows where the
  analyst has confirmed `verdict ∈ {true_positive,
  false_positive}`. The Liquid template can't easily express that
  join, so the YAML conservatively emits only the
  `cold_start` / `volume_only` subset. The TS helper handles the
  full matrix; a short server-side step calling
  `estimateRuleFpBaseline` with a labelled snapshot will close this.
- **Baseline-to-override applier workflow**
  `soc-argus-baseline-to-overrides.yaml`. Reads
  `.soc-rule-fp-baseline`, projects each `verdict=labelled` row's
  `fp_rate_estimate` onto a `CandidateRule.gate_overrides.max_fp_rate`
  payload, and persists it to wherever B6 reads per-rule overrides
  from. Today, B6 reads them from the `CandidateRule` object — this
  applier connects the two halves.
- **EMA / quantile baselines.** The thresholds for
  `volume_quantile` and `smoothing_alpha` are stamped for forward
  compat but unused today (each roll computes a fresh mean rate over
  the window). When fp/tp telemetry stabilises, switching to
  EMA-smoothed quantile-based baselines is a one-line change in the
  estimator that picks up automatically because the threshold is
  already plumbed.
- **Per-host / per-user / per-tenant baselines.** Today's estimator
  is per-rule-only. The crown-jewel asset model from B5 already
  carries per-asset trust tiers; cross-cutting baselines (per-rule
  per-asset) is a follow-up that uses the same shape with an
  additional `asset_id` axis on the doc id.
- **Backfill.** The roller emits the 7-day baseline going forward;
  any one-time historical backfill (every rule ever) is an operator-
  run CLI invocation not in scope.

## 5. Test coverage

22 unit tests in `fp_baseline_estimator.test.ts`:

- `resolveFpBaselineThresholds`: defaults, partial overrides,
  fractional flooring, sub-1 clamping, unit-bounded clamping,
  non-finite fallback (6 tests).
- `estimateRuleFpBaseline`: cold-start handling (4), volume_only
  path (3), labelled path (8 incl. Laplace edge cases, override
  acceptance, confidence shape, defensive coercion, threshold
  stamping), determinism (1).

The workflow's Liquid template is exercised via the live benchmark
(Wave 6) — after one tick on a populated alerts index, a row should
exist per rule with `verdict=volume_only` and a non-null
`expected_alerts_per_hour`.

## 6. Migration path (when the registered step lands)

1. Add a registered server-side step
   `security.argusEstimateFpBaseline(rule_id, window_hours)` that:
   - Counts alerts in `.alerts-security.alerts-default` for the
     window.
   - Counts TP/FP outcomes in `.soc-outcomes` for the window.
   - Builds either a `VolumeOnlySnapshot` or `LabelledSnapshot`.
   - Calls `estimateRuleFpBaseline` and writes the result.
2. Update `soc-argus-fp-baseline-roller.yaml` to invoke the
   registered step per rule (replaces the conservative Liquid
   emission).
3. Add `soc-argus-baseline-to-overrides.yaml` that reads
   `.soc-rule-fp-baseline` and writes per-rule overrides where B6
   reads them.
4. Re-run the live benchmark; expect Wave 6 to flip 1.3.3 from
   `🟡` to `✅`.

## 7. Risks & mitigations

- **Risk**: Aggressive `min_alerts_for_baseline` floor leaves
  low-volume rules permanently in `cold_start`.
  **Mitigation**: per-call override; the applier workflow will pass
  smaller floors for low-volume rules while keeping the global
  default conservative.
- **Risk**: `.soc-outcomes` label-quality drift (analyst marks all
  alerts as `false_positive` due to fatigue).
  **Mitigation**: `confidence` is exposed; the applier only applies
  overrides when `confidence >= 0.5`. If the label distribution
  becomes degenerate, the smoothing pulls estimates toward 0.5 and
  the confidence threshold pre-empts a bad override.
- **Risk**: A rule's volume varies sharply day-over-day (cron-driven
  scans that fire only on weekends).
  **Mitigation**: 7-day window dampens day-of-week effects; future
  EMA-based baselines (already plumbed) further smooth this.
