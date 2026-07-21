---
change_id: fpr-worker-evaluation-record-storage-round-trip
status: draft
created_at: 2026-07-11
treadmill_artifact_version: 1
feature_id: f943d973-90ab-4834-8e7f-d7fed23afe31
feature_slug: daybreak-s1-alert-analysis-worker-spike
---
# FPR WorkerEvaluationRecord Storage Round-Trip

## Why
The existing Alert Analysis worker spike (daybreak-s1-alert-analysis-worker-spike) has a PD-3 @kbn/evals suite, but the first FPR WorkerEvaluationRecord storage round-trip — writing an evaluation record and reading it back through the real production-facing APIs — has not been proven. This is a discovery/implementation seam: prove the round-trip works through real storage APIs before any L4 scoring, dataset expansion, or docs/visual work is attempted.

## What Changes
- Locate the existing PD-3 FPR @kbn/evals suite and its real production-facing dataset/experiment write and query/read APIs.
- Define the smallest FPR WorkerEvaluationRecord serializer/type in an existing daybreak worker/eval module, covering: stable capability/run identity, worker/profile/dataset version, actual outcome, evidence references, Proposal linkage, expected outcome or human decision label, and provenance needed by the existing @kbn/evals result shape.
- Do NOT add an Elasticsearch index, Saved Object, new package, plugin, service, registry, or parallel record — use only existing supported APIs.
- Add one deterministic integration test that writes through the real @kbn/evals storage write path and reads the stored record back through the production-facing query API, asserting field fidelity and exactly-one-record-per-run semantics.
- If a required field cannot be represented by supported existing APIs, stop at a tested contract seam: add a failing/blocked integration test naming the exact API and missing field, and record the concrete extension gap in implementation-adjacent documentation — no private-coupling workaround, no separate storage.
- Use an FPR-shaped record/fixture; keep the feature flag default off; do not force `skill_ids` in any behavior-evaluation path.
- Run focused tests plus typecheck/lint as supported by the affected package; every Jest invocation includes `--maxWorkers=4 --workerIdleMemoryLimit=512MB` or uses `--runInBand`.
- Every task in the downstream plan ends `@host:worker-m1max`.

## Impact
- Existing daybreak worker/eval module gains a new WorkerEvaluationRecord type/serializer (no new module boundary).
- PD-3's @kbn/evals suite gains one deterministic integration test exercising the real storage write/read path.
- No changes to Elasticsearch indices, Saved Objects, packages, plugins, services, or registries.
- Attaches to the existing `daybreak-s1-alert-analysis-worker-spike` feature; feature flag remains default off.

## Open Questions
- Forward: design — exact identity of the "real production-facing dataset/experiment write and query/read APIs" (which @kbn/evals module/function) needs to be located and named concretely.
- Forward: design — which specific fields (capability/run identity, worker/profile/dataset version, actual outcome, evidence references, Proposal linkage, expected outcome/human decision label, provenance) may not be representable by existing APIs, triggering the contract-seam stop condition.

## Suggested Enhancements (not in original description)
- **(suggested)** Once the round-trip contract seam is proven or blocked, capture the resulting field-mapping as a short reference doc other post-spike workers can reuse when wiring their own WorkerEvaluationRecord.
