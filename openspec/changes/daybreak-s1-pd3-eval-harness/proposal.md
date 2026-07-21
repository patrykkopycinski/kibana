---
change_id: notdaybreak-s1-eval-harness
status: draft
created_at: 2026-07-09
treadmill_artifact_version: 1
feature_id: f943d973-90ab-4834-8e7f-d7fed23afe31
feature_slug: daybreak-s1-alert-analysis-worker-spike
---

# PD-3: Eval Harness — @kbn/evals Offline Dataset Gate + Live UI-Journey Gate

## Why

PD-2 (completed, 13/13 tasks) delivered the real 5-phase Setup/Guard/Enrich/Reason/Act worker
(`server/workflow/alert_analysis_worker.yaml`), the Evidence/Proposals client stores, the minimal
Agent Builder agent (`ensureAlertAnalysisAgent` scoped to the `alert-analysis` skill), and an
output-validation guard step — all committed on the `daybreak-spike` branch.

PD-3 proves that worker actually produces correct Proposals against real alert data. Per the
shape session reconciliation, PD-3 covers FR-8 (offline dataset gate), FR-9 (live UI-journey gate),
FR-10/A-3 (deliberately-broken golden variant proving non-vacuous gates), and A-4 (retry/backoff
for connector flakiness).

## What Changes

- Add an `@kbn/evals` offline dataset gate for `alert_analysis_worker`: a golden dataset of seeded
  alerts + expected Proposal shape, scored via `@kbn/evals` primitives (reuse the framework).
- Add a deliberately-broken golden variant (one row with wrong expected Proposal) asserting the gate
  fails on it — FR-10/A-3 non-vacuous proof.
- Add retry/backoff for the Reason phase `ai.agent` calls: grep the workflow engine for existing
  step-level retry config first and reuse rather than hand-rolling.
- Add a live UI-journey gate (FR-9): a Playwright/Scout test booting the dev stack, seeding one
  alert, triggering the workflow, and asserting on real DOM state via role/label/text locators with
  state-based waits. Interim proxy: assert against API/ES document if no UI panel exists yet.
- Add an eval-report artifact (JSON or markdown) at a path PD-5 can reference.
- Update `server/workflow/README.md` documenting the two-gate architecture.

## Impact

- All new code under existing `daybreak` plugin and existing `@kbn/evals` package — no new plugin.
- Gated behind `xpack.daybreak.enabled` (default false) — no new flag.
- Executed on M1 Max `daybreak-spike` worktree.

## Definition of Done

- Offline dataset gate runs with broken row, broken row failure asserted.
- Retry/backoff wired via existing engine config (cited file:line) or scoped out with reasoning.
- Playwright/Scout UI-journey or interim API proxy test exists, seeds alert, triggers workflow,
  asserts Proposal.
- Eval-report artifact written to discoverable path.
- jest + type_check pass clean on M1 Max.
