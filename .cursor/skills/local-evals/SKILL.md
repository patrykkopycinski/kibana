---
name: local-evals
description: Run Kibana eval suites locally against OSS models, benchmark models for quality and speed, and manage the local model registry. Use when the user asks to "run local evals", "benchmark a model", "test locally", "use local model for evals", "list local models", or mentions Ollama/LM Studio in the context of evals.
---

# Local Evals Skill

Run `@kbn/evals` suites locally against OSS models (Ollama/LM Studio) before pushing to CI.

## Prerequisites

- Ollama installed (`brew install ollama`) or LM Studio running
- Node.js and Kibana dev environment bootstrapped

## Workflow 1: Run Local Evals

When the user wants to run evals locally against a local model:

1. Check what's currently running:
   ```bash
   node scripts/evals local --list-models
   ```

2. If a model is already loaded in Ollama (`ollama ps`), tell the user and evaluate whether it's adequate:
   - **Adequate** (tool calling works + fair+ judge quality): Run directly
   - **Better available**: Inform user, suggest `--model <better-id>`
   - **Inadequate** (no tool calling): Suggest swapping or use `--code-only`

3. Run the eval suite:
   ```bash
   # Fully automatic (detects RAM, picks model)
   node scripts/evals local --suite <suite-name>

   # With specific model
   node scripts/evals local --suite <suite-name> --model qwen2.5-32b-instruct

   # CODE evaluators only (fast, no model quality dependency)
   node scripts/evals local --suite <suite-name> --code-only

   # Just validate model is ready (no eval run)
   node scripts/evals local --suite <suite-name> --validate-only

   # Keep model loaded for fast re-runs
   node scripts/evals local --suite <suite-name> --keep-loaded
   ```

4. Interpret results: compare pass/fail against CI expectations. Local thresholds are relaxed (0.8x multiplier).

## Workflow 2: Benchmark a Model

When the user wants to evaluate a new or existing model's quality:

1. Stash any uncommitted changes if working on a feature branch
2. Run the benchmark:
   ```bash
   # Single model
   node scripts/evals local benchmark --model <model-id-or-ollama-tag>

   # All models that fit this machine
   node scripts/evals local benchmark --all

   # With a specific eval suite (default: llm-tasks)
   node scripts/evals local benchmark --model <id> --suite agent-builder
   ```

3. Report results with comparison table
4. If user wants to share results with the team:
   ```bash
   node scripts/evals local benchmark --model <id> --update-registry --create-pr
   ```
   This creates a data-only PR with updated `models.json`, `RECOMMENDATIONS.md`, and benchmark result files.

5. Restore the user's original branch and unstash changes

## Workflow 3: Refresh All Recommendations

When the user wants to re-benchmark all models:

```bash
node scripts/evals local benchmark --all --update-registry
```

Then offer to create a PR with all updated data:
```bash
node scripts/evals local benchmark --all --update-registry --create-pr
```

## Workflow 4: Use Local Model for Any Eval

When the user wants to use their local model with an existing eval command:

1. Check if a runtime is running (`ollama ps` or probe localhost:1234)
2. If running with a model loaded:
   ```bash
   node scripts/evals run --suite <suite-name> --local
   ```
3. If not running or no model loaded:
   ```bash
   node scripts/evals local --suite <suite-name>
   ```

Additional flags for `--local`:
```bash
# Specify endpoint (e.g., LM Studio)
node scripts/evals run --suite <suite-name> --local --local-endpoint http://localhost:1234/v1

# Specify model name explicitly
node scripts/evals run --suite <suite-name> --local --local-model qwen2.5-32b-instruct
```

## Model Recommendations by RAM

| RAM | Model | Quality | Speed |
|-----|-------|---------|-------|
| 48GB+ | Qwen2.5-32B-Instruct | very-good | ~15 tok/s |
| 32GB | Mistral Small 3.1 24B | good | ~20 tok/s |
| 16GB | Qwen2.5-14B-Instruct | good | ~35 tok/s |
| Fallback | Qwen3-8B | fair | ~63 tok/s |

## Key Files

- Package: `x-pack/platform/packages/shared/kbn-evals-local/`
- Model catalog: `src/local/models.json`
- CLI entry: `src/cli/local.ts`
- Benchmark: `src/cli/benchmark.ts`
- Results: `benchmark-results/`
- Recommendations: `RECOMMENDATIONS.md`
