---
tasks_completed: 13
tasks_total: 13
---
# Tasks

## Phase 0: Client Scaffolding & A-1 Resolution

#### 0.1 Create minimal Agent Builder agent scoped to `alert-analysis`

**File**: `x-pack/solutions/security/plugins/daybreak/server/agent_builder/ensure_alert_analysis_agent.ts`

**Intent**: Resolve A-1 — the shape session's reconciliation table flags this as "the top execution risk of the whole spike" and PD-2's opening task. Research confirms no agent wrapping the `alert-analysis` skill exists yet (`invoke_agent.yml`'s `agent-id: alert.triage` is illustrative, not registered — research.md Finding 3) and supplies the binding mechanism: `AgentConfiguration.skill_ids?: string[]` (`x-pack/platform/packages/shared/agent-builder/agent-builder-common/agents/definition.ts:82-131`), created via the service path research.md cites at `x-pack/platform/plugins/shared/agent_builder/server/routes/agents.ts:312`. Done looks like: an idempotent helper that creates (or returns) an agent whose `skill_ids` is exactly `['alert-analysis']` — narrower than the default `elastic-ai-agent`'s all-skills scope (`agents.ts:22-27`), per the Hard Constraint against widening the skill's tool allowlist.

**Contract**:
```typescript
export interface AlertAnalysisAgentHandle {
  id: string;
}

export async function ensureAlertAnalysisAgent(
  agentsService: AgentsServiceStart
): Promise<AlertAnalysisAgentHandle>;
// Idempotent: if an agent with skill_ids === ['alert-analysis'] already exists, returns its id
// without creating a duplicate. Otherwise calls agentsService.create(...) with
// configuration.skill_ids: ['alert-analysis'].
```

**Traces**: FR-012, FR-013

#### 0.2 Implement Evidence store

**File**: `x-pack/solutions/security/plugins/daybreak/server/client/evidence/client.ts`

**Intent**: Re-author the Evidence store from scratch. Research established that only compiled `target/types/server/client/evidence/*.d.ts` exists on the `daybreak-spike` worktree — zero commits under `server/client/*` and an empty stash (research.md Finding 6) — so the `.d.ts` shapes are used strictly as a type-shape reference, per the Hard Constraint against treating them as a scaffold. Done looks like: a working `EvidenceClient` backing the Enrich phase's evidence packaging (FR-4), persisted to a `.daybreak-evidence` index.

**Contract**:
```typescript
export interface EvidenceRecord {
  id: string;
  kind: string;
  sourceRef: string;
  summary: string;
  provenance: string;
  confidence: number;
  stance: string;
  limitations: string[];
  sensitivityLabel: string;
  createdAt: string;
}

export class EvidenceClient {
  create(input: Omit<EvidenceRecord, 'id' | 'createdAt'>): Promise<EvidenceRecord>;
  get(id: string): Promise<EvidenceRecord | null>;
  list(params?: { sourceRef?: string }): Promise<EvidenceRecord[]>;
  update(id: string, patch: Partial<EvidenceRecord>): Promise<EvidenceRecord>;
  delete(id: string): Promise<void>;
}
```

**Traces**: FR-001, FR-002, FR-003

#### 0.3 Implement Proposals store with fail-closed readiness gate

**File**: `x-pack/solutions/security/plugins/daybreak/server/client/proposals/client.ts`

**Intent**: Re-author the Proposals store under the same source-recovery constraint as 0.2 (research.md Finding 6), including the `evaluateReadinessGate`/`requireReadinessGate` fail-closed gate that backs the Act phase's approval boundary (FR-7). Done looks like: a `ProposalClient` plus a gate function that rejects `approved` status unless both `evidenceRefs` and `recommendation` are non-empty.

**Contract**:
```typescript
export interface ProposalRecord {
  id: string;
  status: 'pending' | 'approved';
  evidenceRefs: string[];
  recommendation: string;
  actor: string;
  timestamp: string;
  rationale: string;
}

export class ProposalClient {
  create(input: Omit<ProposalRecord, 'id' | 'timestamp'>): Promise<ProposalRecord>;
  get(id: string): Promise<ProposalRecord | null>;
  list(): Promise<ProposalRecord[]>;
  update(id: string, patch: Partial<ProposalRecord>): Promise<ProposalRecord>;
  delete(id: string): Promise<void>;
}

export function evaluateReadinessGate(
  proposal: Pick<ProposalRecord, 'evidenceRefs' | 'recommendation'>
): { ready: boolean; reasons: string[] };

export function requireReadinessGate(
  proposal: Pick<ProposalRecord, 'evidenceRefs' | 'recommendation'>
): void; // throws when evidenceRefs or recommendation is empty
```

**Traces**: FR-004, FR-005

### Verification:

#### Automated:
- [ ] 0.1 `node scripts/jest x-pack/solutions/security/plugins/daybreak/server/agent_builder/ensure_alert_analysis_agent.test.ts` passes, asserting the created agent's `configuration.skill_ids` equals `['alert-analysis']` (FR-012, FR-013) @host:kibana-i9
- [ ] 0.2 `node scripts/jest x-pack/solutions/security/plugins/daybreak/server/client/evidence/client.test.ts` passes (FR-001, FR-002, FR-003) @host:kibana-i9
- [ ] 0.3 `node scripts/jest x-pack/solutions/security/plugins/daybreak/server/client/proposals/client.test.ts` passes, including a case asserting `requireReadinessGate` throws on empty `evidenceRefs` + empty `recommendation` (FR-004, FR-005) @host:kibana-i9

#### Manual:
*(none)*

---

## Phase 1: Setup, Guard, Enrich Phases

#### 1.1 Setup phase — config-fetch step

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/alert_analysis_worker.yaml`

**Intent**: Load per-space runtime config (enabled flag, connector, thresholds) as the workflow's first step, mirroring PD-1's `fetch_runtime_config` step shape (per the proposal's What Changes and design's Components section). Done looks like: a first workflow step that fetches this config and short-circuits the rest of the workflow when `enabled` is false.

**Contract**:
- The workflow's first step (`id: setup_load_config`) uses the same config-fetch step type as PD-1's `fetch_runtime_config` step and returns `{ enabled, connector, thresholds }` scoped to the alert's space.
- When `enabled` is `false`, no downstream phase (Guard/Enrich/Reason/Act) executes.

**Traces**: FR-006, FR-007

#### 1.2 Guard phase — idempotency/dedup step

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/alert_analysis_worker.yaml`

**Intent**: Prevent re-processing an alert that already carries this worker's result tag (hook 2). Done looks like: a Guard step that inspects the alert document and halts before Enrich/Reason/Act when the tag is present.

**Contract**:
- A workflow step (`id: guard_dedup_check`) reads the incoming alert's tags; if this worker's result tag is already present, the workflow halts before Enrich executes and reports a "skipped: already processed" result rather than an error.

**Traces**: FR-006, FR-008

#### 1.3 Enrich phase — evidence packaging with input validation

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/enrich_alert_schema.ts`

**Intent**: Package real alert data into a compact ground-truth evidence block, schema-validated at this boundary (NFR-4, FR-018) and structurally kept separate from any Reason-phase framing/rubric text so evidence content cannot read as instructions (FR-019). Done looks like: a validation function that rejects malformed alert input before it reaches the Enrich step's output, and a packaging function whose output type has no field shared with prompt-framing text.

**Contract**:
```typescript
export const alertInputSchema: ZodType<AlertInput>; // throws/fails validation on malformed alert input

export interface EvidenceGroundTruthBlock {
  summary: string;
  sourceRef: string;
  // structurally distinct from any Reason-phase framing/rubric type —
  // no shared field that could smuggle instruction-like text into the model prompt
}

export function packageEvidence(alert: AlertInput): EvidenceGroundTruthBlock;
```

**Traces**: FR-006, FR-009, FR-018, FR-019

### Verification:

#### Automated:
- [ ] 1.1 Integration test in `alert_analysis_worker.test.ts` asserts the Setup step's structured output shape and that `enabled: false` short-circuits the run (FR-006, FR-007) @host:kibana-i9
- [x] 1.2 Integration test in `alert_analysis_worker.test.ts` asserts the Guard step halts when the alert already carries the result tag (FR-006, FR-008) @host:kibana-i9
- [ ] 1.3 `node scripts/jest x-pack/solutions/security/plugins/daybreak/server/workflow/enrich_alert_schema.test.ts` passes, asserting `alertInputSchema` rejects malformed input and `packageEvidence`'s output type carries no framing/rubric field (FR-009, FR-018, FR-019) @host:kibana-i9

#### Manual:
*(none)*

---

## Phase 2: Reason Phase, Output Guard, Act Phase

#### 2.1 Reason phase — `ai.agent` step invoking `alert-analysis`

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/alert_analysis_worker.yaml`

**Intent**: Replace PD-1's stub `type: inference` connector step with the real `ai.agent` step type, bound to the agent created in Task 0.1, invoking the existing `alert-analysis` skill without modifying it. Grounded in research.md Finding 1 (`RunAgentStepTypeId = 'ai.agent'` at `x-pack/platform/plugins/shared/agent_builder/common/step_types/run_agent_step.ts:21`, registered via `registerStepDefinition` at `x-pack/platform/plugins/shared/agent_builder/server/plugin.ts:128-131`) and Finding 2 (raw `inference.*`/`bedrock.*`/`gen-ai.*`/`gemini.*` steps are deprecated in favor of `ai.*`, `src/platform/packages/shared/kbn-workflows/spec/deprecated_step_metadata.ts:53-58`). Done looks like: the Reason step's `type` field is `ai.agent`, its `agent-id` matches the handle from Task 0.1, and its `with.schema` carries the Zod-derived structured-output schema.

**Contract**:
- The Reason step (`id: reason_invoke_agent`) sets `type: ai.agent`, `config.agent-id` equal to the id returned by `ensureAlertAnalysisAgent`, and `input.schema` derived from a Zod schema describing the verdict output.
- The Reason step's `type` MUST NOT be `inference`, `bedrock.*`, `gen-ai.*`, or `gemini.*`.
- `alert_analysis_skill.ts` (`x-pack/solutions/security/plugins/security_solution/server/agent_builder/skills/alert_analysis/alert_analysis_skill.ts`) is referenced by id only and is not edited by this task.

**Traces**: FR-010, FR-011, FR-012, FR-013

#### 2.2 Output validation guard step

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/output_validation_guard.ts`

**Intent**: Implement hook 5 as an explicit boundary step between Reason and Act — per PD-1's README, this is not an engine built-in. Done looks like: malformed or empty `ai.agent` output halts the workflow with a visible error and never lets Act proceed with an unvalidated verdict.

**Contract**:
```typescript
export class WorkflowHaltError extends Error {
  readonly phase: 'reason';
}

export function validateReasonOutput(raw: unknown): AlertVerdict;
// Throws WorkflowHaltError when raw is undefined, null, an empty object,
// or fails the AlertVerdict schema check. Never returns a partially-defaulted verdict.
```

**Traces**: FR-015, FR-016

#### 2.3 Act phase — Proposal emission with approval gate

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/alert_analysis_worker.yaml`

**Intent**: Emit an auditable Proposal from the validated verdict and gate any consequential action behind `requireReadinessGate` (Task 0.3), failing closed without approval (FR-7). Done looks like: the Act step always creates a `pending` Proposal, and any downstream action step calls `requireReadinessGate` first, which throws for a non-`approved` Proposal.

**Contract**:
- The Act step (`id: act_emit_proposal`) calls `ProposalClient.create` with `actor`, `timestamp`, and `rationale` populated from the validated `AlertVerdict`.
- Any consequential-action step following Act calls `requireReadinessGate(proposal)` before executing; on a `pending` (non-approved) Proposal, the action step does not run.

**Traces**: FR-014

### Verification:

#### Automated:
- [ ] 2.1 Integration test in `alert_analysis_worker.test.ts` asserts the Reason step's `type` is `ai.agent` with `agent-id` matching the Task 0.1 agent (FR-010, FR-011, FR-012, FR-013) @host:kibana-i9
- [ ] 2.2 `node scripts/jest x-pack/solutions/security/plugins/daybreak/server/workflow/output_validation_guard.test.ts` passes, asserting `validateReasonOutput` throws `WorkflowHaltError` on malformed/empty input (FR-015, FR-016) @host:kibana-i9
- [x] 2.3 Integration test in `alert_analysis_worker.test.ts` asserts a `pending` Proposal blocks the consequential-action step via `requireReadinessGate` (FR-014) @host:kibana-i9

#### Manual:
*(none)*

---

## Phase 3: Runner Entry Point & End-to-End Integration Test

#### 3.1 Runner entry point for the 5-phase workflow

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/run_alert_analysis_worker.ts`

**Intent**: Extend (not replace) PD-1's `run_spike_workflow.ts` pattern, reusing the same `executeWorkflow` wrapper, to invoke `alert_analysis_worker.yaml` in place of the 3-step spike workflow.

**Contract**:
```typescript
export interface WorkerDeps {
  agentsService: AgentsServiceStart;
  evidenceClient: EvidenceClient;
  proposalClient: ProposalClient;
}

export async function runAlertAnalysisWorker(
  input: AlertInput,
  deps: WorkerDeps
): Promise<WorkflowRunResult>;
// Internally calls the same executeWorkflow(...) wrapper used by PD-1's run_spike_workflow.ts,
// pointed at alert_analysis_worker.yaml instead of spike_workflow.yaml.
```

**Traces**: FR-017

#### 3.2 Integration test — full 5-phase run + fail-closed case

**File**: `x-pack/solutions/security/plugins/daybreak/server/workflow/alert_analysis_worker.test.ts`

**Intent**: Extend PD-1's `WorkflowRunFixture` pattern (`workflow_engine_shape.test.ts`) to exercise the full 5-phase workflow end-to-end, asserting per-phase structured output and the fail-closed guard behavior — this is the test file the Phase 1 and Phase 2 verification bullets above already reference.

**Contract**:
- Tests assert: a happy-path run through `runAlertAnalysisWorker` produces structured output for each of Setup, Guard, Enrich, Reason, and Act.
- Tests assert: feeding a malformed/empty mock `ai.agent` response causes the run to halt at the output-validation guard (Task 2.2) and results in zero `ProposalClient.create` calls.

**Traces**: FR-021, FR-022, FR-023

### Verification:

#### Automated:
- [ ] 3.1 `node scripts/type_check --project x-pack/solutions/security/plugins/daybreak/tsconfig.json` passes on `run_alert_analysis_worker.ts` (FR-017) @host:kibana-i9
- [ ] 3.2 `node scripts/jest x-pack/solutions/security/plugins/daybreak/server/workflow/alert_analysis_worker.test.ts` passes, covering the happy-path per-phase assertions and the fail-closed case (FR-021, FR-022, FR-023) @host:kibana-i9

#### Manual:
*(none)*

---

## Phase 4: Hardening Verification & Stale Artifact Cleanup

#### 4.1 Verify `alert-analysis` skill tool allowlist is not widened

**File**: `x-pack/solutions/security/plugins/security_solution/server/agent_builder/skills/alert_analysis/alert_analysis_skill.test.ts`

**Intent**: Confirm (without editing `alert_analysis_skill.ts`, per the Hard Constraints) that its tool allowlist remains exactly what research.md Finding 5 documents at `alert_analysis_skill.ts:93-148` — `SECURITY_ALERTS_TOOL_ID`, `SECURITY_LABS_SEARCH_TOOL_ID`, `SECURITY_ENTITY_RISK_SCORE_TOOL_ID`, and the inline `security.alert-analysis.get-related-alerts` tool.

**Contract**:
- Tests assert: `alertAnalysisSkill`'s registered tool ids equal exactly `[SECURITY_ALERTS_TOOL_ID, SECURITY_LABS_SEARCH_TOOL_ID, SECURITY_ENTITY_RISK_SCORE_TOOL_ID, 'security.alert-analysis.get-related-alerts']` — no additional tool id.

**Traces**: FR-020

#### 4.2 Delete stale build artifacts

**File**: `x-pack/solutions/security/plugins/daybreak/target/types/server/client/`

**Intent**: Remove the misleading orphan `.d.ts` output for `evidence/` and `proposals/` now that real `.ts` source exists (Tasks 0.2, 0.3) — these directories will regenerate correctly from the real source.

**Contract**:
- Delete directories `target/types/server/client/evidence/` and `target/types/server/client/proposals/` from the working tree.

**Traces**: FR-024

### Verification:

#### Automated:
- [ ] 4.1 `node scripts/jest x-pack/solutions/security/plugins/security_solution/server/agent_builder/skills/alert_analysis/alert_analysis_skill.test.ts` passes (FR-020) @host:kibana-i9
- [ ] 4.2 `git status --porcelain x-pack/solutions/security/plugins/daybreak/target/types/server/client` reports no `evidence/` or `proposals/` `.d.ts` files present (FR-024) @host:kibana-i9

#### Manual:
*(none)*
