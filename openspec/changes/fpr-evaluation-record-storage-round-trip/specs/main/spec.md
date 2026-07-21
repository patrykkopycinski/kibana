# Specification

## Requirements

### Evaluation Record Model

- **FR-001 MUST** — Define the smallest FPR `WorkerEvaluationRecord` serializer/type inside an existing daybreak worker/eval module (no new module boundary), covering exactly these fields: stable capability/run identity; worker/profile/dataset version; actual outcome; evidence references; Proposal linkage; expected outcome or human decision label; and the provenance needed by the existing `@kbn/evals` result shape. (What Changes: define serializer/type)
- **FR-002 SHOULD** — Map each FR-001 field onto a supported slot of the stored `EvaluationScoreDocument`, preferring first-class queryable fields (`experiment_id`, `metadata.execution_id`, `metadata.suite_id`, `evaluator.name`, `task.model`, `example.dataset`) and serializing fields with no dedicated queryable home into `evaluator.metadata` (ES `flattened`), per Research §4. (What Changes: define serializer/type; no parallel storage)

### Storage Round-Trip

- **FR-003 MUST** — Add exactly one deterministic integration test that writes a record through the real production-facing `@kbn/evals` write path and reads it back through the real production-facing query API. The write path is `EvalsClient.ingestScores` → `POST /internal/evals/scores` → `EvaluationScoreService.write` → `client.create(... refresh: 'wait_for')` against the `.evaluation-scores` data stream; the read path is `EvalsClient.getExperimentScores` → `GET /internal/evals/experiments/{id}/scores` → `EvaluationScoreService.search` via `buildExperimentFilterQuery` (Research §1, §2). The dataset APIs (`getDatasetByName` / `upsertDataset`) are not used to carry run outcomes (Research §2). (What Changes: locate APIs; add integration test)
- **FR-004 MUST** — The integration test asserts field fidelity: every field enumerated in FR-001 round-trips through the real write/read path with its value preserved. (What Changes: assert field fidelity)
- **FR-005 MUST** — The integration test asserts exactly-one-record-per-run semantics: a second write of the same run identity is idempotent and produces no duplicate record, because the ES `_id` is derived deterministically by `computeScoreDocumentId` and the write uses the `create` op whose collision is counted as `conflicted` (HTTP 409), not a second document (Research §3). (What Changes: assert exactly-one-record-per-run)

### No Parallel Storage Invariant

- **FR-006 MUST** — The change adds no Elasticsearch index, no Saved Object, no new package, plugin, service, registry, and no parallel record; it persists and reads `WorkerEvaluationRecord` exclusively through the existing supported `@kbn/evals` APIs named in FR-003. (What Changes: do not add index/SO/package/plugin/service/registry/parallel record)

### Contract Seam Stop Condition

- **FR-007 MUST** — If any field enumerated in FR-001 cannot be represented by the supported existing APIs, the change stops at a tested contract seam rather than working around it: a failing or blocked integration test that names the exact API and the missing field, with no private-coupling workaround and no separate storage. (What Changes: stop at tested contract seam)
- **FR-008 MUST** — Any gap surfaced under FR-007 is recorded as a concrete extension gap in implementation-adjacent documentation (naming the API and the missing field). Anticipated candidates, per Research §4: worker/profile version, evidence references, and Proposal linkage have no dedicated queryable home and are representable only inside `evaluator.metadata` (flattened) or as opaque, non-queryable `task.output` / `example.input`. (What Changes: record extension gap in implementation-adjacent documentation)

### Feature Flag and Record Shape

- **FR-009 MUST** — The record and test fixture use an FPR-shaped `WorkerEvaluationRecord`, and the feature flag remains default off. (What Changes: FPR-shaped record/fixture; feature flag default off)
- **FR-010 MUST** — No behavior-evaluation path forces `skill_ids`. (What Changes: do not force skill_ids)

### Validation

- **FR-011 MUST** — Focused tests pass, plus typecheck and lint as supported by the affected package. (What Changes: run focused tests + typecheck/lint)
- **FR-012 MUST** — Every Jest invocation uses `--maxWorkers=4 --workerIdleMemoryLimit=512MB` or `--runInBand`. (What Changes: Jest worker flags)

### Delivery

- **FR-013 MUST** — Every task in the downstream plan ends `@host:worker-m1max`. (What Changes: every task ends @host:worker-m1max)

## Suggested Enhancements (not in core scope)

- **(suggested)** Once the round-trip contract seam is either proven or blocked, capture the resulting field-to-slot mapping (which FR-001 fields land in first-class queryable slots vs. `evaluator.metadata` vs. the FR-007/FR-008 gap) as a short implementation-adjacent reference that post-spike Watch workers can reuse when wiring their own `WorkerEvaluationRecord`.
