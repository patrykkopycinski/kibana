# ARGUS Variant Bank

The on-disk variant bank that feeds the ARGUS **Frontier Simulator** (M2.4) and,
downstream, the Detection Eval Vertical (M2.1). Each variant is a single
Mythos-era primitive rendered as a labelled ECS-ish document that the simulator
indexes into `.soc-eval-corpus-<corpus_id>`.

## Layout

```
argus-variant-bank/
  <primitive_id>/                    # e.g. T1003.001
    axis-<mutation_axis>.ndjson      # one JSON doc per line, one per variant
  README.md                          # this file
```

The axis files are plain NDJSON — one variant per line. Each variant MUST
carry an `_argus` envelope so the M2.1 evaluator can strip labels before
replay:

```jsonc
{
  "_argus": {
    "corpus_id": "argus-corpus-mythos-2026-04",
    "primitive_id": "T1003.001",
    "variant_axis": "command_args",
    "variant_index": 0,
    "should_fire": true,
    "expected_rule_ids": ["mythos.cred-dumping.lsass"],
    "mutation_axes": ["command_args"]
  },
  "process": { ... },
  "event":   { ... }
}
```

## Mutation axes (Mythos-era)

Per the level-6 profile's `argus_metadata.polymorphism_axes`:

| Axis              | What the simulator varies                                                      |
| ----------------- | ------------------------------------------------------------------------------ |
| `command_args`    | Same binary, mutated argv ordering / obfuscation / aliases.                    |
| `process_ancestry`| Same leaf primitive, different parent/grandparent (e.g. svchost vs explorer).  |
| `encoding_layers` | Wrapping in base64, XOR, PowerShell `-enc`, AMSI bypass stacks.                |
| `timing_jitter`   | Sub-second inter-event gaps to stress time-windowed rules.                     |
| `living_off_land` | Swap primitive binary for LOLBAS equivalent (e.g. certutil → bitsadmin).       |

Day-1 ships one hand-crafted variant under `T1003.001/axis-command_args.ndjson`
with a placeholder for `axis-encoding_layers.ndjson`. Phase 2 of
`issues/m2-4-frontier-simulation.md` grows this to >=20 variants across >=3
axes per primitive and adds T1059.001 (PowerShell abuse) and T1071.004
(DNS C2).

## Relationship to Caldera

The variant bank is **not** a Caldera profile. Caldera (L5) emulates real
attack execution against the lab fleet; the variant bank feeds a
deterministic, replay-only corpus so the Detection Eval Vertical can score
rule candidates without network side-effects. The two sources complement each
other: Caldera produces organic telemetry on the hot path; the simulator
produces labelled corpus rows on the eval path.
