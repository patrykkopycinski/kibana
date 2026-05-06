# M2.4 — Frontier-Adversary Simulation Mode

**ARGUS layer:** 01 Sensing (telemetry generation) · **Pressure:** P3 agentic adversary · **Extends:** `soc_difficulty_controller.yaml` + Phase 1 preset

## Context

Phase 1 declared the Mythos-class adversary preset (`level-6`,
`mythos_class_frontier`) and the arming workflow (`soc_argus_arm_mythos_preset`). The
static Caldera abilities are seeded and runnable today. What is **not** yet runnable
is the *agentic* portion: the part of the frontier adversary that reasons about ARGUS
and crafts adversarial inputs.

M2.4 delivers that layer.

## Goal

A new workflow `soc_argus_frontier_simulator` augments a Mythos-class Caldera operation
with agentic behaviours:

- **Polymorphism**: ≥ 20 behavioural variants per primitive technique, emitted into
  `.soc-eval-corpus-*` so M2.1 can score coverage.
- **Prompt injection**: controlled injection payloads embedded in alert-visible
  surfaces (process args, source event text, user-agent strings, hostnames).
- **Long-dwell orchestration**: gapped execution with 48–336 hour jitter.

The simulator is *additive* to Caldera, not a replacement — it enriches the same
operation, writing into the same outcome streams, so every downstream ARGUS layer sees
a realistic Mythos-class run.

## Scope

### In scope

- Workflow `soc_argus_frontier_simulator.yaml` (manual + triggered by the arming
  workflow via `.soc-attack-commands`).
- Polymorphism generator: produces variant event documents that replay against the
  staged fleet through `osquery` / `elastic-agent-generator`.
- Prompt-injection library: corpus of curated, scoped injections under
  `soc-simulation/argus/prompt_injections/*.json`, each labelled with an `intent`
  (severity downgrade, false closure, tool suppression).
- Telemetry tagging: every simulator-produced event carries
  `argus.simulation.preset: "mythos_class_frontier"` so downstream gating can detect
  simulated runs.
- Safety rails: simulator refuses to run against a non-staged environment (checks a
  sentinel index `.soc-staging-sentinel`).

### Out of scope

- Generating *new* injections dynamically from an LLM (deliberate: curated corpus only).
- Simulating credential theft that touches real Kibana/Fleet credentials.
- Running outside the sandboxed lab.

## Acceptance criteria

- [ ] `soc_argus_frontier_simulator` workflow registered in `_registry.json`, gated on
      staging sentinel.
- [ ] On a fresh arm-and-run, polymorphism generator emits ≥ 20 variants for each of
      the 12 techniques in `level6-mythos-class.json`.
- [ ] Prompt-injection library ≥ 30 curated samples spanning all three intents.
- [ ] Scenario 3 of the demo storyboard runs end-to-end against the staged cluster
      and produces a governance-layer audit trail (including at least one trust-gate
      block).
- [ ] Non-staged-environment guard: simulator refuses to run when the sentinel is
      absent, with a non-ambiguous error.

## Safety rails (non-negotiable)

1. Staging sentinel check at step 1. Fail closed if missing.
2. Prompt-injection payloads live in a versioned JSON corpus; no dynamic generation.
3. Every simulator run emits an `argus_frontier_simulation_started` audit row
   *before* any injection or variant is fired, and a matching `…_completed` row with
   the full variant/injection inventory on completion.
4. Kill switch: if `.soc-kill-switch` has `enabled: true`, simulator aborts at the
   next scheduler tick.

## Data model additions

`.soc-eval-corpus-mythos-<yyyymm>` sample doc:

```json
{
  "@timestamp": "...",
  "corpus_id": "argus-corpus-<uuid>",
  "primitive_technique": "T1003.001",
  "variant_axis": "command_args",
  "variant_index": 7,
  "event": { "...": "...simulated telemetry..." },
  "expected_fire": { "rule_ids": [], "any_of": true },
  "argus": {
    "simulation": {
      "preset": "mythos_class_frontier",
      "run_id": "argus-sim-<uuid>"
    }
  }
}
```

## Phases

1. **Staging sentinel + audit** (0.5 wk).
2. **Polymorphism generator** (1.5 wk): 12 techniques × ≥ 20 variants; consumed by M2.1.
3. **Prompt-injection library + binding** (1 wk): curated corpus + injection into
   alert-visible fields.
4. **Long-dwell orchestration** (0.5 wk): jitter scheduler.
5. **Scenario 3 wiring** (0.5 wk): demo storyboard end-to-end.

Est. total: 4 weeks.

## Non-goals

- Turning the simulator into a general-purpose red-team platform.
- Replacing Caldera's static abilities — the simulator composes with Caldera, not
  instead of it.
- Auto-hardening of skills against injections — that's M2.5 governance.

## Links

- Anchor Phase-1 profile: `../../caldera_profiles/level6-mythos-class.json`
- Anchor Phase-1 workflow: `../../workflows/soc_argus_arm_mythos_preset.yaml`
- Phase-1 spec: `../mythos-preset-spec.md`
- Consumer: M2.1 (`m2-1-detection-eval-vertical.md`), M2.5 (`m2-5-reasoning-trace-governance.md`)
- Scaffold: `../scaffolds/m2-4-simulator-contract.md`
