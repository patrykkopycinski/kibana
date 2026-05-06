# M2.1 — Detection Rule Evaluator Contract

This scaffold is the TypeScript interface and corpus format that `@kbn/evals` plugs
into when running the `detection-rule-vertical` suite.

> **Reality check — 2026-04-17 (implementation start):** The original draft below
> assumed a `KbnEvaluator<Input, Output>` / `defineSuite` API that does not exist
> in `@kbn/evals`. The real framework is Playwright-driven: evaluation suites
> ship as standalone packages under `x-pack/solutions/security/packages/kbn-evals-suite-<name>/`,
> following the pattern set by `kbn-evals-suite-security-ai-rules`. Evaluators
> implement the `Evaluator<Example, TaskOutput>` shape from `@kbn/evals`
> (`{ name, kind: 'CODE' | 'LLM', evaluate(params) => Promise<EvaluationResult> }`)
> and are composed into a `runExperiment({ dataset, task }, evaluators)` call
> via the `executorClient` worker fixture. Sections 1 + 4 below describe the
> *intent*; the authoritative skeleton code lives in the Day-1 checklist
> (`../kickoff/day-1-m2-1.md`) and the shipped package itself.

All code paths below live under:

```
# REVISED LAYOUT (2026-04-17) — replaces the earlier plugin-internal layout:
x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/
  package.json
  kibana.jsonc                        # type: functional-tests
  tsconfig.json
  moon.yml                            # generated
  playwright.config.ts                # createPlaywrightEvalsConfig
  src/
    evaluate.ts                       # extends base evaluate fixture
    evaluate_dataset.ts               # corpus-replay task + CODE evaluators
    replay_rule.ts                    # invokes Security Solution rule runner
  evals/
    detection_rule_vertical.spec.ts   # evaluate.describe / evaluate(...)
  datasets/
    mythos_corpus_2026_04/
      index.ts                        # exports Example[] for the suite
      primitives.json                 # {technique_id → variants} index
      events/<primitive>/<variant>.ndjson
      expected_fires.json
  README.md
```

The runtime glue is owned by ARGUS; the *harness* (scheduling, retries, score
aggregation, snapshots) is owned by `@kbn/evals`.

## 1. Evaluator interface (revised 2026-04-17)

The real `@kbn/evals` `Evaluator` shape is a flat `{ name, kind, evaluate }` object
operating on an `Example` / `TaskOutput` pair. The ARGUS detection vertical
ships **four `CODE`-kind evaluators** that each score one dimension of the same
`DetectionRuleTaskOutput`:

```ts
// x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/src/evaluate_dataset.ts
import type { Evaluator, Example, EvaluationResult } from '@kbn/evals';

export interface DetectionRuleExampleInput {
  rule_id: string;
  rule_version: string;
  corpus_id: string;
  primitive_id: string;          // e.g. "T1003.001"
  variant_index: number;         // 0..N within the primitive
}

export interface DetectionRuleExpected {
  should_fire: boolean;
  expected_rule_ids: string[];   // any_of semantics
  mutation_axes: string[];       // axes exercised by this variant
}

export type DetectionRuleExample = Example<
  DetectionRuleExampleInput,
  DetectionRuleExpected,
  { primitive_id: string; variant_index: number } | null
>;

export interface DetectionRuleTaskOutput {
  observed_fire: boolean;
  observed_rule_ids: string[];
  replay_error?: string;
  signals_produced: number;
}

export const precisionEvaluator: Evaluator<DetectionRuleExample, DetectionRuleTaskOutput> = {
  name: 'Precision',
  kind: 'CODE',
  async evaluate({ output, expected }): Promise<EvaluationResult> {
    // score = 1 when observed_fire ⇒ expected_rule_ids ∩ observed_rule_ids ≠ ∅;
    //          0 when observed_fire but ∅ overlap; null when !observed_fire.
    throw new Error('NotImplemented: precisionEvaluator — day-1 skeleton');
  },
};
// + recallEvaluator, fpRateBaselineEvaluator, variantCoverageEvaluator
```

The `gate_decision` (`pass | fail | marginal`) is no longer an evaluator output —
it is computed *outside* the evaluators by the M2.1 spec's `onEvaluationComplete`
hook, which aggregates the four scores per `rule_id+corpus_id+run_id` tuple and
writes one row to `.soc_detection_eval-runs`.

## 2. Gate thresholds

Frontier-tier gating is the *default* when the source recommendation carries
`argus.origin = exploit_to_detection`:

| Metric | Pass | Fail | Otherwise |
|---|---|---|---|
| precision | ≥ 0.90 | < 0.70 | marginal |
| recall | ≥ 0.80 | < 0.50 | marginal |
| fp_rate_baseline | ≤ 0.02 | > 0.10 | marginal |
| variant_coverage | ≥ 0.70 | < 0.50 | marginal |

Trusted-tier (non-frontier) runs use the thresholds in
`phase-3/trust-thresholds.md`.

## 3. Corpus format

`eval_corpus/<corpus_id>/corpus.json`:

```json
{
  "corpus_id": "argus-corpus-mythos-2026-04",
  "version": "1.0.0",
  "created_at": "...",
  "description": "Seed corpus for ARGUS Detection Eval Vertical covering Scenario 1/2/3 rules.",
  "primitives": [
    {
      "technique_id": "T1003.001",
      "rule_ids_expected_to_fire": ["mythos.cred-dumping.lsass"],
      "variant_axes": ["command_args", "encoding_layers", "process_ancestry"],
      "variant_count": 30
    }
  ]
}
```

`eval_corpus/<corpus_id>/events/T1003.001/v000.ndjson`: one NDJSON event per line,
each a valid ECS-mapped document the rule would see in production, plus an
`_argus.variant_axis` + `_argus.variant_index` pair for downstream labelling. The
evaluator strips `_argus.*` before replay.

`eval_corpus/<corpus_id>/expected_fires.json`:

```json
{
  "T1003.001": {
    "any_of": ["mythos.cred-dumping.lsass", "mythos.cred-dumping.minidump"],
    "min_fires": 28,
    "max_fires": 30
  }
}
```

## 4. Suite definition (revised 2026-04-17)

There is no `defineSuite` in `@kbn/evals`. The suite is a Playwright spec that
composes dataset + task + evaluators via the `executorClient` worker fixture
(mirrors `kbn-evals-suite-security-ai-rules/evals/rule_generation.spec.ts`):

```ts
// evals/detection_rule_vertical.spec.ts
import { tags } from '@kbn/scout';
import { evaluate } from '../src/evaluate';
import { createEvaluateDetectionRules } from '../src/evaluate_dataset';
import { mythosCorpus2026_04 } from '../datasets/mythos_corpus_2026_04';

evaluate.describe(
  'ARGUS Detection Eval Vertical',
  { tag: tags.serverless.security.complete },
  () => {
    evaluate(
      'scores rules against the Mythos-era corpus',
      async ({ executorClient, evaluators, replayClient, log }) => {
        const run = createEvaluateDetectionRules({ executorClient, evaluators, replayClient, log });
        await run({ dataset: mythosCorpus2026_04 });
      }
    );
  }
);
```

The `replayClient` worker fixture (defined in `src/evaluate.ts`) is what invokes
the Security Solution detection engine to produce the `DetectionRuleTaskOutput`
for one `(rule_id, corpus event)` pair. It owns the call into the existing
rule-runner — no new server-side route required for M2.1.

## 5. Side-channel persistence

Scoring summaries are written to `.soc_detection_eval-runs` from the spec's
`onEvaluationComplete` fixture. The `soc_detection_eval.yaml` workflow is
repositioned (M2.1 phase 2) as a **poller** of that index, not a trigger of
the suite. This keeps the eval harness as the source of truth for scoring and
the workflow as the source of truth for downstream propagation (regression-gate,
mutation-lineage).

## 6. Minimum reviewable deliverable (Day-1)

Files expected to exist and compile on Day-1:

- `x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/package.json`
- `.../kibana.jsonc`
- `.../tsconfig.json`
- `.../moon.yml`
- `.../playwright.config.ts`
- `.../src/evaluate.ts`
- `.../src/evaluate_dataset.ts` (exports `createEvaluateDetectionRules` + 4 evaluators that throw `NotImplemented`)
- `.../evals/detection_rule_vertical.spec.ts` (one `evaluate(...)` block)
- `.../datasets/mythos_corpus_2026_04/index.ts` (one primitive × one variant seed)
- Entry in `tsconfig.base.json` + root `package.json`

Minimum to be considered done (exit criteria):

1. Scoped type check passes: `node scripts/type_check --project x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/tsconfig.json`
2. Suite runs (locally, with a connector) and reports one failed evaluation due
   to the `NotImplemented` task — confirming the harness is wired correctly.
