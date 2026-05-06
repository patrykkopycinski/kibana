# M2.1 — Day 1 Checklist

**Milestone:** Detection Eval Vertical  
**Spec:** [`../issues/m2-1-detection-eval-vertical.md`](../issues/m2-1-detection-eval-vertical.md) · [`../scaffolds/m2-1-detection-rule-evaluator.md`](../scaffolds/m2-1-detection-rule-evaluator.md)  
**Pair owner:** Eval (Pair A)  
**Target Day-1 outcome:** skeleton package compiles, draft PR open against `main`, CI green.

> **Reality-check revision — 2026-04-17.** The first draft of this checklist
> assumed the evaluator would live in the Security Solution plugin. The real
> `@kbn/evals` framework expects a **Playwright-driven suite package** sibling
> to `@kbn/evals-suite-security-ai-rules`. The skeleton and all paths below
> have been rewritten accordingly. If you started against the previous draft,
> stop — the server-side route + `KbnEvaluator<I,O>` / `defineSuite` APIs do
> not exist.

## Before you touch code

- [ ] Read the issue body end-to-end.
- [ ] Read the scaffold. Copy the 4-evaluator `Evaluator<Example, TaskOutput>` block into your working buffer.
- [ ] Pattern-match against `x-pack/solutions/security/packages/kbn-evals-suite-security-ai-rules/` — it is the closest sibling and the style reference for every file you create.
- [ ] Run the Phase 1 baseline smoke (`setup.sh` + arm-mythos workflow) against the staged cluster.

## Files to create

All paths relative to repo root.

```
x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/
  package.json                            # @kbn/evals-suite-argus-detection
  kibana.jsonc                            # type: functional-tests
  tsconfig.json                           # extends @kbn/tsconfig-base, kbn_references
  moon.yml                                # generated — copy the sibling pattern
  playwright.config.ts                    # createPlaywrightEvalsConfig
  src/
    evaluate.ts                           # evaluate = base.extend(...) with replayClient
    evaluate_dataset.ts                   # 4 evaluators + createEvaluateDetectionRules
    replay_rule.ts                        # stub: invokes rule runner
  evals/
    detection_rule_vertical.spec.ts       # single evaluate(...) block
  datasets/
    mythos_corpus_2026_04/
      index.ts                            # exports Example[] ready for the suite
      primitives.json
      events/T1003.001/v000.ndjson
      expected_fires.json
  README.md
```

Two additional registration edits — **do not skip these, the type_check depends on them**:

```
tsconfig.base.json          # add "@kbn/evals-suite-argus-detection" + "/*" paths
package.json                # add "@kbn/evals-suite-argus-detection" link entry
```

## First-commit skeleton (copy-paste)

`package.json`:

```json
{
  "name": "@kbn/evals-suite-argus-detection",
  "private": true,
  "version": "1.0.0",
  "license": "Elastic License 2.0"
}
```

`kibana.jsonc`:

```jsonc
{
  "type": "functional-tests",
  "id": "@kbn/evals-suite-argus-detection",
  "owner": "@elastic/security-detection-engine",
  "group": "security",
  "visibility": "private"
}
```

`tsconfig.json`:

```json
{
  "extends": "@kbn/tsconfig-base/tsconfig.json",
  "compilerOptions": { "outDir": "target/types" },
  "include": ["**/*.ts"],
  "exclude": ["target/**/*"],
  "kbn_references": ["@kbn/evals", "@kbn/scout", "@kbn/tooling-log"]
}
```

`src/evaluate_dataset.ts` (skeleton showing all four evaluators and the task-runner shape):

```ts
import type {
  DefaultEvaluators,
  EvalsExecutorClient,
  Evaluator,
  Example,
  EvaluationResult,
} from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';

export interface DetectionRuleExampleInput {
  rule_id: string;
  rule_version: string;
  corpus_id: string;
  primitive_id: string;
  variant_index: number;
}

export interface DetectionRuleExpected {
  should_fire: boolean;
  expected_rule_ids: string[];
  mutation_axes: string[];
}

export type DetectionRuleExample = Example<
  DetectionRuleExampleInput,
  DetectionRuleExpected,
  { primitive_id: string; variant_index: number } | null
>;

export interface DetectionRuleTaskOutput {
  observed_fire: boolean;
  observed_rule_ids: string[];
  signals_produced: number;
  replay_error?: string;
}

const notImplemented = (name: string): Evaluator<DetectionRuleExample, DetectionRuleTaskOutput> => ({
  name,
  kind: 'CODE',
  async evaluate(): Promise<EvaluationResult> {
    throw new Error(`NotImplemented: ${name} — M2.1 day-1 skeleton`);
  },
});

export const precisionEvaluator = notImplemented('Precision');
export const recallEvaluator = notImplemented('Recall');
export const fpRateBaselineEvaluator = notImplemented('FP Rate (baseline)');
export const variantCoverageEvaluator = notImplemented('Variant Coverage');

export interface CreateEvaluateDetectionRulesDeps {
  executorClient: EvalsExecutorClient;
  evaluators: DefaultEvaluators;
  log: ToolingLog;
}

export function createEvaluateDetectionRules(_deps: CreateEvaluateDetectionRulesDeps) {
  return async (_args: { dataset: { name: string; description: string; examples: DetectionRuleExample[] } }): Promise<void> => {
    throw new Error('NotImplemented: createEvaluateDetectionRules — M2.1 day-1 skeleton');
  };
}
```

## Registration edits

`tsconfig.base.json` (alphabetical, right after `@kbn/evals-suite-agent-builder` or the nearest lexical neighbour):

```jsonc
"@kbn/evals-suite-argus-detection": ["x-pack/solutions/security/packages/kbn-evals-suite-argus-detection"],
"@kbn/evals-suite-argus-detection/*": ["x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/*"],
```

Root `package.json` (alphabetical within `dependencies`):

```json
"@kbn/evals-suite-argus-detection": "link:x-pack/solutions/security/packages/kbn-evals-suite-argus-detection",
```

After this edit: `yarn kbn bootstrap` (required once locally; CI runs its own).

## Validate before pushing

```bash
node scripts/eslint --fix $(git diff --name-only HEAD)
node scripts/type_check --project x-pack/solutions/security/packages/kbn-evals-suite-argus-detection/tsconfig.json
```

Expected: lint and type_check pass. There is no Jest test on Day-1 — the
deliberate failure signal is the `NotImplemented` throw from the suite spec,
which surfaces the first time someone runs the Playwright suite locally with
`node scripts/scout --config .../playwright.config.ts`.

## You are not stuck if…

- The `evaluate()` implementations throw — that's the skeleton marker; implementation is Phase 2 of the milestone issue.
- `tsconfig.type_check.json` doesn't exist yet for your new package — the first invocation of `node scripts/type_check --project <new>/tsconfig.json` generates it.
- `@kbn/evals` types don't resolve until you've re-bootstrapped — run `yarn kbn bootstrap` after adding the `tsconfig.base.json` + root `package.json` entries.

## Day-2 next steps (for continuity)

1. Implement `replay_rule.ts` against a mocked Detection Engine rule runner — return deterministic fires/no-fires.
2. Replace the mock with the real rule runner wiring (Detection Engine + Scout fixture).
3. Add the `onEvaluationComplete` hook that writes per-`(rule_id, run_id)` summaries to `.soc_detection_eval-runs`.
4. Reposition `workflows/soc_detection_eval.yaml` as a poller of `.soc_detection_eval-runs` (it currently assumes a synchronous POST route — update the description + remove the `kibana.request` step).
5. Hand the `DetectionRuleTaskOutput` contract to Pair B so M2.2 can plug its synthesized rules straight into the same evaluator set.
