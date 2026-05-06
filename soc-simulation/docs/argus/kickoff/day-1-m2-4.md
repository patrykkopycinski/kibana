# M2.4 — Day 1 Checklist

**Milestone:** Frontier-adversary simulation mode  
**Spec:** [`../issues/m2-4-frontier-simulation.md`](../issues/m2-4-frontier-simulation.md) · [`../scaffolds/m2-4-simulator-contract.md`](../scaffolds/m2-4-simulator-contract.md)  
**Pair owner:** Simulation (Pair B) — starts Day 0, parallel with M2.1.  
**Target Day-1 outcome:** `soc_argus_frontier_simulator` workflow registered, single-variant dry-run emits a labelled event into `.soc-eval-corpus-*`.

## Before you touch code

- [ ] Confirm the L6 Caldera profile seeded correctly (`GET .soc-attack-profiles/_doc/level-6` → `found: true`).
- [ ] Arm the Mythos preset once and verify Caldera dispatches: `POST /api/workflowsExecution/workflows/soc_argus_arm_mythos_preset/run`.
- [ ] Read the simulator contract and the polymorphism axes in the L6 profile's `argus_metadata`.

## Files to create

```
soc-simulation/workflows/
  soc_argus_frontier_simulator.yaml   # scheduled every 30m when L6 armed
soc-simulation/scripts/
  argus-variant-bank/
    T1003.001/
      axis-command_args.ndjson        # ≥ 1 hand-crafted variant on day 1
      axis-encoding_layers.ndjson     # placeholder
    README.md
soc-simulation/docs/argus/
  frontier-simulator-spec.md          # operational spec (post-day-1, link-only for now)
```

Update:

- `soc-simulation/workflows/_registry.json` — add an entry for
  `soc_argus_frontier_simulator` with `automation_level: human_in_the_loop` and
  `connectors: ["caldera", "audit_trail", "eval_corpus"]`.

## Workflow skeleton (copy-paste)

`soc_argus_frontier_simulator.yaml`:

```yaml
version: '1'
name: SOC ARGUS — Frontier Simulator (M2.4)
description: >
  Runs only while the Mythos-class preset is armed. Picks one primitive +
  variant axis from the variant bank, emits a labelled event into
  .soc-eval-corpus-<corpus_id>, and records a row in .soc-audit-trail.
  Caldera-adjacent but deliberately decoupled — this workflow produces corpus
  rows, not executed attacks.

enabled: true

triggers:
  - type: scheduled
    with:
      every: 30m
  - type: manual

consts:
  corpus_id: "argus-corpus-mythos-2026-04"

steps:
  - name: check_preset_armed
    type: elasticsearch.search
    with:
      index: .soc-audit-trail
      size: 1
      query:
        bool:
          filter:
            - term: { event_type: argus_mythos_preset_armed }
          must:
            - range: { "@timestamp": { gte: "now-12h" } }

  - name: gate_armed
    type: console
    with:
      message: "{% if steps.check_preset_armed.output.hits.total.value > 0 %}yes{% else %}no{% endif %}"

  - name: emit_variant
    type: elasticsearch.index
    with:
      index: ".soc-eval-corpus-{{ consts.corpus_id }}"
      refresh: "wait_for"
      document:
        "@timestamp": "{{ 'now' | date: '%Y-%m-%dT%H:%M:%SZ' }}"
        _argus:
          corpus_id: "{{ consts.corpus_id }}"
          technique_id: "T1003.001"
          variant_axis: "command_args"
          variant_index: 0
          source: "soc_argus_frontier_simulator"
        process:
          name: "lsass.exe"
          command_line: "procdump -ma lsass.exe out.dmp"
    if: "steps.gate_armed.output: yes"

  - name: audit
    type: elasticsearch.index
    with:
      index: .soc-audit-trail
      document:
        "@timestamp": "{{ 'now' | date: '%Y-%m-%dT%H:%M:%SZ' }}"
        event_type: argus_frontier_sim_tick
        source: "soc_argus_frontier_simulator"
        preset_armed: "{{ steps.gate_armed.output }}"
```

## Validate before pushing

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('soc-simulation/workflows/soc_argus_frontier_simulator.yaml'))"
python3 -m json.tool soc-simulation/workflows/_registry.json > /dev/null
```

## You are not stuck if…

- You only have one variant on day 1 — that's the right shape. Volume grows over phases 2-4 of the issue.
- The `_argus` namespace feels wrong in ECS — it's intentional and the M2.1 evaluator strips it before replay.
- Caldera isn't running — M2.4 does not require Caldera; the simulator produces corpus rows, not executed attacks. Caldera remains L5 territory.

## Day-2 next steps

1. Grow the variant bank to ≥ 20 variants across ≥ 3 mutation axes.
2. Teach the simulator to randomise variant selection and skip recently-emitted ones.
3. Have Pair A plug the emitted corpus into the M2.1 evaluator.
4. Write the operational spec `frontier-simulator-spec.md`.
