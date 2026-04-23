# ARGUS variant bank — ATT&CK Evals Round 7 corpus (R1)

This subtree seeds `.soc-eval-corpus-argus-corpus-attack-er7` with a
labelled corpus derived from MITRE ATT&CK Evaluations Round 7. It sits
alongside the original `argus-corpus-mythos-2026-04` corpus so the
ARGUS Detection Eval Vertical can grade rules against **both**:

* `mythos-2026-04` — synthetic Mythos-era threat model
* `attack-er7`     — real APT kill-chain from ATT&CK Evals R7

## Layout

```
attack-er7/
├── README.md                     <- this file
├── T1190/axis-*.ndjson           <- Exploit Public-Facing Application
├── T1059.001/axis-*.ndjson       <- Command and Scripting Interpreter: PowerShell
├── T1569.002/axis-*.ndjson       <- System Services: Service Execution
└── _negatives/*.ndjson           <- labelled benign baseline
```

Every document carries an `_argus` envelope identical in shape to the
Mythos corpus:

```json
{
  "_argus": {
    "corpus_id": "argus-corpus-attack-er7",
    "primitive_id": "T1190",
    "variant_axis": "path_param",
    "variant_index": 0,
    "should_fire": true,
    "expected_rule_ids": ["argus.er7.t1190.exploit-web"],
    "mutation_axes": ["path_param"],
    "source": "attack-er7"
  }
}
```

## Regenerating / extending

This bank was hand-curated from publicly-documented ATT&CK Evaluations
Round 7 procedure steps. The goal is **three diverse variants per
primitive, across at least two mutation axes**, matching the density of
the Mythos corpus. To add techniques:

1. Create `attack-er7/<technique-id>/axis-<axis-name>.ndjson`.
2. Stamp each doc with `_argus.corpus_id=argus-corpus-attack-er7` and
   realistic ECS fields (host, user, process, event).
3. Re-run `bash soc-simulation/setup.sh` — the setup script picks up
   the subtree automatically (see the two-level glob pattern in
   `setup.sh` around `argus-variant-bank`).
