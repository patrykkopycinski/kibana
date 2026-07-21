# Tasks

## Phase 0: Recon and Grounding

#### 1.1 Explore Daybreak worker modules and eval storage anchors @host:worker-m1max

**File**: `.ao/recon.md`

**Intent**: Map the exact locations of the Daybreak alert-analysis worker, Proposal/Evidence clients, `@kbn/evals` result metadata API, PD-3 fixtures, and feature flag so downstream implementation tasks can ground their contracts in real code instead of the open questions listed in `research.md`.

**Contract**:
- Document section "Code References" lists at least: (a) Daybreak worker entry file path, (b) Proposal/Evidence runtime type file path, (c) `@kbn/evals` result metadata API file path, (d) PD-3 fixture manifest file path, (e) experimentalFeatures flag declaration file path.
- Document section "Integration Points" describes how the worker path, Proposal/Evidence clients, and `@kbn/evals` result metadata connect.

**Traces**: (infrastructure), FR-004, FR-015

### Verification:

#### Automated:
- [ ] 1.1 `.ao/recon.md` exists and contains all five required code references ((infrastructure))

#### Manual:
*(none)*

---

## Phase 1: WorkerEvaluationRecord Type and Serializer

#### 2.1 Add WorkerEvaluationRecord runtime type and serializer @host:worker-m1max

**File**: `TBD from recon — adjacent to existing PD-3 eval modules inside the Daybreak plugin boundary`

**Intent**: Add the smallest concrete runtime type and serializer for the L4 evaluation record, reusing existing Proposal/Evidence shapes where available and staying inside the existing Daybreak plugin boundary without crossing a new package.

**Contract**:
```typescript
interface WorkerEvaluationRecord {
  runId: string;
  proposalId: string;
  evidenceId: string;
  datasetId: string;
  profileId: string;
  version: string;
  workerId: string;
  modelId: string;
  timestamp: string;
  critical: {
    outcomeCorrectness: boolean;
    actionSafety: boolean;
    idempotency: boolean;
    recordCoverage: boolean;
  };
  weighted: {
    evidenceCompleteness: number;
    confidenceCalibration: number;
    rationaleActionability: number;
  };
  weightedScore: number;
  threshold: { value: 0.80; status: 'proposed/unratified' };
  counts: { records: number; proposals: number; evidenceBlocks: number };
  trace?: { tokens?: number; latencyMs?: number };
}

function serializeWorkerEvaluationRecord(record: WorkerEvaluationRecord): unknown;
function deserializeWorkerEvaluationRecord(input: unknown): WorkerEvaluationRecord;
```

**Traces**: FR-001, FR-002, FR-003, FR-004

### Verification:

#### Automated:
- [ ] 2.1 Type check passes for the WorkerEvaluationRecord module (FR-001, FR-002, FR-003, FR-004)
- [ ] 2.1 Serializer round-trip tests pass for a valid record and fail closed on malformed input (FR-001, FR-002)

#### Manual:
*(none)*

---

## Phase 2: Deterministic Scorer

#### 3.1 Implement deterministic scorer with critical and weighted dimensions @host:worker-m1max

**File**: `TBD from recon — inside the Daybreak plugin boundary adjacent to the WorkerEvaluationRecord module`

**Intent**: Implement a scorer that evaluates a whole-worker run against critical hard gates and weighted dimensions, producing a scorecard with the proposed/unratified threshold stored as metadata, not as a ratified production gate.

**Contract**:
```typescript
interface ScoreDimensions {
  critical: {
    outcomeCorrectness: boolean;
    actionSafety: boolean;
    idempotency: boolean;
    recordCoverage: boolean;
  };
  weighted: {
    evidenceCompleteness: number;
    confidenceCalibration: number;
    rationaleActionability: number;
  };
}

function scoreWorkerRun(input: {
  record: WorkerEvaluationRecord;
  expected: unknown;
  approvalPolicy: unknown;
  duplicateAttempted: boolean;
}): {
  dimensions: ScoreDimensions;
  weightedScore: number;
  passed: boolean;
  failureReasons: string[];
};
```

**Traces**: FR-005, FR-006, FR-007, FR-008, FR-009, FR-010

### Verification:

#### Automated:
- [ ] 3.1 Unit tests for scorer pass (FR-005, FR-006, FR-007, FR-008, FR-009, FR-010)

#### Manual:
*(none)*

---

## Phase 3: fpr-golden-v0 Seed Manifest

#### 4.1 Build versioned fpr-golden-v0 seed manifest from existing PD-3 fixtures @host:worker-m1max

**File**: `TBD from recon — reusing the canonical PD-3 fixture manifest location`

**Intent**: Create a single versioned seed manifest that reuses the canonical PD-3 fixture definitions and covers all required scenario families, including one deliberately broken fixture to prove the gate is non-vacuous.

**Contract**:
```typescript
interface FprGoldenSeed {
  id: string;
  family: 'benign' | 'insufficient-evidence' | 'risky-exception' | 'duplicate-replay' | 'malformed-output' | 'broken-expected-result';
  alert: unknown; // reused PD-3 alert fixture
  expected: unknown; // expected Proposal/Result; deliberately wrong for broken family
  tags: string[];
}

const fprGoldenV0: { version: string; datasetId: string; seeds: FprGoldenSeed[] };
```

**Traces**: FR-011, FR-012, FR-013, FR-014

### Verification:

#### Automated:
- [ ] 4.1 `fpr-golden-v0` manifest loads and covers all six scenario families (FR-011, FR-012, FR-013, FR-014)

#### Manual:
*(none)*

---

## Phase 4: Eval Suite Integration and Scorecard Export

#### 5.1 Extend PD-3 @kbn/evals FPR suite to invoke worker and collect records @host:worker-m1max

**File**: `TBD from recon — existing PD-3 @kbn/evals FPR suite`

**Intent**: Extend the existing PD-3 eval suite so the real Daybreak worker path runs against the `fpr-golden-v0` manifest and produces exactly one `WorkerEvaluationRecord` per whole-worker run, carried through the existing `@kbn/evals` result metadata surface.

**Contract**: see `design.md` §Eval suite integration; after recon, contract will be grounded in the exact `@kbn/evals` result metadata API path.

**Traces**: FR-015, FR-017, FR-023, FR-025

#### 5.2 Add scorecard/evidence exporter to eval suite @host:worker-m1max

**File**: `TBD from recon — alongside the extended PD-3 eval suite`

**Intent**: Add an exporter that writes a machine-readable scorecard artifact from each eval run, including provenance, dimension results, record/proposal counts, and trace-derived tokens/latency without guessed costs.

**Contract**:
```typescript
interface ScorecardArtifact {
  capability: 'false-positive-reduction';
  profile: string;
  dataset: 'fpr-golden-v0';
  model: string;
  worker: string;
  version: string;
  dimensions: ScoreDimensions & { weightedScore: number; threshold: { value: 0.80; status: 'proposed/unratified' } };
  records: WorkerEvaluationRecord[];
  proposals: number;
  tokens?: number;
  latencyMs?: number;
  costBasis: 'trace-derived; no guessed dollars';
}

function exportScorecard(result: unknown): ScorecardArtifact;
```

**Traces**: FR-018, FR-019, FR-020, FR-021, FR-022, FR-024

#### 5.3 Add non-vacuity test for deliberately broken fixture @host:worker-m1max

**File**: `TBD from recon — in the extended PD-3 eval test suite`

**Intent**: Add a test that proves the evaluation gate is not vacuous by showing the broken fixture fails while its valid counterpart passes.

**Contract**:
- Tests assert: (a) the seed with family `broken-expected-result` fails at least one critical dimension; (b) the matching non-broken seed passes all critical dimensions.

**Traces**: FR-014, FR-027, FR-030

### Verification:

#### Automated:
- [ ] 5.1 Extended `@kbn/evals` FPR suite runs against existing worker path (FR-015, FR-017, FR-023, FR-025)
- [ ] 5.2 Scorecard artifact is produced with required provenance and dimension fields (FR-018, FR-019, FR-020, FR-021, FR-022, FR-024)
- [ ] 5.3 Non-vacuity test passes: broken fixture fails, valid counterpart passes (FR-014, FR-027, FR-030)

#### Manual:
*(none)*

---

## Phase 5: Validation, Documentation, and Quality Gates

#### 6.1 Add unit and contract tests for scorer and record semantics @host:worker-m1max

**File**: `TBD from recon — new test file inside the Daybreak plugin test boundary`

**Intent**: Prove with tests that critical dimensions are hard gates, weighted score is computed correctly, missing/unknown approval policy fails closed, and duplicate runs do not create duplicate records.

**Contract**:
- Tests assert: (a) any false critical dimension causes `passed=false`; (b) `weightedScore` equals `0.4*evidenceCompleteness + 0.3*confidenceCalibration + 0.3*rationaleActionability`; (c) missing/unknown approval policy sets `actionSafety=false`; (d) `duplicateAttempted=true` sets `idempotency=false` and records count stays 1.

**Traces**: FR-028, FR-029

#### 6.2 Add implementation documentation @host:worker-m1max

**File**: `TBD from recon — README beside the implementation`

**Intent**: Document what the slice proves, that the 0.80 threshold is proposed/unratified, the #17944 dependency, how human decisions become replay labels, and that the spike-local readiness gate is temporary.

**Contract**:
- Document section "What this slice proves" claims: (a) one complete FPR run through L0-L4; (b) 0.80 threshold is proposed/unratified; (c) depends on shared #17944 behavior; (d) human decisions become replay labels via the mechanism documented in `research.md`/recon; (e) spike-local readiness gate is temporary and does not prove shared #17944 behavior.

**Traces**: FR-037, FR-038, FR-039, FR-040, FR-041

#### 6.3 Run scoped validation gates @host:worker-m1max

**File**: `TBD from recon — Daybreak plugin and affected eval/Scout paths`

**Intent**: Execute the scoped Daybreak Jest, type check, eslint, and affected eval/Scout behavioral path to satisfy the quality gate, while preserving the default-off feature flag and the no-new-package/plugin/index/service/store constraint.

**Contract**:
- Commands: `node scripts/jest --maxWorkers=4 --workerIdleMemoryLimit=512MB <daybreak test path>`; `node scripts/type_check --project <daybreak tsconfig>`; `node scripts/eslint --fix $(git diff --name-only HEAD)`; affected eval/Scout path passes.
- No new package, plugin, Elasticsearch index, saved object, service, or store is added.
- Feature flag remains default off.
- No tracked symlinks are introduced.

**Traces**: FR-031, FR-032, FR-033, FR-034, FR-035, FR-036

### Verification:

#### Automated:
- [ ] 6.1 Unit/contract tests for scorer and record semantics pass (FR-028, FR-029)
- [ ] 6.2 Documentation file exists and contains all required claims (FR-037, FR-038, FR-039, FR-040, FR-041)
- [ ] 6.3 Scoped Daybreak Jest, type check, eslint, and affected eval/Scout path pass (FR-031, FR-032, FR-033, FR-034, FR-035, FR-036)

#### Manual:
*(none)*
