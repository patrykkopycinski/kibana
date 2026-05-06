# @kbn/evals-suite-argus-detection

ARGUS Detection Eval Vertical — evaluation suite for Security Solution detection
rules under the Mythos-era threat model.

**Owner:** `@elastic/security-detection-engine`  
**Milestone:** [security-team#16904 — ARGUS M2.1 Detection Eval Vertical][issue]  
**Spec:** `soc-simulation/docs/argus/issues/m2-1-detection-eval-vertical.md`  
**Scaffold:** `soc-simulation/docs/argus/scaffolds/m2-1-detection-rule-evaluator.md`

[issue]: https://github.com/elastic/security-team/issues/16904

## What this suite does

Scores candidate detection rules against a labelled corpus of Mythos-era attack
events across four dimensions:

| Evaluator             | Kind  | What it scores                                                                 |
| --------------------- | ----- | ------------------------------------------------------------------------------ |
| `Precision`           | CODE  | When the rule fires, does any expected rule-id overlap with observed rule-ids? |
| `Recall`              | CODE  | Out of examples that *should* fire, how many did?                              |
| `FP Rate (baseline)`  | CODE  | FP rate on the negative/background subset of the corpus.                       |
| `Variant Coverage`    | CODE  | Fraction of variants per primitive that were caught by the rule.               |

The four evaluators feed into a gate decision (`pass` / `fail` / `marginal`)
computed by the suite's `onEvaluationComplete` hook and persisted to
`.soc-argus-eval-runs` with `run_kind=detection`. The `soc_detection_eval.yaml` workflow polls that
index and propagates pass/fail signals to the ARGUS regression gate.

## Structure

```
.
├── datasets/
│   └── mythos_corpus_2026_04.ts    Seed labelled corpus (Mythos-era)
├── evals/
│   └── detection_rule_vertical.spec.ts
├── src/
│   ├── evaluate.ts                 Playwright fixture extension (+ replayClient)
│   ├── evaluate_dataset.ts         Evaluators + runner
│   └── replay_rule.ts              Seam to the Security Solution rule runner
├── kibana.jsonc
├── package.json
├── playwright.config.ts
├── moon.yml
└── tsconfig.json
```

## Running locally

```bash
# One-time bootstrap after pulling the branch that adds this package.
yarn kbn bootstrap

# Execute the suite (requires a running Kibana + connector).
node scripts/scout \
  --config x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/playwright.config.ts
```

## Day-1 status (2026-04-17)

Skeleton only. Every `evaluate()` callback throws `NotImplemented` — the
deliberate signal that the wiring is real but the logic is deferred to Phase 2
of the milestone issue. See
`soc-simulation/docs/argus/kickoff/day-1-m2-1.md` for the continuation plan.
