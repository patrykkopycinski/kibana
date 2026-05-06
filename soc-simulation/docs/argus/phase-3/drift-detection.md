# Phase 3 Design — Drift Detection

Status: **Draft (decisions locked, implementation pending Phase 3 kickoff)**

## Problem

Mythos-era adversaries iterate. A detection rule that scored `precision=0.92,
recall=0.86` at M2.1 time can quietly decay over weeks as the adversary adapts.
Today, the only signal we have is a downstream FP / missed-TP spike — by which
point a real intrusion may already have slipped.

ARGUS needs to detect **eval-score drift** and **trust drift** early enough to
force a re-run of the detection-eval vertical before an adversary notices.

## Decision

Introduce `soc_argus_drift_monitor`, a fully-auto workflow that scans two streams
on a 6-hour cadence and emits drift events into `.soc-recommendations`.

### Sources

1. `.soc_detection_eval-runs` (M2.1) — score trajectory per `rule_id`.
2. `.soc-trust-scores` — trust trajectory per actor.

### Detection

For each `rule_id` with ≥ 3 eval runs in the last 30 days:

```
ema_precision = exp. moving average of scores.precision (alpha=0.3, recent weight)
baseline_precision = median of the 7 runs immediately before the last run
delta = ema_precision - baseline_precision
drift_significant = abs(delta) >= 0.08 OR  # absolute drop
                    (delta <= -0.04 AND scores.variant_coverage_delta <= -0.10)
```

Analogous logic per `actor_id` on `.soc-trust-scores`, with the additional input
`reasoning_trace_quality` (from M2.5) in its 24h window.

### Effect

On a detected drift the workflow files a `mutation_intent` with
`argus.origin: drift_detected`, `status: eval_requested`, and the rule / actor id.
The existing eval cascade (M2.1) picks it up on the next tick and re-scores against
the current corpus. If the re-eval passes, the drift event is closed as
`status: stale_signal`. If it fails, the applier downgrades the trust tier and
routes to human review.

## Why this design

- **No new primitives.** Reuses `.soc_detection_eval-runs`, `.soc-trust-scores`,
  `mutation_intent`, existing applier cascade.
- **Deterministic.** EMA + simple thresholds. No LLM.
- **Falsifiable.** Every drift event produces a verifiable eval-run row with the
  same `snapshot_id` shape as M2.1 runs.
- **Bounded overhead.** 6h cadence; at most N rules × 1 eval call per tick.

## Contract

New document shape in `.soc-recommendations`:

```json
{
  "artifact_type": "mutation_intent",
  "status": "eval_requested",
  "argus": {
    "origin": "drift_detected",
    "drift": {
      "kind": "rule_eval|actor_trust",
      "target_id": "rule:mythos.cred-dumping.lsass",
      "delta": -0.12,
      "ema_window_days": 30,
      "reason_code": "score_decay|variant_coverage_collapse|trust_downgrade|trace_quality_low"
    }
  }
}
```

## Dependencies

- M2.1 must emit stable `snapshot_id`s and per-axis `mutation_axis_breakdown`.
- M2.5 must be live for `reasoning_trace_quality` to feed into the actor-trust side.
- `soc-trust-scorer` must have been rewired per M2.5 §5.

## Open questions

1. **Alpha** for the EMA — 0.3 is a starting guess, will calibrate against the
   staged cluster.
2. **Actor-trust drift** vs. rule-score drift — should both fan into the same
   queue or stay as separate `origin` values? Starting with a single `origin` with
   a `kind` discriminator to keep the applier path uniform.
3. **Hysteresis** — avoid flapping when a drift event is followed by a successful
   re-eval that just barely clears the threshold. Proposed: a 48h cooldown per
   `target_id` before the same drift kind can file again.
