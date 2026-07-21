# PD-3 Design — Eval Harness

## Architecture

Two gates, run independently:

1. **Offline Dataset Gate** (`@kbn/evals`)
   - Golden dataset of seeded alerts → expected Proposal shape
   - Scored via `@kbn/evals` dataset/scorer primitives (reuse, don't hand-roll)
   - Includes deliberately-broken row proving the gate is non-vacuous (FR-10/A-3)

2. **Live UI-Journey Gate** (Playwright/Scout integration test)
   - Boots dev stack, seeds alert, triggers workflow, asserts Proposal
   - Interim: API/ES-document proxy if no UI panel yet (PD-4 owns the panel)

## Retry/Backoff (A-4)

The workflow engine may or may not expose step-level retry config. The task sequence
resolves this: task 0-1 greps the engine source and cites the finding. If available,
the YAML is updated to use the engine primitive. If not, a thin retry wrapper is added
to `run_alert_analysis_worker.ts` with exponential backoff (2 retries, 5s/15s).

## Constraints

- No new plugin, package, or eval framework — reuse `@kbn/evals`
- No new feature flag — `xpack.daybreak.enabled` suffices
- No hand-rolled retry if the engine exposes it
