# Design

## Approach
This phase extends the `daybreak` plugin scaffolded in PD-1 with the real 5-phase Setup→Guard→Enrich→Reason→Act workflow (FR-1..FR-7, PD-2), rather than introducing a new plugin, package, or orchestration layer — PD-1 already validated that the Kibana Workflow Engine expresses the needed step shape (A-2), so this design reuses that engine end-to-end.

The Reason phase (FR-5) is the one step in the existing PD-1 spike that cannot simply be extended: the stub `analyze_alert` step used `type: inference` (`server/workflow/spike_workflow.yaml:39-43` per the proposal), but as identified in research.md, that step family is formally deprecated in favor of the `ai.*` family (`src/platform/packages/shared/kbn-workflows/spec/deprecated_step_metadata.ts:53-57`, `replacementStepType: 'ai.prompt'`). Research.md confirms a purpose-built `ai.agent` step type exists and is already registered — `RunAgentStepTypeId = 'ai.agent'` at `x-pack/platform/plugins/shared/agent_builder/common/step_types/run_agent_step.ts:21`, registered via Workflows Extensions at plugin-setup time (`x-pack/platform/plugins/shared/agent_builder/server/plugin.ts:128-131`), with its server-side handler calling `executeAgent(...)` at `x-pack/platform/plugins/shared/agent_builder/server/step_types/run_agent_step.ts:28-159`. This design replaces the stub connector step with `ai.agent`, not because of style preference but because research.md shows the old family is on a deprecation path away from AI invocation inside workflows.

`ai.agent` invokes an *agent*, not a skill directly. Research.md's Finding 3 shows the `invoke_agent.yml` example's `agent-id: alert.triage` (`src/platform/packages/shared/kbn-workflows/spec/examples/invoke_agent.yml:16-21`) has no matching registered agent anywhere in the repo — it is illustrative. This resolves the proposal's first Open Question in the negative: no workflow-invocable agent wrapping `alert-analysis` exists yet, so PD-2's opening task (per the shape reconciliation table's framing of A-1 as "the top execution risk of the whole spike") must create a minimal one. Research.md's Finding 4 supplies the mechanism: `AgentConfiguration.skill_ids?: string[]` (`x-pack/platform/packages/shared/agent-builder/agent-builder-common/agents/definition.ts:82-131`) scopes an agent to specific skills, and the `create` method invoked at `x-pack/platform/plugins/shared/agent_builder/server/routes/agents.ts:312` is the concrete call site. This design creates a new agent with `configuration.skill_ids: ['alert-analysis']`, binding narrowly to the already-registered skill (`x-pack/solutions/security/plugins/security_solution/server/agent_builder/skills/alert_analysis/alert_analysis_skill.ts:23-148`, registered at `register_skills.ts:81`) rather than reusing the default `elastic-ai-agent`, which per its create request (`agents.ts:22-27`, `skill_ids: []`) exposes *all* skills — a violation of the hard constraint not to widen the alert-analysis skill's tool allowlist (NFR-4).

The Evidence and Proposals stores (`server/client/evidence/`, `server/client/proposals/`) are re-authored as fresh TypeScript source, not extended from the existing `target/types/**/*.d.ts`. Research.md's Finding 6 establishes there is no committed `.ts` source and no stash to recover — the `.d.ts` files are compiled output only. This design treats those declaration files strictly as a type-shape reference during authoring (per the proposal's explicit constraint), and the stale build output is deleted once the real source lands (DoD).

## Components
- **`server/client/evidence/` (client, storage, types)**: `EvidenceClient.create/get/list/update/delete` against a `.daybreak-evidence` index, re-authored from `target/types/server/client/evidence/*.d.ts` (FR: Enrich phase evidence packaging).
- **`server/client/proposals/` (client, storage, types, gate)**: `ProposalsClient` plus `evaluateReadinessGate`/`requireReadinessGate`, re-authored from `target/types/server/client/proposals/*.d.ts` (FR-7's Act-phase output; readiness gate fails closed unless `evidenceRefs` and `recommendation` are both non-empty).
- **Minimal Agent Builder agent (A-1 resolution)**: a new agent configuration with `skill_ids: ['alert-analysis']`, created via the same route/service path research.md identifies at `agents.ts:312`, giving the Reason phase an `agent-id` to bind to.
- **`server/workflow/alert_analysis_worker.yaml`**: the 5-phase workflow —
  - *Setup*: config-fetch step loading per-space runtime config (FR-2), mirroring PD-1's `fetch_runtime_config` pattern.
  - *Guard*: idempotency/dedup check against the alert's existing result tag (FR-3).
  - *Enrich*: packages evidence from the real alert into a compact, structurally separated ground-truth block (FR-4, NFR-4).
  - *Reason*: `type: ai.agent`, `agent-id` bound to the new minimal agent, `with.schema` a Zod-derived JSON schema for structured output (FR-5).
  - *Act*: emits a Proposal via `ProposalsClient` and gates any consequential action behind approval (FR-7).
- **Output-validation guard step**: an explicit workflow step between Reason and Act (hook 5, FR-6) — not an engine built-in, consistent with PD-1's README noting this is a boundary concern the engine does not provide for free.
- **Runner entry point**: extends PD-1's `run_spike_workflow.ts` / `executeWorkflow` wrapper to invoke the 5-phase workflow instead of the 3-step spike.
- **Integration test**: extends PD-1's `WorkflowRunFixture` pattern (from `workflow_engine_shape.test.ts`), asserting per-phase structured output and a fail-closed case.

## Data Model
**Evidence record** (`.daybreak-evidence` index):
| Field | Notes |
| --- | --- |
| `id` | Document id |
| `kind` | Evidence category |
| `sourceRef` | Pointer back to originating alert/data source |
| `summary` | Compact ground-truth text, kept separate from Reason-phase framing/rubric (NFR-4) |
| `provenance` | Where the evidence came from |
| `confidence` | Enrich-phase confidence signal |
| `stance` | Directional signal feeding Reason |
| `limitations` | Known gaps in the evidence |
| `sensitivityLabel` | Handling classification |
| `createdAt` | Timestamp |

**Proposal record**:
| Field | Notes |
| --- | --- |
| `evidenceRefs` | Non-empty required for `approved` status (readiness gate) |
| `recommendation` | Non-empty required for `approved` status (readiness gate) |
| `status` | e.g. `pending` / `approved`; approval-gate-bounded before any consequential action (FR-7) |
| `actor` / `timestamp` / `rationale` | Auditable shape (FR-7) |

**Workflow step contract** (per phase, YAML): each of Setup/Guard/Enrich/Reason/Act emits a structured output the integration test asserts on. The Reason step's `with.schema` is the Zod-derived JSON schema passed to `ai.agent`'s structured-output field (per the input schema described in research.md's Finding 1); the output-validation guard step consumes that structured output and either passes it through unchanged or halts the run.

## Failure Modes
- **Malformed or empty `ai.agent` structured output**: the explicit guard step between Reason and Act halts the workflow with a visible error; it never allows Act to emit a Proposal from unvalidated output (FR-6).
- **No connector configured for the `ai.agent` step in the target environment**: this is the proposal's second Open Question — design confirms the step must resolve a connector/inference-id from the dev stack's existing configuration, or create one, before the Reason phase can execute live; absent this, the workflow fails at the Reason step rather than silently degrading.
- **Evidence content attempting prompt injection into the Reason phase**: mitigated by the structural separation of the ground-truth evidence block from framing/rubric (NFR-4); if that separation is not enforced at the Enrich boundary's schema validation, injected content could reach the model prompt unfiltered — this is why input validation is placed at Enrich, before Reason, not after.
- **Readiness gate bypass**: a Proposal reaching `approved` status with an empty `evidenceRefs` or empty `recommendation` is rejected by `requireReadinessGate` — the gate fails closed on either field independently, not only on the combined case.
- **Stale `.d.ts` deletion sequencing**: deleting `target/types/server/client/{evidence,proposals}` before the real `.ts` source is committed would break the type check; DoD sequences deletion strictly after the real source lands and regenerates correct output.
- **Agent-scoping mistake**: because research.md's Finding 5 notes a dead, unimported sibling file (`.../skills/alert_analysis_skill.ts`, no subdirectory) exists alongside the real registered skill (`.../skills/alert_analysis/alert_analysis_skill.ts:23-148`), binding the new agent's `skill_ids` to the wrong file path/id would silently produce an agent with no working skill; this design binds by the registered skill `id: 'alert-analysis'` (confirmed live via `register_skills.ts:81`), not by file path.

## Alternatives Considered
- **Keep the `type: inference` connector step from PD-1's stub instead of switching to `ai.agent`**: rejected — research.md shows `inference.*`/connector-family AI steps are explicitly deprecated for workflow use in favor of `ai.*` (`deprecated_step_metadata.ts:53-57`), and the connector step cannot invoke an Agent Builder skill with a scoped tool allowlist the way `ai.agent` can.
- **Bind the Reason phase directly to the default `elastic-ai-agent`** (`skill_ids: []`, all skills) instead of creating a minimal scoped agent: rejected — it would expose every registered skill to the Reason phase, violating the hard constraint against widening the `alert-analysis` skill's tool allowlist (NFR-4) and blurring the audit boundary FR-7 requires.
- **Extend `target/types/*.d.ts` in place as a scaffold** for evidence/proposals: rejected per the proposal's explicit hard constraint, and confirmed unnecessary risk since research.md found no recoverable `.ts` source in git history or stash — re-authoring fresh is the only sound option.
- **Build a custom orchestration fallback for the workflow shape** (A-2's contingency): rejected — PD-1 already validated the Workflow Engine expresses the required step shape end-to-end, so no fallback is needed at this phase.
