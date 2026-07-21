# PD-3 Spec — Eval Harness

## FR-8: Offline Dataset Gate

The `@kbn/evals` framework provides dataset and scorer primitives. The gate:
- Loads a golden dataset of alert evidence → expected Proposal shape
- Runs each row through the worker's reasoning logic
- Scores the actual Proposal against the expected shape
- Passes if all non-broken rows match; fails if the broken row does NOT fail

## FR-9: Live UI-Journey Gate

A Playwright/Scout integration test that exercises the full workflow against a live stack.
If no UI panel exists (PD-4 not yet delivered), asserts against the ES document directly.

## FR-10/A-3: Non-Vacuous Gate Proof

One dataset row has an intentionally wrong expected Proposal (flipped recommendation).
The gate MUST fail on this row, proving it catches real regressions.

## A-4: Retry/Backoff

Connector calls in the Reason phase must have retry/backoff to handle transient failures.
Prefer engine-native step retry config; fall back to a thin wrapper if unavailable.
