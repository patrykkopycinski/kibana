# Argus demo datasets

Single source of truth for the three demo scenarios described in
`soc-simulation/docs/argus/demo-storyboard.md`.

Each subdirectory holds the **minimum set of fixtures** needed to drive the
scenario end-to-end against a live cluster. Wherever possible we reference the
canonical data already baked into the Argus packages / variant bank rather
than duplicating it — duplication drifts.

| Scenario | Pressure | Milestone(s) | Driver |
|----------|----------|-------------|--------|
| 1. Same-day CVE → detection | P1 (speed)    | M2.2 + M2.3 | `workflows/soc-demo-1-runner.yaml` |
| 2. Polymorphic variant swarm | P2 (variety)  | M2.1 + M2.2 | `workflows/soc-demo-2-runner.yaml` |
| 3. Frontier-class intrusion  | P3 (reasoning)| M2.4 + M2.5 | **out of scope of this tree** — see scenario-3-frontier/README.md |

## Driving a scenario

Scenarios 1 and 2 are designed to run from **either** the Kibana Workflows
runtime (when exposed) **or** their CLI counterparts. The CLI path is the
reference, because it is what the validation docs under
`soc-simulation/docs/argus/proof/` exercise.

### Scenario 1 — same-day CVE

```sh
# Advisory + draft rule + variants + mutation_intent recommendation
node x-pack/solutions/security/packages/kbn-argus-exploit-to-detection/scripts/run_exploit_to_detection.js \
  --advisory argus-adv-lsass-dump-2026-04

# Then grade the draft rule against the corpus
node x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/scripts/run_detection_eval.js
```

Expected artefacts in the cluster afterwards:
- `.soc-cve-advisories/_doc/argus-adv-lsass-dump-2026-04` (status=`detected`)
- `.soc-eval-corpus-argus-adv-lsass-dump-2026-04/_count ≥ 10`
- `.soc-recommendations` — one doc with `argus.origin=exploit_to_detection`
- `.soc-detection-eval-runs` — one run row per graded rule

### Scenario 2 — polymorphic variant swarm

The variant corpus is pre-seeded by `soc-simulation/setup.sh` from
`soc-simulation/scripts/argus-variant-bank/` (technique-keyed NDJSON). The
demo grades the `MYTHOS_DETECTION_RULES` pack against all variants and
writes per-rule gate decisions.

```sh
node x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/scripts/run_detection_eval.js
```

### Scenario 3 — frontier-class intrusion

This scenario depends on M2.4 (preset arming) + M2.5 (reasoning
watchdog/rollback) milestones. Only the preset-arming surface
(`workflows/soc-argus-arm-mythos-preset.yaml`,
`workflows/soc-argus-frontier-simulator.yaml`) is validated today; see
`scenario-3-frontier/README.md` for the gap list.

## Data-freshness discipline

- Advisory fixtures are mirrored from
  `x-pack/solutions/security/packages/kbn-argus-exploit-to-detection/advisory_fixtures.ts`.
  If they drift, the `ARGUS_DEMO_ADVISORIES` module wins.
- Variant bank on disk lives in
  `soc-simulation/scripts/argus-variant-bank/<technique_id>/axis-*.ndjson`.
  If you need new variants, add them there — **not** in this tree.
- Expected recommendation / rule shapes are snapshots produced by the CLIs
  above at the time of the demo recording. Re-regenerate them whenever the
  synthesizer or `buildMutationIntent` evolves.
