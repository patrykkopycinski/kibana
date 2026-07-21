---
change_id: pd-1-workflow-engine-shape-validation-spike
status: draft
created_at: 2026-07-08
treadmill_artifact_version: 1
feature_id: f943d973-90ab-4834-8e7f-d7fed23afe31
feature_slug: daybreak-s1-alert-analysis-worker-spike
---
# PD-1: Unknown-Flushing Spike — Kibana Workflow Engine Shape Validation (NotDaybreak S1)

## Why
A-2 is the #1 unknown to flush before any real worker investment: does the Kibana Workflow engine support the exact step shape the NotDaybreak Alert-Analysis worker needs — HTTP fetch + conditional guard + AI invocation with structured output (PD-1)? If the engine cannot express that shape, the entire S1 spike is blocked and an alternative substrate must be found before PD-2 (the real 5-phase worker, FR-1) is built. This spike validates that in the smallest possible end-to-end slice: a trivial workflow with the three critical step types, run once to completion, flushing the integration unknowns (connector wiring, step schema, execution API) early.

## What Changes
- Add a minimal experimental Kibana workflow definition (HTTP fetch step + conditional guard step + stub AI invocation step with structured JSON output) under `x-pack/solutions/security/plugins/daybreak/server/workflow/`, gated behind the existing `daybreak` experimental feature flag (PD-1, NFR-2).
- Add a minimal workflow runner/executor invocation that triggers the workflow once end-to-end and logs each step's input/output (PD-1).
- Add a single integration test, `workflow_engine_shape.test.ts`, that executes the workflow and asserts each step type produces the expected structured output shape (PD-1).
- Add a README under the workflow directory documenting what was validated and any engine limitations discovered (PD-1).

## Impact
- Introduces new code under `x-pack/solutions/security/plugins/daybreak/server/workflow/`; this is a capability-validation spike only — no changes to existing worker behavior.
- Validates (or redirects) the substrate for the downstream PD-2 worker build (FR-1) and the broader S1 spike.
- Gated behind the `daybreak` experimental flag, default off — safe to merge mid-spike (NFR-2).
- Executed entirely on the i9 daybreak-spike worktree (`kibana.worktrees/daybreak-spike`), not the main checkout (NFR-1).

## Open Questions
- If validation shows the engine cannot express the shape, what is the fallback substrate? Custom orchestration was flagged as a candidate fallback during shaping; the design must fix that decision before PD-2 begins. (Forward: design)
- Should the stub AI step mirror a real Agent Builder connector shape now so PD-2 reuse is clean, or stay a pure stub (deferred to PD-2)? This is the leading edge of the A-1 wiring unknown. (Forward: design)

## Suggested Enhancements (not in original description)
- **(suggested, not in original description)** Pre-stage a one-paragraph sketch of the custom-orchestration fallback in the README, so if the engine fails validation the team can pivot immediately rather than re-plan from a cold start.
