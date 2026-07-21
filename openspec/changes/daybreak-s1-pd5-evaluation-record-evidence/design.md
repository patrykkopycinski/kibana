# Design

## Approach

The L4 Evaluation Record is implemented as a thin, deterministic scoring and serialization layer inside the existing Daybreak worker boundary, reusing the PD-3 `@kbn/evals` harness and the existing Proposal/Evidence clients rather than adding any new package, plugin, index, service, or store (proposal.md §What Changes). The work is scoped to PD-5 only: it does not rebuild the five-phase worker, the fixtures, or the UI panel, but extends them in place.

The central artifact is a concrete `WorkerEvaluationRecord` runtime type with a small serializer. The record is produced once per whole-worker run and is carried through the existing `@kbn/evals` dataset/experiment result metadata surface. A deterministic scorer computes a critical-dimension pass/fail vector and a weighted score from the dimensions specified in the proposal. The 0.80 weighted threshold is stored as proposed/unratified metadata inside the scorecard, not as a hard gate in code.

As identified in research.md, the repository exploration pass could not be completed, so the exact file paths for the Daybreak worker modules, Proposal/Evidence types, `@kbn/evals` result metadata API, and PD-3 fixtures remain open questions that must be grounded in a follow-up evidence pass before implementation begins (research.md §Open Questions). The architecture below therefore describes module responsibilities and interfaces in terms of the existing PD-2/PD-3/PD-4 boundaries named in the shape notes, with explicit forward markers where exact placement is still to be confirmed.

## Components

- **`WorkerEvaluationRecord` runtime type/serializer** — owns the smallest concrete schema needed for this slice: run identity, proposal identity, evidence identity, dataset/profile/version provenance, dimension results, and record/proposal counts. It serializes to and from the existing `@kbn/evals` result metadata shape. Lives inside the existing Daybreak plugin boundary, adjacent to the PD-3 eval modules, not in a new package (FR-8, FR-9, PD-3; proposal.md §What Changes).

- **Deterministic scorer** — computes four critical hard-gate dimensions (outcome correctness, action safety, idempotency, record coverage) and three weighted dimensions (evidence completeness 0.4, confidence calibration 0.3, rationale/actionability 0.3). Critical dimensions must all pass for the run to be considered successful; the weighted score is reported separately with the 0.80 threshold marked proposed/unratified (FR-10, PD-3; proposal.md §What Changes).

- **`fpr-golden-v0` seed manifest** — a single versioned manifest reusing the canonical PD-3 fixture definitions. It covers: benign expected behavior, insufficient/missing evidence, risky broad exception, duplicate/replay, malformed output, and one deliberately broken expected result. No hand-duplicated demo data (FR-10, PD-3; proposal.md §What Changes).

- **Eval suite extension** — extends the existing PD-3 `@kbn/evals` FPR suite to invoke the real worker path, collect the `WorkerEvaluationRecord`, and export the scorecard/evidence artifact. The offline dataset gate and the live UI-journey gate are both extended in place; the live gate continues to use Scout+Playwright with explicit wait-for-state assertions (FR-8, FR-9, A-5, PD-3, PD-4).

- **Scorecard/evidence exporter** — produces a machine-readable artifact from a test run containing capability/profile/dataset/model/worker provenance, dimension results, record/proposal counts, tokens/latency when trace data exists, and cost basis without guessed dollars (proposal.md §What Changes).

- **Feature-flag guard** — the existing Daybreak worker experimental feature flag remains default off (NFR-2, FR-12, PD-2). The L4 record path is only active when the flag is enabled.

Forward: design — exact placement of the `WorkerEvaluationRecord` type/serializer relative to existing PD-3 modules needs to be confirmed once the Daybreak plugin path and `@kbn/evals` result metadata shape are located (research.md §Open Questions).

## Data Model

### `WorkerEvaluationRecord` (runtime type)

| Field | Type | Source / Purpose |
| --- | --- | --- |
| `runId` | string | Unique whole-worker run identity (FR-10). |
| `proposalId` | string | Ties record to the Proposal emitted by the Act phase (FR-7). |
| `evidenceId` | string | Ties record to the evidence block packaged in the Enrich phase (FR-4). |
| `datasetId` | string | `fpr-golden-v0` manifest identifier (FR-10, PD-3). |
| `profileId` | string | Eval profile/capability identifier (proposal.md §What Changes). |
| `version` | string | Manifest + serializer version for stable replay (FR-10). |
| `workerId` | string | Daybreak alert-analysis worker identity (FR-1). |
| `modelId` | string | Model connector/provenance used for the Reason phase (FR-5). |
| `timestamp` | ISO string | Act-phase emission timestamp (FR-7). |
| `critical` | object | `{outcomeCorrectness, actionSafety, idempotency, recordCoverage}` each boolean. |
| `weighted` | object | `{evidenceCompleteness, confidenceCalibration, rationaleActionability}` each number 0..1. |
| `weightedScore` | number | `0.4*evidenceCompleteness + 0.3*confidenceCalibration + 0.3*rationaleActionability`. |
| `threshold` | object | `{value: 0.80, status: "proposed/unratified"}` (proposal.md §What Changes). |
| `counts` | object | `{records: 1, proposals: <n>, evidenceBlocks: <n>}`. |
| `trace` | optional object | `{tokens, latencyMs}` when trace data exists (proposal.md §What Changes). |

### Scorecard/evidence artifact

| Field | Type | Purpose |
| --- | --- | --- |
| `capability` | string | `false-positive-reduction` (proposal.md §What Changes). |
| `profile` | string | Eval profile identifier. |
| `dataset` | string | `fpr-golden-v0`. |
| `model` | string | Model identifier. |
| `worker` | string | Worker identifier. |
| `version` | string | Manifest/serializer version. |
| `dimensions` | object | Critical and weighted dimension results. |
| `records` | array | One `WorkerEvaluationRecord` per whole-worker run. |
| `proposals` | number | Count of proposals evaluated. |
| `tokens` | optional number | From trace data. |
| `latencyMs` | optional number | From trace data. |
| `costBasis` | string | `"trace-derived; no guessed dollars"` (proposal.md §What Changes). |

### `fpr-golden-v0` manifest entry

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | string | Canonical seed identifier. |
| `family` | enum | `benign`, `insufficient-evidence`, `risky-exception`, `duplicate-replay`, `malformed-output`, `broken-expected-result`. |
| `alert` | object | Reused PD-3 alert fixture (no hand-duplication). |
| `expected` | object | Expected Proposal/Result shape for pass cases; deliberately wrong for the broken fixture. |
| `tags` | string[] | Capability/profile tags for filtering. |

Forward: specs — confirm the exact field list for run/proposal/evidence/dataset/profile/version identity once the existing Proposal/Evidence types and `@kbn/evals` result metadata API are inspected (research.md §Open Questions).

## Failure Modes

- **Malformed or empty model output in the Reason phase** — the existing output validation guard (FR-6) fails closed before the Act phase runs, so no Proposal is emitted and the evaluation record marks `outcomeCorrectness` and `actionSafety` false. The run still produces exactly one record with a failure reason.

- **Duplicate whole-worker run** — the idempotency critical gate (FR-3, A-3) detects an existing worker result tag on the alert and prevents a second Proposal/record from being created. The scorer marks `idempotency` false if a duplicate is attempted, and the exporter guarantees `records.length === 1` per `runId`.

- **Missing or unknown approval policy** — the Act phase approval gate (FR-7) fails closed without approval. The scorer marks `actionSafety` false when the policy is missing or does not match the expected bounded action.

- **Vacuous eval gate** — if the broken fixture does not fail, the non-vacuity test (FR-10, A-3) itself fails, blocking declaration of done. This is the primary regression-flip guard.

- **Connector flakiness** — the offline dataset gate uses retry/backoff or a fixed-seed/recorded-fixture fallback (A-4). The live UI-journey gate uses explicit wait-for-state assertions and retries per project convention (A-5).

- **Existing `.evaluation-*` API cannot carry required metadata** — the kill/pivot path from the operator description applies: ship a tested serializer/contract seam plus an explicit blocked integration test naming the missing extension point, rather than introducing another index or store.

Forward: design — validate the exact `@kbn/evals` result metadata extension point before writing the serializer; if it cannot carry the fields above, switch to the kill/pivot seam (research.md §Open Questions).

## Alternatives Considered

- **New Elasticsearch index or saved object for `WorkerEvaluationRecord`** — rejected by the proposal constraint: no new index, saved object, service, registry, package, or plugin (proposal.md §What Changes). The record travels through existing `@kbn/evals` dataset/experiment result metadata.

- **Generic platform evaluation record type** — rejected. The proposal explicitly requires the smallest concrete `WorkerEvaluationRecord` for this slice, not a competing generic platform record (proposal.md §What Changes).

- **Multi-judge LLM fanout for rationale quality** — rejected for this phase. If an LLM judge is needed, a single targeted judge is used and its identity is preserved; broad multi-judge fanout is deferred (proposal.md §Constraints).

- **Production-grade rollback/revert framework** — out of scope per FR-15 and the reconciliation table; not designed here.

- **Shared #17944 readiness gate** — the existing spike-local readiness gate is kept explicit as temporary. The suggested enhancement to retire it once shared behavior #17944 lands is noted but not implemented in this slice (proposal.md §Suggested Enhancements).
