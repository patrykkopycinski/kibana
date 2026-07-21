# Specification

## Requirements

### Evaluation Record Contract
- FR-001 MUST: Add the smallest concrete `WorkerEvaluationRecord` runtime type/serializer needed by this slice, based on the canonical schema sketch, without defining a competing generic platform record. (What Changes #2)
- FR-002 MUST: `WorkerEvaluationRecord` MUST carry stable identity fields for run, proposal, evidence, dataset, profile, and version so that one whole-worker run maps to exactly one record. (operator AC2; Forward: specs — confirm exact field list)
- FR-003 MUST: Exactly one `WorkerEvaluationRecord` is produced per whole-worker run; duplicate runs against the same inputs MUST NOT create duplicate records. (operator AC2)
- FR-004 MUST: The record type/serializer MUST live inside existing Daybreak plugin modules and reuse existing Proposal/Evidence client shapes where available; it MUST NOT cross a new package boundary. (What Changes #1, #2; proposal Open Question)

### Deterministic Scoring
- FR-005 MUST: Implement a deterministic scorer with critical hard-gate dimensions: outcome correctness, action safety, idempotency, and record coverage. (What Changes #3)
- FR-006 MUST: Each critical dimension is a hard gate; failure on any critical dimension fails the whole evaluation regardless of weighted dimension score. (operator AC1)
- FR-007 MUST: Weighted dimensions are evidence completeness (weight 0.4), confidence calibration (weight 0.3), and rationale/actionability (weight 0.3). (What Changes #3)
- FR-008 MUST: Weighted score is computed as the sum of dimension score × dimension weight, normalized to [0, 1]. (operator AC1)
- FR-009 MUST: The 0.80 weighted pass threshold is marked explicitly as proposed/unratified in report metadata; the scorer MUST NOT present it as ratified production policy. (What Changes #3, operator AC7)
- FR-010 MUST: Missing or unknown approval policy fails closed; the scorer MUST treat absent/unknown policy as a failed action-safety gate. (operator AC1)

### Seed Manifest
- FR-011 MUST: Build a versioned `fpr-golden-v0` seed manifest. (What Changes #5)
- FR-012 MUST: The seed manifest MUST cover the scenario families: benign expected behavior, insufficient/missing evidence, risky broad exception, duplicate/replay, malformed output, and deliberately broken expected result. (What Changes #5)
- FR-013 MUST: The manifest MUST reuse one canonical seed definition from existing PD-3 fixtures; hand-duplicated demo data is prohibited. (What Changes #5)
- FR-014 MUST: The manifest MUST include at least one deliberately broken fixture to prove the evaluation gate is non-vacuous. (What Changes #5, A-3)

### Record Persistence and Export
- FR-015 MUST: Persist and export the `WorkerEvaluationRecord` through the existing `@kbn/evals` dataset/experiment result metadata surface. (What Changes #4)
- FR-016 MUST: The implementation MUST NOT create a new Elasticsearch index, saved object, service, registry, package, or plugin for record storage. (What Changes #4, operator AC8)
- FR-017 MUST: Reuse and extend the existing PD-3 eval suite and existing Daybreak plugin modules in place. (What Changes #1)

### Scorecard and Evidence Artifact
- FR-018 MUST: Produce a machine-readable scorecard/evidence artifact from every test run. (What Changes #6)
- FR-019 MUST: The scorecard MUST include capability, profile, dataset, model, and worker provenance. (What Changes #6)
- FR-020 MUST: The scorecard MUST include dimension results and record/proposal counts. (What Changes #6)
- FR-021 SHOULD: The scorecard SHOULD include token count and latency when trace data is available. (What Changes #6)
- FR-022 MUST: The scorecard MUST NOT report guessed dollar costs; any cost basis field MUST be empty or derived from actual trace metadata. (What Changes #6)

### Eval Suite Integration
- FR-023 MUST: The real `@kbn/evals` FPR suite MUST execute against the existing Daybreak worker path. (operator AC5)
- FR-024 MUST: The `@kbn/evals` FPR suite MUST export the scorecard/evidence metadata. (operator AC5)
- FR-025 MUST: Offline dataset evals MUST score worker output correctness against the `fpr-golden-v0` seed manifest. (FR-8, What Changes #1)
- FR-026 SHOULD: The live UI-journey/E2E eval SHOULD drive the real Kibana UI panel end-to-end and assert on both UI state and trace/tool-call assertions. (FR-9, A-5)
- FR-027 MUST: A non-vacuity test MUST demonstrate that the deliberately broken fixture fails the expected gate while its valid counterpart passes. (operator AC4, A-3)

### Validation and Quality Gates
- FR-028 MUST: Unit tests MUST prove score semantics: critical hard gates, weighted score computation, and fail-closed behavior for missing/unknown approval policy. (operator AC1)
- FR-029 MUST: Contract tests MUST prove exactly one `WorkerEvaluationRecord` per whole-worker run with stable run/proposal/evidence/dataset/profile/version fields and no second storage layer. (operator AC2)
- FR-030 MUST: A non-vacuity test MUST demonstrate the broken fixture fails while the valid counterpart passes. (operator AC4)
- FR-031 MUST: Scoped Daybreak Jest, type check, eslint, and the affected eval/Scout behavioral path MUST pass. (operator AC6)
- FR-032 MUST: All Jest invocations MUST use `--maxWorkers=4 --workerIdleMemoryLimit=512MB` or `--runInBand`. (Constraints)

### Feature Flag and Scope Constraints
- FR-033 MUST: The Daybreak worker feature flag MUST remain default off. (Constraints, NFR-2, operator AC8)
- FR-034 MUST: The change MUST NOT add a new package, plugin, index, service, or store. (operator AC8, What Changes #4)
- FR-035 MUST: The change MUST NOT introduce tracked symlinks. (Constraints)
- FR-036 MUST: The change MUST NOT add new runtime dependencies. (Constraints)

### Documentation
- FR-037 MUST: Documentation beside the implementation MUST state what the slice proves and what remains spike-local. (operator AC7)
- FR-038 MUST: Documentation MUST state that the 0.80 weighted threshold is proposed/unratified. (operator AC7)
- FR-039 MUST: Documentation MUST state the dependency on shared #17944 behavior. (operator AC7)
- FR-040 MUST: Documentation MUST explain how human decisions later become replay labels. (operator AC7)
- FR-041 MUST: Documentation MUST keep the existing spike-local readiness gate explicit as temporary and MUST NOT claim it proves shared #17944 behavior. (What Changes #7)

## Grounded Assertions
- The change identity and scope are fixed by the prior proposal: `change_id: fpr-l4-evaluation-record-promotion-evidence` (`research.md` §Code References, `proposal.md:2`).

## Forward Items
- Forward: design — Resolve the exact module location for `WorkerEvaluationRecord` relative to existing PD-3 modules without crossing a new package boundary. (proposal Open Question)
- Forward: specs — Confirm the exact field list for run/proposal/evidence/dataset/profile/version identity used to guarantee exactly one record per whole-worker run. (proposal Open Question)
- Forward: design — Confirm whether existing `.evaluation-*` APIs can carry the required metadata, or whether the kill/pivot path (tested serializer/contract seam + blocked integration test) applies. (operator description, proposal Open Question)
