# `.soc-rule-fp-baseline`

> **Owner:** `argus-governance` ·
> **Schema version:** 1 ·
> **Index template:**
> [`soc-simulation/setup/index_templates/soc-rule-fp-baseline.json`](../../../setup/index_templates/soc-rule-fp-baseline.json)

The per-rule, production-grounded FP-baseline snapshot
(AutoDEX B3, vision-doc §1.3.3). One row per detection rule, doc id =
`rule_id` so each rule has a single most-recent baseline. Consumed by a
follow-up applier workflow that maps baselines into B6's
`gate_overrides.max_fp_rate` per rule.

## Field reference

| Field | Type | Notes |
|---|---|---|
| `@timestamp` | `date` | When this baseline was computed. |
| `rule_id` | `keyword` | Doc id and dedup key. |
| `rule_name` | `keyword` | Display name. |
| `verdict` | `keyword` | One of `cold_start`, `volume_only`, `labelled`, `insufficient_labels`. Indicates **telemetry maturity**, NOT rule health. |
| `window_hours` | `float` | Length of the observation window. |
| `alert_count` | `long` | Total alerts the rule fired in the window. |
| `true_positive_count` | `long` | TP count from `.soc-outcomes`; `null` for volume-only. |
| `false_positive_count` | `long` | FP count from `.soc-outcomes`; `null` for volume-only. |
| `expected_alerts_per_hour` | `float` | `alert_count / window_hours` when alerts meet the floor; `null` otherwise. |
| `fp_rate_estimate` | `float` | Laplace-smoothed `(fp+1)/(tp+fp+2)` when labels meet the floor; `null` otherwise. |
| `confidence` | `float` | `[0, 1]` heuristic — `1 - exp(-N/floor)` where `N` is the binding count. |
| `reasons` | `keyword[]` | Human-readable rationale strings the estimator stamped on the snapshot. |
| `thresholds_applied.*` | object | All thresholds the estimator used (audit replay). |
| `schema_version` | `integer` | Currently `1`. |

## Verdict semantics

| Verdict | Meaning | Consumer guidance |
|---|---|---|
| `cold_start` | Fewer than `min_alerts_for_baseline` (default 50) alerts in the window. | Fall back to `DEFAULT_GATE_THRESHOLDS`. |
| `volume_only` | Alerts above floor but no labelled outcomes. | Use `expected_alerts_per_hour` to inform per-rule volume caps; FP-rate falls back to default. |
| `labelled` | Alerts above floor AND labelled outcomes ≥ `min_labels_for_fp_rate` (default 20). | Use both `expected_alerts_per_hour` AND `fp_rate_estimate` as B6 per-rule overrides. |
| `insufficient_labels` | Alerts above floor but labels below the label floor. | Same as `volume_only` until more labels accumulate. |

## Producer

| Workflow | Cadence | Source |
|---|---|---|
| [`soc_argus_fp_baseline_roller.yaml`](../../../workflows/soc_argus_fp_baseline_roller.yaml) | every 24h + manual | `.alerts-security.alerts-default` (and `.soc-outcomes` once the registered step lands per RFC §6) |

The pure-logic core is
[`x-pack/.../server/lib/argus/governance/fp_baseline_estimator.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/governance/fp_baseline_estimator.ts) —
both the workflow (Liquid mirror) and the future registered step
share the same verdict matrix.

## Consumer (deferred)

A follow-up applier workflow `soc-argus-baseline-to-overrides.yaml`
will read the latest baseline per rule and project it onto
`CandidateRule.gate_overrides`:

| Baseline field | B6 override field | Mapping rule |
|---|---|---|
| `expected_alerts_per_hour` | (none today) | Reserved for a future B7 prerequisite tool `get_alert_volume_baseline`. |
| `fp_rate_estimate` | `max_fp_rate` | Use the baseline as the per-rule override when `verdict=labelled`; fall back to default otherwise. |
| `confidence` | (gate) | Only apply the override when `confidence >= 0.5`. |

## Cross-references

- [`rfcs/B3-fp-baseline.md`](../rfcs/B3-fp-baseline.md) — RFC.
- [`rfcs/B7-rule-tuning.md`](../rfcs/B7-rule-tuning.md) — companion engine that consumes per-rule telemetry for tuning recommendations.
- [`evaluators.ts:resolveGateThresholds`](../../../../x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/src/evaluators.ts) — B6 per-rule override surface.
