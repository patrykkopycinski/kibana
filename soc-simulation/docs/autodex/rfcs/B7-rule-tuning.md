# B7 — Rule Tuning chat skill (epic 17091)

> Status: **partially resolved 2026-05-05** — pure-logic recommendation
> engine ships with full unit-test coverage; chat-skill registration is
> deferred behind the 17090.1–17090.4 prerequisites enumerated in the
> [epic-17090 audit](../epic-17090-audit.md) §4.

## 1. The gap

Vision-doc §1.1.4 and the conformance matrix's chat-skill epic 17091 row
both flag this as missing entirely: there is no Rule Tuning chat skill,
no `false_positive_reduction` skill, no `alert_volume_optimization` skill,
and none of the prerequisite tools (`aggregate_alerts_for_rule`,
`get_alert_volume_baseline`, `preview_exception`, `add_exception`).
A user who asks ARGUS chat *"this rule is noisy, can we tune it?"* gets
no skill response today.

The full chat skill needs three layers:

1. **Recommendation engine** — given a rule's recent telemetry, what
   tuning action makes sense? Pure logic, no agent dependencies.
2. **Prerequisite tools** — `aggregate_alerts_for_rule`,
   `get_alert_volume_baseline`, `preview_exception`, `add_exception`.
   These are 17090.4 in the audit's four-step ramp.
3. **Skill plumbing** — a `getRuleTuningSkill()` factory that composes
   the tools into a conversational flow.

Layer 1 is independently shippable and is the highest-leverage bit
because it's the same logic the autonomous tuner (a future B-tier
follow-up) will run server-side. Layers 2 and 3 are sequenced after
17090.4 lands; building them now would create a chat skill with no
tools to call.

## 2. What ships today (Layer 1)

- **Pure-logic recommendation engine** —
  [`x-pack/.../server/lib/argus/governance/rule_tuning_advisor.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/governance/rule_tuning_advisor.ts).
  `evaluateRuleTuning(snapshot, thresholds?) → RuleTuningRecommendation`.
  27 unit tests cover threshold resolution, all six verdict branches,
  proposal generation, defensive coercion of malformed counts,
  determinism, and audit-trail completeness.

## 3. The verdict matrix

| Verdict | Meaning | Recommended actions | Proposal type |
|---|---|---|---|
| `insufficient_data` | `alerts_24h < min_alerts_for_verdict`. | `log_only` | none |
| `healthy` | FP rate below `noise_fp_rate`, volume within baseline. | `log_only` | none |
| `tune_threshold` | `observed_per_hour ≥ baseline × tune_threshold_multiplier`. Volume spike, threshold rule should narrow. | `propose_tune_threshold`, `review_metrics` | `tune_threshold` |
| `add_exception` | FP rate ≥ `noise_fp_rate` AND a single FP cluster covers ≥ `add_exception_cluster_share` of FPs. | `propose_add_exception`, `review_metrics` | `add_exception` |
| `narrow_query` | FP rate ≥ `noise_fp_rate` BUT no cluster dominates. Query specificity is the likely root cause. | `propose_narrow_query`, `open_review_case` | `narrow_query` |
| `disable` | FP rate ≥ `disable_fp_rate` AND `tp_count < disable_min_tps`. Effectively pure noise. | `propose_disable`, `open_review_case` | `disable` |

## 4. Default thresholds

| Threshold | Default | Meaning |
|---|---:|---|
| `min_alerts_for_verdict` | 5 | Below this, the rule is too quiet to verdict either way. |
| `disable_fp_rate` | 0.95 | At 95%+ FPs the rule is essentially noise. |
| `disable_min_tps` | 1 | A single confirmed TP saves the rule from auto-disable. Operator-tunable to 0 to permit auto-disable on rules that have never produced a TP. |
| `tune_threshold_multiplier` | 3 | A volume 3× baseline is a clear spike, not normal jitter. |
| `noise_fp_rate` | 0.7 | At 70%+ FPs the analyst experience is dominated by noise. |
| `add_exception_cluster_share` | 0.3 | A single source covering 30%+ of FPs is a clear exception target. |

Override resolution (mirrors B9 / B10):

- Non-finite values → fallback to default.
- Out-of-range unit-bounded values → clamped into `[0, 1]`.
- Out-of-range integer values → floored at min (1 for `min_alerts_for_verdict`, 0 for `disable_min_tps`).
- `disable_fp_rate` is auto-promoted to `noise_fp_rate` if the override
  would invert them — so a rule can never be disabled without first
  qualifying as noisy.
- `tune_threshold_multiplier` is clamped to `≥ 1` (a multiplier below 1
  would mean "fire on volumes below baseline" which is contradictory).

## 5. Why these defaults

- **`min_alerts_for_verdict=5`** matches B9's choice for skill-health
  verdicts. A handful of observations is the minimum signal volume
  before any decision should be deterministic.
- **`disable_fp_rate=0.95`** is intentionally high — auto-suggesting
  *disable* on a rule that fires real TPs, even occasionally, costs
  detection coverage. The pattern says "only suggest disable when the
  rule is functionally pure noise."
- **`tune_threshold_multiplier=3`** is the conservative end of the
  literature on alert-volume anomaly detection. Lower multipliers
  (1.5×, 2×) over-fire on weekly cadence drift. Higher (5×) misses
  legitimate spikes worth tuning.
- **`noise_fp_rate=0.7`** matches the Detection Engineering team's
  long-standing "60-70% FP rate is the threshold for analyst
  fatigue" rule of thumb. We could tighten further if calibration
  data shows 0.5 is acceptable.
- **`add_exception_cluster_share=0.3`** mirrors the standard "a single
  benign source explains the bulk of the FPs" pattern. Below 30% the
  cluster is small enough that an exception adds maintenance burden
  without removing meaningful noise.

All values are operator-tunable per call; the engine surfaces every
applied threshold on the output for audit replay.

## 6. Why this lives in `lib/argus/governance/`

The recommendation is a *governance decision* about an existing rule —
parallel to `evaluateCrownJewelImpact` (B5) and the trust-tier gate.
Future producers / consumers:

- **Producer (chat)**: `getRuleTuningSkill().tools` will include
  `argus.evaluate_rule_tuning`, which calls
  `evaluateRuleTuning(snapshot)` and renders the recommendation
  conversationally.
- **Producer (autonomous)**: a future `soc-rule-tuning-advisor.yaml`
  workflow will tick over rules in production daily, calling the same
  helper, and write recommendations to a `.soc-rule-tuning-recommendations`
  index (parallel to `.soc-skill-recommendations`).
- **Consumer (HITL)**: the ARGUS Console "Rule Tuning Inbox" panel
  reads the index and offers `propose_*` actions to the analyst.
- **Consumer (governance)**: the trust-policy gate may read
  `recommended_actions` to decide whether a tuning mutation should
  auto-apply or queue for review.

Putting the engine in `lib/argus/governance/` keeps the spec close to
its sibling helpers and lets every consumer import the same TypeScript
without round-tripping through a workflow step.

## 7. What does NOT ship today (deliberately deferred)

- **Chat skill registration** — depends on the four 17090.4
  prerequisite tools (`aggregate_alerts_for_rule`,
  `get_alert_volume_baseline`, `preview_exception`, `add_exception`)
  which the audit identifies as the right batch to land separately.
  Without them the skill would have no way to fetch the snapshot
  this engine consumes. Sequenced as 17091.1 in the audit.
- **Autonomous tuner workflow** — the `soc-rule-tuning-advisor.yaml`
  workflow is straightforward to write but depends on a stable
  schema for `.soc-rule-tuning-recommendations`, which this RFC
  scopes as a v2 deliverable once chat-driven calibration produces
  the field set the index needs. Out-of-scope for B7 v1.
- **Auto-apply path** — when `verdict=disable` or
  `verdict=add_exception`, applying the proposal autonomously is a
  trust-policy decision. Hold for the trust-tier integration.
- **Cross-rule correlation** — "this rule's tune is correlated with
  three sibling rules' tunes" is real signal but requires a corpus
  view; out of scope for the per-rule advisor.

## 8. Risks and open questions

- **`fp_clusters` quality.** The engine assumes the caller has already
  bucketed FPs by some axis (host, user, process). If the caller hands
  unfocused data ("all 75 FPs in one cluster"), the dominant-cluster
  test trivially fires and `add_exception` proposes overly broad
  exceptions. Mitigation: the prerequisite tool
  `aggregate_alerts_for_rule` will own the bucketing axis selection
  (top-k host names + top-k process names + top-k source IPs as
  separate cluster sets) and the skill content will instruct the
  agent to evaluate each cluster set independently.
- **Threshold-rule vs query-rule divergence.** `tune_threshold`
  semantically applies to threshold rules. For non-threshold rules,
  the same volume-spike signal should map to *narrow_query* instead.
  Today the engine emits `tune_threshold` regardless of rule type;
  the chat-skill plumbing will filter by `current_threshold !== null`
  to translate appropriately. Documenting as a follow-up so the
  filter logic doesn't get re-litigated.
- **Static thresholds vs adaptive.** Real SOC noise floors drift over
  weeks. v1 ships with global defaults; per-rule overrides ride on
  the existing `gate_overrides` channel from B6. v2 should consider
  per-actor overrides (different SOC tiers tolerate different FP
  rates).

## 9. Where this lives in code

```
x-pack/solutions/security/plugins/security_solution/server/lib/argus/governance/
├── rule_tuning_advisor.ts          ← pure-logic spec (THIS RFC)
└── rule_tuning_advisor.test.ts     ← 27 jest unit tests

soc-simulation/docs/autodex/
└── rfcs/B7-rule-tuning.md          ← THIS DOC
```

## 10. Validation status

- 27 / 27 jest tests green.
- ESLint clean.
- ReadLints clean.
- Spec-alignment with the audit's four-step ramp documented in §7.
