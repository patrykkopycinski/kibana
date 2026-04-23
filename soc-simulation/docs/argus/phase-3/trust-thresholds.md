# Phase 3 Design — Trust Tier Thresholds (Frontier-Class)

Status: **Draft**

## Problem

ARGUS must allow autonomous mutations at machine speed *without* letting a
frontier-class adversary weaponise that autonomy. Today's `soc-trust-scorer` has
three tiers (`trusted`, `probationary`, `quarantined`). Phase 2 adds a fourth:
`frontier` — the only tier allowed to auto-apply changes to frontier-class
mutations (`argus.origin in { exploit_to_detection, drift_detected }`).

## Decision

Four tiers, four thresholds, all gated by fresh M2.1 eval scores and M2.5
reasoning-trace quality.

| Tier | Requirements (all must hold, 7d rolling) |
|---|---|
| `frontier` | `precision ≥ 0.9`, `recall ≥ 0.8`, `fp_rate_baseline ≤ 0.02`, `variant_coverage ≥ 0.7`, `reasoning_trace_quality ≥ 0.85`, **and** an M2.4 frontier-simulation run within the last 7d. |
| `trusted` | `precision ≥ 0.85`, `recall ≥ 0.7`, `fp_rate_baseline ≤ 0.05`, `reasoning_trace_quality ≥ 0.7`. |
| `probationary` | `precision ≥ 0.7`, `recall ≥ 0.5`, `fp_rate_baseline ≤ 0.10`. |
| `quarantined` | Anything below probationary OR watchdog-triggered. |

The **frontier** tier is the only change vs. today. It exists because
auto-applying a rule that came out of adversary reasoning requires the highest
standard of evidence, including a recent adversarial simulation.

## Apply-cascade wiring

`soc-autonomous-applier` consults `.soc-trust-scores` for the actor that produced
the recommendation:

```
allowed_origins_by_tier:
  frontier:     [trust_tier == frontier]
                 -> any argus.origin allowed (including exploit_to_detection,
                    drift_detected)
  trusted:      [trust_tier == trusted]
                 -> deterministic patches, simple FP tuning, pattern-widening
  probationary: [trust_tier == probationary]
                 -> HITL-only; applier files recommendation but refuses to apply
  quarantined:  -> block all; notify watchdog
```

If the recommendation's `argus.origin` is not in the list for the actor's tier,
the applier downgrades the action to `pending_review` and logs a
`.soc-autonomy-decisions` row with `blocked_tier`.

## Dependencies

- M2.1 producing stable precision / recall / fp_rate_baseline / variant_coverage.
- M2.4 producing audit trail events for every frontier simulation (used by the
  recency check).
- M2.5 producing `reasoning_trace_quality`.

## Non-goals

- Per-user tier. Trust is per-actor (skill/agent/tool), not per-operator.
- Human-configurable threshold UI. Thresholds live in code, change via PR.

## Open questions

1. **Tier hold times** — how long must an actor remain in a better tier before it
   becomes eligible for auto-apply? Proposed: 48h continuous residence.
2. **Re-promotion after quarantine** — is it allowed at all? Proposed: yes, but
   only after a manual review artifact + a clean 7d window, never within 24h.
3. **Cross-actor contagion** — if skill X is quarantined because it ingested an
   injection, do we automatically downgrade tools that skill X called? Proposed:
   flag for review (watchdog writes a recommendation), never auto-cascade.
