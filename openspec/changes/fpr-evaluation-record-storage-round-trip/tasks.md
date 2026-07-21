# Tasks

## Phase 0: Reconnaissance & Serializer Definition

#### 0.1 Explore the @kbn/evals storage round-trip substrate and pin the serializer home @host:worker-m1max

**File**: `.ao/recon.md`

**Intent**: Read-only reconnaissance that closes the two open questions the proposal left to design/research: confirm the real production-facing write/read APIs the round-trip must exercise, and pin exactly which existing module hosts the `WorkerEvaluationRecord` serializer — given research §5 found no FPR/daybreak eval suite or worker/eval module in this checkout. Produces one `.ao/recon.md` that every later task depends on. No source edits.

**Contract**:
`.ao/recon.md` documents each item below with a `file:line` anchor marked `[verified]` or `[blocked]`, and asserts no source code is modified by this task:
- Write path: `EvaluationScoreService.write` → `client.create(... refresh: 'wait_for')` against `.evaluation-scores` (`x-pack/platform/plugins/shared/evals/server/storage/evaluation_score_service.ts:109-120`), with deterministic `_id` from `computeScoreDocumentId` / `DEFAULT_SUITE_ID = 'unknown-suite'` (`:26`, `:29-40`).
- Read path: `EvaluationScoreService.search` driven by `buildExperimentFilterQuery` (`evaluation_score_service.ts:104-107`) — the same query the `GET /internal/evals/experiments/{id}/scores` route runs.
- Idempotency precedent: a second `create` of the same identity tuple → HTTP 409 counted as `conflicted`, not a second document (`evaluation_score_service.ts:137-140`; proven at `integration_tests/evaluation_score_service.test.ts:156-157`).
- Real-ES harness pattern to mirror: `createTestServers` + `startES` + `createRootWithCorePlugins`, `jest.setTimeout(180000)` (`evaluation_score_service.test.ts:78`, `:88-105`), cleanup via `deleteDataStream` / `deleteIndexTemplate` (`:68-75`).
- Field-representability map re-verified against live schemas: strict 6-field `ScoreMetadata` (`common_attributes.gen.ts:77-91`, mapping `scores_index_template.ts:17-44`); `evaluator.metadata` as the only arbitrary-key + queryable slot (`common_attributes.gen.ts:57`, mapping `scores_index_template.ts:83`); `example.input` / `task.output` stored-but-not-queryable (`scores_index_template.ts:50`, `:65`); evaluator scalar bounds (`scores_index_template.ts:79-82`).
- Serializer placement decision: because no daybreak/FPR worker/eval module exists (research §5), name the single existing package + subpath that hosts the serializer and the new test (candidate serializer: `x-pack/platform/plugins/shared/evals/server/storage/`; candidate test: `.../server/integration_tests/`), with the reason no new module boundary is introduced.
- Feature-flag grep: `experimentalFeatures` searched for any existing daybreak/FPR flag; record whether one exists and its default.

**Traces**: (infrastructure) — grounds FR-001, FR-002, FR-003, FR-006, FR-009.

#### 0.2 Define the WorkerEvaluationRecord DTO and pure serializer @host:worker-m1max

**File**: `x-pack/platform/plugins/shared/evals/server/storage/worker_evaluation_record.ts` (exact subpath pinned by 0.1; relocates to `x-pack/platform/packages/shared/kbn-evals-common/` only if 0.1 determines the serializer must sit beside `IngestScoresRequestBodyInput`)

**Intent**: Define the smallest FPR `WorkerEvaluationRecord` domain DTO plus a pure serializer that routes every FR-001 field onto a slot the existing ingest schema already supports. The serializer only produces the existing `IngestScoresRequestBodyInput` — a pre-storage mapping, never a separately stored document, so the no-parallel-record invariant holds.

**Contract**:
```typescript
import type { IngestScoresRequestBodyInput } from '@kbn/evals-common';

export interface WorkerEvaluationRecord {
  /** stable capability/run identity */
  runId: string;
  capabilityId: string;
  /** worker/profile/dataset version */
  workerVersion: string;
  profileVersion: string;
  dataset: { name: string; version: string };
  /** actual outcome */
  outcome: { label: string; score: number; explanation?: string };
  /** evidence references */
  evidenceRefs: string[];
  /** Proposal linkage */
  proposalId: string;
  /** expected outcome or human decision label */
  expectedLabel?: string;
  humanDecisionLabel?: string;
  /** provenance needed by the existing @kbn/evals result shape */
  provenance: { evaluatorName: string; modelName: string; executionId: string };
}

export declare function serializeWorkerEvaluationRecord(
  record: WorkerEvaluationRecord
): IngestScoresRequestBodyInput;
```
- The serializer routes identity into `experiment_id` + `metadata.execution_id` + `metadata.suite_id`; outcome into `evaluator.label` / `evaluator.score` / `evaluator.explanation`; and fields with no first-class queryable home (worker/profile version, evidence references, Proposal linkage) into `evaluator.metadata` — the only arbitrary-key, queryable slot, copied verbatim by the write path at `evaluation_score_service.ts:68` (research §4, spec FR-002).
- The file imports no Elasticsearch client, no Saved Objects client, and registers no package or storage substrate.

**Traces**: FR-001, FR-002, FR-006.

### Verification:

#### Automated:
- [ ] 0.1 `.ao/recon.md` exists and contains `[verified]` `file:line` anchors for write path, read path, idempotency precedent, harness pattern, field map, serializer placement, and feature-flag grep (FR-001, FR-003, FR-006, FR-009)
- [ ] 0.2 `node scripts/type_check --project x-pack/platform/plugins/shared/evals/tsconfig.json` passes (FR-001, FR-011)
- [ ] 0.2 `node scripts/eslint --fix x-pack/platform/plugins/shared/evals/server/storage/worker_evaluation_record.ts` is clean (FR-011)
- [ ] 0.2 `grep -nE "ElasticsearchClient|SavedObjectsClient|createIndex|registerType" x-pack/platform/plugins/shared/evals/server/storage/worker_evaluation_record.ts` returns nothing (FR-006)

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 1: Storage Round-Trip Proof

#### 1.1 Add the deterministic WorkerEvaluationRecord storage round-trip integration test @host:worker-m1max

**File**: `x-pack/platform/plugins/shared/evals/server/integration_tests/worker_evaluation_record.test.ts`

**Intent**: Prove, against the real ES harness, that an FPR-shaped `WorkerEvaluationRecord` writes through the production write path and reads back through the production query path with every FR-001 field preserved and exactly one record per run. This is the load-bearing proof of the slice; it mirrors the only existing real-ES integration test in the repo.

**Contract**:
```typescript
// jest.integration.config.js; jest.setTimeout(180000) — mirrors evaluation_score_service.test.ts:78
// harness: createTestServers + startES + createRootWithCorePlugins (:88-105)
// cleanup: deleteDataStream + deleteIndexTemplate (:68-75)
describe('WorkerEvaluationRecord storage round-trip', () => {
  const FPR_FIXTURE: WorkerEvaluationRecord = {
    /* FPR-shaped values per FR-009 */
  };

  it('round-trips every FR-001 field via the real write/read paths', async () => {
    const body = serializeWorkerEvaluationRecord(FPR_FIXTURE);
    const written = await evaluationScoreService.write(body);        // :109-120
    expect(written.ingested).toBe(body.scores.length);
    const hits = await evaluationScoreService.search({               // :104-107
      query: buildExperimentFilterQuery({ experimentId, suiteId }),  // same query as GET /experiments/{id}/scores
    });
    expect(hits).toHaveLength(1);                                     // exactly-one-record-per-run
    expect(hits[0]._source).toMatchObject({
      /* each FR-001 field preserved */
    });
  });

  it('a second write of the same run identity is idempotent (conflicted, no duplicate)', async () => {
    const rewritten = await evaluationScoreService.write(body);
    expect(rewritten.ingested).toBe(0);
    expect(rewritten.conflicted).toBe(body.scores.length);           // 409 create-op collision, :137-140 / :156-157
  });
});
```
- The test asserts field fidelity for every FR-001 field (FR-004) and exactly-one-record-per-run via the all-conflicted rewrite (FR-005), grounding the precedent at `evaluation_score_service.test.ts:156-157`.

**Traces**: FR-003, FR-004, FR-005, FR-009.

#### 1.2 Contract-seam stop condition and no-parallel-storage invariant @host:worker-m1max

**File**: `x-pack/platform/plugins/shared/evals/` (package boundary)

**Intent**: Enforce the operator's point-4 guardrail: if any FR-001 field cannot be represented by the supported APIs, the slice stops at a tested contract seam rather than working around it with private coupling or separate storage; and prove the no-parallel-storage invariant holds across the whole change. Per research §4 the seam is expected NOT to fire for persistence (all fields are representable, several via `evaluator.metadata`), so the likely outcome is "no seam" — but the guardrail must be in place.

**Contract**:
- If every FR-001 field round-trips green via 1.1, then NO blocked test, NO private-coupling import, and NO separate-storage call are introduced; the change persists and reads `WorkerEvaluationRecord` exclusively through the APIs named in FR-003.
- If any FR-001 field is unrepresentable, then a failing/blocked integration test exists that names the exact API (`IngestScoresRequestBody` field or `EvaluationScoreDocument` path — e.g. `evaluator.metadata` flattened vs. a missing first-class slot, per `common_attributes.gen.ts:57` / `scores_index_template.ts:83`) and the missing field, AND an implementation-adjacent doc in the same package records the concrete extension gap (API + field name).
- `git diff` introduces no new ES index/template, no Saved Object type, no new `kibana.jsonc` plugin, no new package, and no parallel record.

**Traces**: FR-006, FR-007, FR-008.

### Verification:

#### Automated:
- [ ] 1.1 `node scripts/jest_integration x-pack/platform/plugins/shared/evals/server/integration_tests/worker_evaluation_record.test.ts --maxWorkers=4 --workerIdleMemoryLimit=512MB` passes (or `--runInBand`) (FR-003, FR-004, FR-005, FR-012)
- [ ] 1.1 the test file contains one `describe` with a field-fidelity assertion and an all-conflicted (`ingested: 0, conflicted: n`) rewrite assertion (FR-004, FR-005)
- [ ] 1.2 `git diff --name-only HEAD` lists no new `kibana.jsonc`, plugin directory, package, or `*index_template*` file outside the existing evals substrate (FR-006)
- [ ] 1.2 `git diff HEAD | grep -E '^\+' | grep -E 'registerType|savedObjectsClient|createIndex|EvaluationIndices\.(DATASETS|DATASET_EXAMPLES)'` returns nothing (FR-006, FR-007)
- [ ] 1.2 round-trip in 1.1 is fully green OR a blocked test file plus an implementation-adjacent gap doc exist naming the exact API and missing field (FR-007, FR-008)

#### Manual:
*(none — fully machine-checkable)*

---

## Phase 2: Validation & Cross-Cutting Invariants

#### 2.1 Run the scoped validation gate and verify feature-flag and skill_ids invariants @host:worker-m1max

**File**: `x-pack/platform/plugins/shared/evals/` (affected package)

**Intent**: Close the slice by running the focused test + typecheck + lint gate for the affected package and asserting the two cross-cutting invariants the operator named: the feature flag stays default off (FR-009) and no behavior-evaluation path forces `skill_ids` (FR-010). Every Jest invocation uses the required worker flags (FR-012).

**Contract**:
- `node scripts/type_check --project x-pack/platform/plugins/shared/evals/tsconfig.json` exits 0 (add `--project x-pack/platform/packages/shared/kbn-evals-common/tsconfig.json` if 0.1 placed the serializer there).
- `node scripts/eslint --fix $(git diff --name-only HEAD)` introduces no lint errors.
- The focused integration test from 1.1 passes with `--maxWorkers=4 --workerIdleMemoryLimit=512MB` (or `--runInBand`).
- A grep of `experimentalFeatures` shows either no daybreak/FPR flag or one whose default is `false`.
- A grep of the diff for `skill_ids` shows no behavior-evaluation path that forces it.

**Traces**: FR-009, FR-010, FR-011, FR-012.

### Verification:

#### Automated:
- [ ] 2.1 `node scripts/type_check --project x-pack/platform/plugins/shared/evals/tsconfig.json` passes (FR-011)
- [ ] 2.1 `node scripts/eslint --fix $(git diff --name-only HEAD)` is clean (FR-011)
- [ ] 2.1 `node scripts/jest_integration x-pack/platform/plugins/shared/evals/server/integration_tests/worker_evaluation_record.test.ts --maxWorkers=4 --workerIdleMemoryLimit=512MB` passes (or `--runInBand`) (FR-011, FR-012)
- [ ] 2.1 `git grep -nE "experimentalFeatures" -- '*.ts' '*.json'` shows no new default-on daybreak/FPR flag (FR-009)
- [ ] 2.1 `git diff HEAD | grep -E '^\+' | grep -nE 'skill_ids'` shows no forced `skill_ids` in any behavior-evaluation path (FR-010)

#### Manual:
*(none — fully machine-checkable)*
