# Phase 3 Design — Playbook Learning Loop

Status: **Draft**

## Problem

`soc-response` and the existing containment playbook emit response actions from a
static library. In the Mythos era this is brittle: variant-heavy adversaries
engineer behaviours that are *close* to a known technique but not close enough to
trigger the right containment, so the playbook either over-responds (host isolation
on a benign triage miss) or under-responds (host stays warm while the adversary
pivots).

We need a learning loop that updates the playbook mapping based on observed
outcomes — **without** letting the adversary steer it.

## Decision

Add `soc-argus-playbook-learner`, a periodic workflow that correlates three
streams:

1. `.soc-outcomes` — the outcome (TP/FP/escalate) of each triaged alert.
2. `.soc-autonomy-decisions` — which playbook step was chosen.
3. `.soc-post-apply-observer` outputs — whether the chosen step was later rolled
   back.

Every 24h, the learner computes per-`(technique, playbook_step)` pair:

- `success_rate` = `TP_outcomes_without_rollback / times_chosen`
- `rollback_rate` = `rollbacks / times_chosen`
- `confidence_lower_bound` = Wilson lower bound at 95 % with `n = times_chosen`

And files a `mutation_intent` to remap a `(technique, playbook_step)` pair when
**either**:

- `success_rate < 0.5` AND `times_chosen ≥ 30` AND `confidence_lower_bound < 0.4`, OR
- `rollback_rate > 0.2` AND `times_chosen ≥ 20`.

The remap target is a step already observed to succeed on the same technique; if
no alternative exceeds 0.8 Wilson LB, the mutation instead downgrades the pair to
`human_review_only`.

## Adversary-proofing

An adversary could *engineer* a bad outcome stream to poison the learner. Three
guards:

1. **Only frontier-tier outcomes count.** If the triage skill that produced the
   outcome was `probationary` or `quarantined` at the time, it is excluded from
   the stream.
2. **Minimum sample size is deliberately high.** `n ≥ 30` per pair before any
   remap is considered.
3. **Every remap runs through the same apply cascade** (backtest +
   detection-eval-vertical where applicable + regression gate). The learner never
   writes directly to the live playbook.

## Contract

New `mutation_intent` shape:

```json
{
  "artifact_type": "mutation_intent",
  "target": "playbook_mapping",
  "status": "eval_requested",
  "patch": {
    "technique": "T1003.001",
    "from_step": "isolate_host",
    "to_step": "kill_process_and_dump_memory",
    "reason": "success_rate=0.38, rollback_rate=0.21, lb=0.29 over n=44"
  },
  "argus": { "origin": "playbook_learner" }
}
```

## Dependencies

- `soc-post-apply-observer` must reliably tag rollbacks by the originating
  mutation.
- M2.5 trust-tier-at-decision on reasoning traces (so the learner can exclude
  probationary-tier outcomes).

## Non-goals

- Generating new playbook steps. The learner only **remaps** existing steps; new
  steps land via a separate PR.
- Cross-tenant learning.

## Open questions

1. **Technique taxonomy** — MITRE ATT&CK technique IDs don't always line up with
   playbook steps. Proposed: add a mapping table in `soc-simulation/argus/` that
   the learner uses; extend as gaps surface.
2. **Learning rate vs. adversary cadence** — 24h ticks may be too slow if the
   adversary adapts daily. Proposed: 24h default with a `every: 4h` secondary
   trigger that only fires when a pair crosses its threshold mid-window.
