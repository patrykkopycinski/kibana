All load-bearing anchors verified directly against source — `EvaluatorInfo.metadata` catchall at `common_attributes.gen.ts:57`, strict 6-field `ScoreMetadata` at `:77-91`, `EvaluationScoreDocument` at `:94-104`, and the ES mapping (`metadata` strict at `scores_index_template.ts:17-44`, `evaluator.metadata: flattened` at `:83`, `example.input`/`task.output` `enabled:false` at `:50`/`:65`). research.md is accurate. Writing the design doc.

# Design

## Approach

The change proves exactly one thing: a `WorkerEvaluationRecord` can be written through the real production-facing `@kbn/evals` write path and read back through the real production-facing query path, with field fidelity and exactly-one-record-per-run semantics — by reusing substrate that is already present, mature, and deterministically exercised, not by standing up any new storage. As established in research.md (§1, §2), the write path is `EvalsClient.ingestScores` → `POST /internal/evals/scores` → `EvaluationScoreService.write`, which `client.create()`s `EvaluationScoreDocument`s into the `.evaluation-scores` data stream with `refresh: 'wait_for'` (`x-pack/platform/plugins/shared/evals/server/storage/evaluation_score_service.ts:109-120`); the read path is `EvalsClient.getExperimentScores` → `GET /internal/evals/experiments/{id}/scores`, whose route handler runs `buildExperimentFilterQuery` and returns the raw `_source` of each hit via `EvaluationScoreService.search` (`evaluation_score_service.ts:104-107`). `refresh: 'wait_for'` makes the written document immediately searchable, so a test reads it back without sleeps.

Exactly-one-record-per-run is structural, not a convention this slice must impose (research.md §3): `computeScoreDocumentId` derives a deterministic ES `_id` from `experiment_id - suite_id - task.model.id - example.dataset.id - example.id - evaluator.name - repetition_index` (`evaluation_score_service.ts:29-40`, with `DEFAULT_SUITE_ID = 'unknown-suite'` at `:26`), and the write uses the `create` op, so a second write with the same identity tuple returns HTTP 409 and is counted as `conflicted`, not as a second document (`evaluation_score_service.ts:137-140`). This idempotency is already proven by the one real-ES integration test in the repo: its second write returns `{ ingested: 0, conflicted: payload.scores.length, failed: [] }` (`x-pack/platform/plugins/shared/evals/server/integration_tests/evaluation_score_service.test.ts:156-157`).

The work therefore decomposes into three in-place moves. (1) Define a `WorkerEvaluationRecord` domain DTO plus a pure serializer that maps it onto the existing `IngestScoresRequestBodyInput` shape — a pre-storage mapping only, never a separately stored document, so the "no parallel record" invariant (FR-006) holds. (2) Add one deterministic integration test on the proven real-ES harness that writes through `EvaluationScoreService.write(serializeWorkerEvaluationRecord(fixture))` and reads back through `EvaluationScoreService.search` driven by the same `buildExperimentFilterQuery` the production route runs, asserting per-field fidelity (FR-004) and the all-conflicted rewrite (FR-005). (3) Where a required field has no first-class queryable home, stop at a tested contract seam per the operator's point-4 rule (FR-007/FR-008): a blocked test naming the exact API and missing field, plus implementation-adjacent documentation of the gap — no private coupling, no separate storage.

This slice is the storage-round-trip seam inside parent plan phase PD-3 (the `@kbn/evals` harness phase; shape FR-8 / FR-10 / A-3). It is deliberately narrower than PD-3's full scope: no L4 scoring, no dataset expansion, no live UI-journey/trace gate (shape FR-9), no deliberately-broken golden variant (A-3), no connector retry/backoff (A-4) — those are post-seam PD-3 work and are carried as Forward items. The bet resolves on a green real write/read proof plus the no-parallel-storage invariant; nothing else is in scope.

## Components

- **`WorkerEvaluationRecord` (domain DTO + pure serializer)** — the smallest type covering the required fields (capability/run identity, worker/profile/dataset version, actual outcome, evidence references, Proposal linkage, expected outcome / human-decision label, provenance) plus `serializeWorkerEvaluationRecord(record): IngestScoresRequestBodyInput`, which routes each field into a slot the existing ingest schema already supports. Zero storage coupling — it only produces the existing ingest input, so it is a pre-storage mapping, not a parallel record (FR-006). Placement is the one design decision the proposal left open (research.md Open Question #1); see Failure Modes.
- **`worker_evaluation_record.test.ts` (deterministic integration test)** — mirrors the only real-ES harness in the repo (`createTestServers` + `startES` + `createRootWithCorePlugins` + real data-stream client, `evaluation_score_service.test.ts:88-105`; `jest.setTimeout(180000)` at `:78`). Writes via `EvaluationScoreService.write(serializeWorkerEvaluationRecord(fixture))`, reads via `EvaluationScoreService.search({ query: buildExperimentFilterQuery({ experimentId, suiteId }) })` (the exact query the production route handler runs), then asserts per-field fidelity (FR-004) and the all-conflicted rewrite for exactly-one-record-per-run (FR-005, precedent at `evaluation_score_service.test.ts:156-157`). Cleanup reuses the `deleteDataStream`/`deleteIndexTemplate` pattern at `:68-75`.
- **Contract-seam test + gap note (conditional)** — produced only if the seam is actually hit: a blocked/failing sibling test naming the exact API (`IngestScoresRequestBody` / `EvaluationScoreDocument`) and the missing field, plus a short note in an implementation-adjacent doc in the same package (FR-007/FR-008). See Data Model / Failure Modes for why this is expected *not* to fire for persistence, and what would fire it.

## Data Model

The `WorkerEvaluationRecord` is a pre-storage domain shape; the stored artifact is always the existing `EvaluationScoreDocument` (`x-pack/platform/packages/shared/kbn-evals-common/impl/schemas/common_attributes.gen.ts:94-104`), one per run. The serializer's job is to route each required field into the storage home the existing schema already supports. The load-bearing constraints, verified against source, are:

- The top-level `metadata` is a **strict** object — `ScoreMetadata` defines exactly six named fields (`execution_id`, `suite_id`, `total_repetitions`, `hostname`, `git`, `ci`) and rejects arbitrary keys (`common_attributes.gen.ts:77-91`); the ES mapping mirrors this with no catchall (`scores_index_template.ts:17-44`).
- `scores[].evaluator.metadata` is the **only** arbitrary-key slot in the ingest shape — `z.object({}).catchall(z.unknown()).nullable().optional()` (`common_attributes.gen.ts:57`) — and it is the only such slot that is also queryable, via the `flattened` mapping (`scores_index_template.ts:83`). The write path copies it verbatim into the stored doc (`evaluation_score_service.ts:68`).
- `example.input` and `task.output` are stored (`object`, `enabled: false`) but **not** queryable (`scores_index_template.ts:50`, `:65`). The evaluator scalars are bounded: `label`/`name`/`trace_id` ≤256 chars, `explanation` ≤4096, `score` float, `explanation` text with `index:false` (`scores_index_template.ts:79-82`).

The table below is the field-mapping that drives the serializer and the test's fidelity assertions; it is the concrete shape of the representability split documented in research.md §4 and codified in spec FR-002.

| `WorkerEvaluationRecord` field | Storage home | First-class & queryable? |
|---|---|---|
| run identity (`runId`) | `experiment_id` + `metadata.execution_id` | yes (keyword); readable via either |
| capability identity (`capabilityId`) | `metadata.suite_id` | yes; enters the deterministic `_id` via `DEFAULT_SUITE_ID` fallback (`evaluation_score_service.ts:26,30`) |
| dataset identity (`dataset.name`) | `example.dataset.id` + `example.dataset.name` | yes |
| dataset **version** | `evaluator.metadata.dataset_version` (flattened) | only via `evaluator.metadata` — no first-class field |
| worker **version** | `evaluator.metadata.worker_version` (flattened) | only via `evaluator.metadata` |
| profile **version** | `evaluator.metadata.profile_version` (flattened) | only via `evaluator.metadata` |
| actual outcome | split: `evaluator.label` (≤256) + `evaluator.score` (float) are the queryable channels; full detail verbatim in `task.output` (stored, **not** queryable) | partial |
| evidence references | single primary trace → first-class `evaluator.trace_id`; structured/multiple refs → `evaluator.metadata.evidence_refs` (flattened) | partial |
| Proposal linkage | `evaluator.metadata.proposal_id` (flattened) | only via `evaluator.metadata` — no first-class field |
| expected outcome / human-decision label | expected ground truth via `example.input`/dataset `example.output`; human decision → `evaluator.metadata.decision`; also expressible as `evaluator.label`/`explanation` | partial |
| provenance (git/ci/hostname/model) | top-level `metadata.git` / `metadata.ci` / `metadata.hostname` + `task.model` + `evaluator.model` | yes (strict named fields) |

Consequence: worker version, profile version, dataset version, structured evidence refs, and Proposal linkage have **no dedicated first-class queryable home** and must serialize into `evaluator.metadata`. They can all be *persisted* and *queried by dotted key* through the `flattened` mapping — so this is a representability split, not a hard blocker, and it does not by itself trigger the operator's point-4 stop condition (FR-007). The stop condition fires only if a required field needs a first-class home that neither the strict `metadata` nor the flattened `evaluator.metadata` can provide.

Serializer shape (sketch):

```ts
export interface WorkerEvaluationRecord {
  // stable capability/run identity — feed computeScoreDocumentId deterministically
  capabilityId: string;          // → metadata.suite_id
  runId: string;                 // → experiment_id (+ metadata.execution_id)
  experimentName?: string;       // → experiment_name
  evaluatorName: string;         // → evaluator.name
  exampleId: string;             // → example.id
  repetitionIndex: number;       // → task.repetition_index
  // versions (seam: no first-class queryable home)
  workerVersion: string;         // → evaluator.metadata.worker_version
  profileVersion: string;        // → evaluator.metadata.profile_version
  dataset: { name: string; version?: string }; // name first-class; version → evaluator.metadata
  // outcome (split queryable vs verbatim)
  actualOutcome: { label: string; score: number; detail: unknown };
  expectedOutcomeOrLabel?: { expected?: unknown; humanDecision?: string };
  // evidence + proposal (seam)
  evidenceRefs?: { primaryTraceId?: string; refs?: Record<string, string> };
  proposalLinkage?: { proposalId: string };
  // provenance (first-class)
  model: { task: Model; evaluator: Model };
  provenance: { hostname: string; git?: { branch?: string; commitSha?: string }; ci?: BuildkiteMetadata };
}

export const serializeWorkerEvaluationRecord = (
  record: WorkerEvaluationRecord
): IngestScoresRequestBodyInput => { /* maps each field per the table above; pins identity inputs */ };
```

Exactly-one-record-per-run is delivered by feeding the serializer stable identity inputs so `computeScoreDocumentId` produces a deterministic `_id`; the existing `create`-op + 409-conflict path (`evaluation_score_service.ts:117-140`) then makes re-writes idempotent. The test asserts this directly by writing twice and expecting the second write all-conflicted.

## Failure Modes

- **No host module exists in the checkout (central scoping gap):** the proposal says to define the serializer "in an existing daybreak worker/eval module," but research.md §5 (confirmed by repo-wide search) finds no `daybreak` plugin, no `kbn-evals-suite-fpr`/`-daybreak`, and no `WorkerEvaluationRecord` in source — those names appear only under `openspec/changes/`. The binding invariant is "no new module boundary" (FR-001/FR-006), not the literal module name. The serializer therefore lands as a **new file in the existing `@kbn/evals-common` package** (`x-pack/platform/packages/shared/kbn-evals-common`), which already owns every target type the serializer maps onto (`IngestScoresRequestBody`, `EvaluationScoreDocument`, `IngestScoresRequestBodyInput`, the Zod schemas, the index/URL constants) and is the shared boundary both the harness and the plugin import — so a type plus a pure function is a new file in an existing module, not a new package/plugin/service/registry. The integration test lands in the evals *plugin*'s `server/integration_tests/`, mirroring the only existing real-ES harness (research.md §6). (Forward: tasks — confirm with the operator that `@kbn/evals-common` is an acceptable host given the literal-`daybreak`-module wording has no referent in the tree.)
- **A required field has no representable home (stop condition, operator point 4):** if a field cannot be stored even inside `evaluator.metadata`, the serializer is not patched around. A blocked/failing integration test is added naming the exact API (`IngestScoresRequestBody` / `EvaluationScoreDocument`) and the missing field, the gap is recorded in implementation-adjacent documentation in the same package (FR-007/FR-008), and no private coupling or separate storage is introduced. Per the mapping above this is not expected to fire for *persistence*, but it is the prescribed reaction if it does.
- **A field needs a first-class (top-level, queryable) home the strict schema forbids:** the top-level `metadata` is strict (`common_attributes.gen.ts:77-91`) and generated. A worker field that must be top-level cannot be added in-slice; it is routed to `evaluator.metadata`, and if first-class queryability is a hard requirement, that becomes the contract-seam stop (blocked test + gap note) rather than a schema edit.
- **Lossy actual-outcome channel:** `evaluator.label` is capped at 256 chars (`common_attributes.gen.ts:55`), so a long actual outcome cannot be queried verbatim — it survives only in the unqueryable `task.output` (`scores_index_template.ts:65`). The serializer preserves full detail in `task.output` and a queryable digest in `label`/`score`; the split is documented, not hidden. (Forward: design — confirm which channel is canonical for "actual outcome" in the fidelity assertion, research.md Open Question #4.)
- **Non-deterministic identity → duplicate records (exactly-one violated):** if any identity input (`experiment_id`, `suite_id`, model id, dataset id, example id, evaluator name, repetition index) is allowed to vary per run, `computeScoreDocumentId` yields a new `_id` and re-writes create duplicates. The serializer pins these from the record's stable identity fields, and the test's all-conflicted-rewrite assertion guards the invariant.
- **Feature-flag cargo-cult:** the proposal requires the feature flag stay default off (FR-009; shape FR-12 / NFR-2), but a pure serializer + deterministic storage test has no runtime consumer to gate — the flag belongs to the worker runtime (PD-2), not this slice. Forcing an `experimentalFeatures` flag here would be noise. The slice honors the requirement by not exporting or wiring the serializer into any default-on runtime path, and by recording where the real flag lives. (Forward: tasks — confirm whether an inert flag token is still wanted.)
- **Out-of-slice flakiness (shape A-4) explicitly deferred:** this test has no live model connector, so rate-limit/timeout non-determinism does not apply here; connector retry/backoff is post-seam PD-3 work.

## Alternatives Considered

- **Host the serializer in a new `kbn-evals-suite-fpr` package:** rejected — a new package is explicitly forbidden by FR-006, and no `fpr`/`daybreak` code module exists in this checkout today (research.md §5); the names appear only under `openspec/changes/`. A new file in the existing `@kbn/evals-common` boundary satisfies "no new module boundary."
- **Store `WorkerEvaluationRecord` as its own ES index or Saved Object:** rejected — violates "no Elasticsearch index, no Saved Object, no parallel record" (FR-006), and would discard the already-proven `computeScoreDocumentId` idempotency and the mature `.evaluation-scores` data stream.
- **Host the DTO inside the `evals` platform plugin (server runtime):** rejected — it would push worker-domain knowledge into the platform plugin that owns `EvaluationScoreService` and the routes, coupling the platform to a specific worker's record shape. A pure type in the shared `@kbn/evals-common` boundary keeps the dependency one-way (serializer → existing ingest types).
- **Add new first-class fields to the strict `metadata` schema to give versions/Proposal linkage a top-level home:** rejected for this slice — `ScoreMetadata` is generated and shared across all eval consumers (`common_attributes.gen.ts:77-91`); widening it is a platform-schema change beyond a storage-round-trip seam and would itself be the contract-seam stop condition rather than a quiet edit.
- **Prove the round-trip through the full HTTP `EvalsClient` (live Kibana server) rather than the storage layer:** rejected as the primary proof. Per research.md §6, the only deterministic real-ES precedent is the storage-layer harness at `integration_tests/evaluation_score_service.test.ts`; `EvalsClient` is never run against real ES in any test, and the route tests mock `evaluationScoreService`. The storage harness runs the exact `write` + `search` code the HTTP route delegates to (`evaluation_score_service.ts:104-107,109-162`), so it exercises the production path without a heavier, no-precedent HTTP lift. A full HTTP round-trip is left as a Forward risk, not the seam's proof.

Forward: tasks — (a) confirm the `@kbn/evals-common` host given the literal-`daybreak`-module wording has no referent in the tree (Failure Modes #1); (b) confirm whether an inert feature-flag token is still required for this slice given it has no runtime consumer; (c) every Jest invocation uses `--maxWorkers=4 --workerIdleMemoryLimit=512MB` or `--runInBand` (FR-012); every task ends `@host:worker-m1max` (FR-013); (d) scoped typecheck (`node scripts/type_check --project <tsconfig>`) and lint (`node scripts/eslint --fix $(git diff --name-only HEAD)`) on the two affected packages only (FR-011). Forward: specs — the field-mapping table above is the contract the spec story should encode (write/read round-trip, field-fidelity per row, exactly-one-record-per-run, no-parallel-storage invariant, and the contract-seam stop condition).
