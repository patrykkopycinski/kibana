---
change_id: fpr-l4-evaluation-record-promotion-evidence
status: draft
created_at: 2026-07-11
treadmill_artifact_version: 1
feature_id: f943d973-90ab-4834-8e7f-d7fed23afe31
feature_slug: daybreak-s1-alert-analysis-worker-spike
---
# PD-5: False Positive Reduction L4 Evaluation Record and Promotion Evidence

## Why
The `daybreak-s1-alert-analysis-worker-spike` feature has already completed PD-1 workflow-engine validation, PD-2 the real five-phase Alert Analysis worker, PD-3 an `@kbn/evals` offline/live harness, and PD-4 the Throughline-aligned routes/UI. The remaining Evaluation & Trust bet is not another framework: prove one complete Alert Analysis / False Positive Reduction run through L0-L4, record the outcome in the existing `@kbn/evals` storage shape, and produce machine-readable promotion evidence. The canonical direction is in `docs/daybreak-worker-testing-pyramid.md` and the execution/profile contracts under `docs/working-groups/evaluation-trust/artifacts/`.

## What Changes
- Reuse and extend the PD-3 eval suite and existing daybreak plugin modules in place.
- Add the smallest concrete `WorkerEvaluationRecord` runtime type/serializer needed by this slice, based on the canonical schema sketch — not a competing generic platform record.
- Add a deterministic scorer with critical hard-gate dimensions (outcome correctness, action safety, idempotency, record coverage) and weighted dimensions (evidence completeness 0.4, confidence calibration 0.3, rationale/actionability 0.3), with the 0.80 weighted threshold marked explicitly proposed/unratified in report metadata.
- Persist/export the record through existing `@kbn/evals` dataset/experiment result metadata — no new Elasticsearch index, saved object, service, registry, package, or plugin.
- Build a versioned `fpr-golden-v0` seed manifest from existing PD-3 fixtures covering: benign expected behavior, insufficient/missing evidence, risky broad exception, duplicate/replay, malformed output, and a deliberately broken expected result — one canonical seed definition, no hand-duplicated demo data.
- Produce a scorecard/evidence artifact from a test run with capability/profile/dataset/model/worker provenance, dimension results, record/proposal counts, tokens/latency when trace data exists, and cost basis without guessed dollars.
- Keep the existing spike-local readiness gate explicit as temporary; it does not claim to prove shared #17944 behavior.

## Constraints
- Every task line in `tasks.md` must end with `@host:worker-m1max`.
- Work stays in the existing feature worktree and branch; feature flag remains default off.
- No symlinks; no new dependency.
- No forced `skill_ids` route in user-behavior evals — the default Elastic agent/router must select the skill naturally; isolation-only tests may remain as lower-layer diagnostics but cannot supply the promotion signal.
- Use deterministic evaluators wherever possible; if an LLM judge is needed for rationale quality, use one targeted judge for development, preserve judge identity, and do not add broad multi-judge fanout in this phase.
- All Jest invocations must include `--maxWorkers=4 --workerIdleMemoryLimit=512MB` or use `--runInBand`.

## Impact
- Daybreak worker eval suite (`@kbn/evals` FPR suite) — extended, not replaced.
- Daybreak plugin modules implementing the worker, Proposal/Evidence clients — extended in place.
- Existing `.evaluation-*` storage/result metadata surface — reused for record persistence.
- Documentation beside the implementation.

## Open Questions
- If existing `.evaluation-*` APIs cannot carry required metadata without speculative or private coupling, the kill/pivot path is a tested serializer/contract seam plus an explicit blocked integration test — the design wave should confirm the exact seam location before implementation.
- Forward: design — resolve where the `WorkerEvaluationRecord` type/serializer should live relative to existing PD-3 modules without introducing a new package boundary.
- Forward: specs — confirm exact field list for run/proposal/evidence/dataset/profile/version identity used to guarantee "exactly one record per run."

## Suggested Enhancements (not in original description)
- **(suggested)** Once the #17944 shared behavior lands, revisit the spike-local readiness gate to see if it can be retired in favor of the shared gate, rather than left running in parallel indefinitely.
