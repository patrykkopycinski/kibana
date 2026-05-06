# Scenario 3 — Frontier-class intrusion (forward-reference)

This scenario is **out of scope** of the current demo-ready tree. It depends on
milestones M2.4 (preset arming + red-team operator) and M2.5 (reasoning-trace
watchdog + rollback) which are not yet fully implemented.

## What exists today (validated)

- `workflows/soc_argus_arm_mythos_preset.yaml` — arms the `level-6`
  mythos-class preset and indexes a pending attack command.
- `workflows/soc_argus_frontier_simulator.yaml` — re-emits a random
  labelled variant from the `.soc-eval-corpus-argus-corpus-mythos-2026-04`
  corpus once the preset is armed.

Both were mirror-validated on 2026-04-17 — see
`soc-simulation/docs/argus/proof/mythos_workflows_mirror.log`.

## What is still missing for the full frontier scenario

| Gap | Owner milestone |
|-----|-----------------|
| Adversary operator that chains primitives into a multi-stage kill chain | M2.4 |
| `reasoning_traces` data stream with per-recommendation OTEL-GenAI spans | M2.5 |
| Watchdog workflow that blocks / rolls back mutations when reasoning confidence drops | M2.5 |
| UI surface to narrate P1/P2/P3 pressure outcomes live | post-M2 |

## Cut-line for the Apr-17 demo

For the 2026-04-17 live demo we **only run scenarios 1 and 2**, and
call out scenario 3 as "next quarter" using the
`arm-mythos-preset` + `frontier-simulator` hooks as a 30-second teaser.

Detailed gap analysis lives in
`soc-simulation/docs/argus/capability-and-gap-analysis.md`.
