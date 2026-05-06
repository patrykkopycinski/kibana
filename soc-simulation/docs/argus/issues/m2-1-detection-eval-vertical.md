# M2.1 — Detection Eval Vertical

**ARGUS layer:** 03 Validation · **Pressure:** P2 variant explosion · **Extends:** [`elastic/security-team#16546`][s1] (Unified Skill Evaluation Platform)

## Context

[`security-team#16546`][s1] delivers a unified evaluation platform via `@kbn/evals` +
AESOP. That platform is skill-agnostic — it evaluates arbitrary skill input/output pairs.
ARGUS depends on a **specialised vertical** that understands detection rules as the unit
of evaluation: a rule fires or does not fire against a labelled telemetry set, and is
scored on precision, recall, FP rate on a 30-day baseline, and stability under
adversarial mutation.

This sub-issue lands that vertical. It is deliberately a thin layer on top of the
existing platform — no parallel harness, no parallel data model, no parallel UI.

[s1]: https://github.com/elastic/security-team/issues/16546

## Goal

A reviewer can run `@kbn/evals` against a labelled Mythos-era attack corpus and get back
a scorecard with four numbers per detection-rule candidate:

- Precision (1 − FP / total fires)
- Recall (TP fires / total true positives in the corpus)
- FP rate on a 30-day clean baseline
- Variant coverage (mythos-class polymorphism corpus, M2.4)

…plus a `snapshot_id` that any future rule change can be regression-tested against.

## Scope

### In scope

- `soc_detection_eval` workflow (ARGUS-owned) that composes an existing `@kbn/evals`
  suite and pipes results into `.soc_detection_eval-runs`.
- Evaluator contract: `detection_rule_evaluator.ts` implementing the standard
  `@kbn/evals` evaluator interface, reading rule metadata from
  `.kibana-security-solution-rules` and labelled events from
  `.soc-eval-corpus-*` (new index pattern).
- Corpus format spec: `corpus-format.md` describing labelled event documents and
  expected-fire metadata.
- Regression affordance: every `.soc-backtests` row gets a paired
  `.soc_detection_eval-runs` row for cross-comparison.
- Dashboard panel under Security Solution → ARGUS → "Detection Eval Scorecard."

### Out of scope

- New eval orchestration infra (use `@kbn/evals`).
- Non-rule artefact evaluation (skills, agents — already covered by `#16546`).
- Real-time eval during rule authoring (Phase 3).

## Acceptance criteria

- [ ] `@kbn/evals` suite `detection-rule-vertical.evals.ts` exists and runs in CI.
- [ ] A minimum 3-rule corpus (one per Scenario 1/2/3 in the demo storyboard) is
      checked in under `x-pack/solutions/security/plugins/security_solution/server/lib/argus/eval_corpus/`.
- [ ] Running the suite produces `.soc_detection_eval-runs` rows with all four scoring
      fields populated and a stable `snapshot_id`.
- [ ] `soc_detection_eval` workflow is registered in `_registry.json` and passes
      setup-verification.
- [ ] A failing eval **blocks** apply via `soc_regression_gate` — the existing gate
      consumes `.soc_detection_eval-runs` as one of its signals.
- [ ] Dashboard panel renders against the staged cluster with at least one run visible.

## Data model

`.soc_detection_eval-runs` row (minimum):

```json
{
  "@timestamp": "...",
  "run_id": "argus-eval-<uuid>",
  "rule_id": "<detection-rule-id>",
  "rule_version": "<from .kibana-security-solution-rules>",
  "corpus_id": "argus-corpus-mythos-2026-04",
  "snapshot_id": "<eval-platform-snapshot-id>",
  "scores": {
    "precision": 0.0,
    "recall": 0.0,
    "fp_rate_baseline": 0.0,
    "variant_coverage": 0.0
  },
  "expected_fires": 0,
  "observed_fires": 0,
  "mutation_axis_breakdown": { "command_args": 0.0, "encoding_layers": 0.0 },
  "gate_decision": "pass|fail|marginal",
  "adversarial_inputs": ["<doc-id>", "..."]
}
```

## Phases

1. **Corpus bootstrapping** (1 wk): codify corpus format, seed 3 rules × 30 events each.
2. **Evaluator implementation** (1 wk): `detection_rule_evaluator.ts` + unit tests.
3. **Workflow + registry wiring** (0.5 wk): `soc_detection_eval.yaml`, registry entry,
   setup-verify assertions.
4. **Regression-gate integration** (0.5 wk): teach `soc_regression_gate` to consume
   `.soc_detection_eval-runs` alongside `.soc-regression-runs`.
5. **Dashboard panel** (0.5 wk): ARGUS → Detection Eval Scorecard.

Est. total: 3.5 weeks.

## Non-goals

- Replacing `@kbn/evals` — this is a **vertical**, not a parallel platform.
- Running evals on every alert in real time — that's a future optimisation.
- Automatically generating corpus — M2.2 (Exploit-to-Detection) and M2.4 (Frontier
  Simulator) produce corpora; this milestone only needs the data-model contract.

## Links

- Anchor: [`security-team#16546`][s1]
- ARGUS threat model: `../threat-model.html`
- ARGUS capability map: `../capability-map.md`
- Scaffold workflow: `../../workflows/soc_detection_eval.yaml` (lands in this milestone)
