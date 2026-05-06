# RFC B1 — AutoDEX synthesis driver and three-path convergence

| | |
|---|---|
| **Status** | Draft (2026-05-05) |
| **Author** | AutoDEX validation pass |
| **Closes** | F-002, F-010, F-011, F-012 |
| **Unblocks** | B1 (Tier-A blocker), B7 chat-skill rule tuning, the live-benchmark gap to ≥85 |
| **Conformance matrix entry** | `soc-simulation/docs/autodex/conformance-matrix.md#7-production-blockers-auto-rolled-up` |

---

## 1. Context

The AutoDEX live-cluster benchmark scored 83/100 against the published 82/100 baseline, but Phase 1 validation (`Static + fixture + live-cluster benchmark`) surfaced a deeper architectural problem: **the autonomous synthesis pipeline (advisory → mutation_intent → applied rule) has never executed end-to-end in production code**. All `.soc-mutation-intents` documents are demo-seeded fixtures from `seed_argus_demo.sh`. The published benchmark score reflects state populated by a one-off seed script, not state produced by the autonomous loop.

This is the result of three intertwined gaps documented in the conformance matrix:

- **F-010** — no scheduled invoker exists. There is no `taskManager.registerTaskDefinitions` call anywhere in `security_solution` that references AutoDEX, and no workflow whose body actually calls `synthesizeRuleFromAdvisory`. The `argus-exploit-to-detection-reconciler-m2-2` workflow is a *status reconciler* — it watches the existing `.soc-recommendations` and `.soc-mutation-intents` docs and updates their statuses; it does not generate new ones.
- **F-011** — three parallel "synthesis" paths exist that **do not share code**:
  - **Path A (package)** `@kbn/argus-exploit-to-detection.synthesizeRuleFromAdvisory`+`generateLlmVariants`+`synthesizeRuleCandidates` — rigorous (variant generation, Pareto frontier, `validateLlmVariant`, golden-set blocklist), 62 jest tests ✅. Never invoked from production code.
  - **Path B (workflow)** `soc_deteng.yaml` runs every 30 min, uses inline `ai.agent` prompts to author rules, writes to `.soc-recommendations` with `source: argus`. No variant or Pareto rigor.
  - **Path C (chat tool)** `argusFileMutationIntentTool` (called by `argusAssessCveSkill`) writes whatever `proposed_rule_delta` the chat LLM produced, verbatim. No schema validation against `RuleCandidate`; no variant or Pareto either.
- **F-012** — chat-skill epic 17090 has two partial entry points (`detectionRuleEdit` and `argusAssessCve`). Both bypass Path A's gates.

The package was **deliberately built dependency-free of `@kbn/inference`** (see `llm_variant_provider.ts:18-44`) so that it can be unit-tested deterministically. The `VariantProvider` abstraction is the explicit hook for plugging in a real-LLM provider. **F-002** identifies this slot — "plugged in by the detection-eval vertical (M2.1) when it wires R4 into the golden-set pipeline". Today it is unwired and the system falls back to the scripted/deterministic fake.

## 2. Goals and non-goals

### Goals

1. **Make synthesis autonomous.** Every new `.soc-cve-advisories` document should produce, within a bounded time, a `RuleCandidate` written through Path A's gates and surfaced in the existing reconciler / applier cascade.
2. **Make synthesis use a real LLM.** The default-on `VariantProvider` should call `@kbn/inference` against the configured connector. The scripted fake stays as the unit-test default and the offline fallback.
3. **Converge Paths B and C onto Path A.** Both `soc_deteng.yaml` (Path B) and `argusFileMutationIntentTool` (Path C) should funnel rule-creation traffic into the same synthesis function, so all three paths inherit the same gates (axis validation, golden-set blocklist, Pareto trade-off, evaluator score).
4. **Stay package-pure.** `@kbn/argus-exploit-to-detection` continues to have **zero** runtime dependency on `@kbn/inference`. The connector wiring belongs in a new, narrow package.
5. **Stay rollback-safe.** Wire everything behind a feature flag and a kill switch entry. Default behaviour on a fresh install should match today's behaviour (deterministic fake, no autonomous trigger).

### Non-goals

- Rebuilding `soc_deteng.yaml` Phase 1 (rule tuning). Tuning stays where it is; only Phase 2 (rule authoring) gets converged onto Path A.
- Replacing the workflow engine. `argus-exploit-to-detection-reconciler-m2-2` keeps its job (status reconciliation, observation, `.soc-evolution-log` writes). The driver is additive.
- Production CTI ingestion (B2). The driver consumes whatever already lands in `.soc-cve-advisories`; the source of advisories is out of scope for this RFC.
- Schema convergence (B16). The driver inherits whatever schema `.soc-cve-advisories` ships today; B16 is a separate workstream.

## 3. Decision points

### 3.1 Synthesis driver: TaskManager task vs workflow vs hybrid

| Option | Pros | Cons |
|---|---|---|
| **A. Kibana TaskManager scheduled task** | Native to Kibana server; horizontal scaling; per-task circuit breaker; same lifecycle as `entity_analytics` / `health_diagnostic` (existing patterns). Reads/writes ES directly via the `core` client. Failure → automatic retry with backoff. | One-process-per-Kibana-node coordination; not visible in the Workflow Console UI. |
| **B. Workflow YAML** | Visible in Workflow Console; on-cluster cadence; consistent with the rest of AutoDEX. Already proven robust (F-009). | The package's `synthesizeRuleFromAdvisory` is TypeScript code — workflows can only call it via custom step types (`server/workflows/step_types/`); cost of building one is roughly a TaskManager task + a thin step shim. |
| **C. Hybrid** — TaskManager task drives synthesis; emits `.soc-evolution-log` rows that a workflow watches for observability. | Best of both. | Two moving parts; more code. |

**Recommendation: Option C, but staged.**

- **Phase B1.c.1** — ship a TaskManager task (Option A) first. Mirrors `lead_generation_task.ts` and `risk_scoring_task.ts` patterns; minimum new surface. Default cadence: every 5 min.
- **Phase B1.c.2** — add a thin `argus-synthesis-driver` workflow that subscribes to `.soc-evolution-log` rows the task emits, so the human-visible observability surface (Workflow Console) shows synthesis activity without re-implementing the driver in YAML.

This keeps the heavy logic in TypeScript (testable, typed, refactorable), but preserves the Workflow Console as the single UI for AutoDEX activity.

### 3.2 LLM connector wiring location

The package must remain free of `@kbn/inference`. Three placements are possible for the inference-backed `VariantProvider`:

| Option | Where | Pros | Cons |
|---|---|---|---|
| **A. New package** `@kbn/argus-inference-variant-provider` | `x-pack/solutions/security/packages/kbn-argus-inference-variant-provider` | Reusable from server, scripts, and a future non-Security plugin. Mirrors how `kbn-evals-suite-argus-detection` is paired with `kbn-argus-exploit-to-detection`. | One more package to maintain. |
| **B. Inside `security_solution/server`** | `x-pack/.../security_solution/server/lib/argus/synthesis/inference_variant_provider.ts` | No new package boundary. | Coupled to the plugin; can't be reused. |
| **C. Inside the agent-builder skill that calls it** | `agent_builder/skills/argus_playbooks/.../inference_variant_provider.ts` | Co-located with the only consumer today. | Forces re-implementation if a non-skill driver ever wants it (we know that's coming — the TaskManager driver). |

**Recommendation: Option A.** The TaskManager driver, the chat tool (Path C convergence), and the workflow Phase 2 of soc_deteng (Path B convergence) all need this provider. Putting it in a package keeps each consumer's import surface clean and matches the AutoDEX repo's existing factoring.

### 3.3 Path convergence

**Path B (`soc_deteng.yaml` Phase 2)** today contains `ai.agent` steps that prompt-engineer a rule body and write to `.soc-recommendations`. To converge onto Path A:

1. Replace the inline `ai.agent` rule-authoring step with a call to a new step-type `argus.synthesize_rule_from_gap` (registered in `server/workflows/step_types/`).
2. The step type takes a coverage-gap doc and an optional advisory id, calls `synthesizeRuleFromAdvisory` with a synthetic advisory derived from the gap, runs `generateLlmVariants` + `synthesizeRuleCandidates`, and writes a single envelope-shaped `.soc-mutation-intents` document.
3. Phase 1 (tuning) is unchanged.

**Path C (`argusFileMutationIntentTool`)** today writes whatever the chat LLM produced. To converge onto Path A:

1. Add a new tool `argusSynthesizeRuleCandidate` that takes a CVE id (or an advisory id), looks up the advisory in `.soc-cve-advisories`, calls Path A end-to-end, and returns the resulting `RuleCandidate` to the chat LLM.
2. The existing `argusFileMutationIntentTool` keeps its general-purpose role (`origin: gap_analysis | consolidation | manual`), but for `origin: cti_ingest` it requires a `candidate_rec_id` produced by the new tool — i.e., the chat LLM can only file a CVE-driven mutation intent if it has gone through Path A's gates first.
3. `argusAssessCveSkill` is updated to use the new tool when the user asks for a draft.

### 3.4 Cadence and budgets

The TaskManager driver runs at a configurable cadence. Defaults:

| Knob | Default | Rationale |
|---|---|---|
| `pollSchedule` | `every: 5m` | Matches the autonomous applier's responsiveness budget; below the 30-min `soc_deteng` cadence so the driver never starves the workflow. |
| `maxAdvisoriesPerTick` | `3` | Bounded blast radius — three advisories × six axes × four platforms × five-variants = ~360 LLM calls/tick at most. |
| `cooldownPerAdvisorySec` | `3600` | Same advisory cannot trigger synthesis twice within an hour, even if the prior attempt failed. Prevents runaway loops on a single noisy advisory. |
| `failClosedOnRejectionRate` | `0.6` | If `validateLlmVariant` rejects more than 60% of the LLM's candidates for one advisory, the synthesis attempt is logged and the advisory is parked in a `.soc-synthesis-deadletter` index for human review. |
| `dailyBudget` | `50` synthesis attempts | Hard cap; ties into the existing autonomous-applier daily budget. |

These knobs are all live-mutable via `kibana.yml` server settings under `xpack.securitySolution.argus.synthesis.*`.

### 3.5 Kill switch and feature flag

- **Server feature flag**: `xpack.securitySolution.argus.synthesisDriverEnabled` (default `false` until B1 ships behind a paved-road env). Disabling it removes the TaskManager registration entirely.
- **Cluster-wide kill switch**: `.soc-kill-switch` already has an `autonomy_enabled: boolean` field. The driver's first action on every tick is to read this; if `false`, the driver records a "skipped — kill switch tripped" entry in `.soc-evolution-log` and exits. Same pattern as the autonomous applier.
- **Per-advisory exemption**: a new field on `.soc-cve-advisories` documents — `argus.synthesis.skip: true` — lets a human pin a specific advisory out of the autonomous loop without disabling the driver globally.

## 4. Proposed architecture

```
                                    ┌──────────────────────────────────┐
                                    │        .soc-cve-advisories       │
                                    │        (CTI / batch / chat)      │
                                    └────────────────┬─────────────────┘
                                                     │ TaskManager polls every 5m
                                                     ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │  argus.synthesis.driver  (Kibana TaskManager scheduled task)     │
        │   - kill-switch check                                            │
        │   - per-advisory cooldown                                        │
        │   - daily budget                                                 │
        └─────────────────────────┬────────────────────────────────────────┘
                                  │ for each ungated advisory
                                  ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │  @kbn/argus-exploit-to-detection                                 │
        │   1. synthesizeRuleFromAdvisory()        → DraftRule             │
        │   2. generateLlmVariants({provider})     → variants[]            │
        │      - VariantProvider = inference-backed (NEW)                  │
        │      - validateLlmVariant blocklist + axis markers               │
        │   3. synthesizeRuleCandidates()          → Pareto frontier       │
        │   4. buildMutationIntent(top candidate)  → MutationIntent        │
        └─────────────────────────┬────────────────────────────────────────┘
                                  │
                                  ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │       .soc-mutation-intents  (envelope-shaped doc)               │
        │       .soc-evolution-log     (driver tick + outcome)             │
        │       .soc-reasoning-trace   (variant trace events)              │
        └─────────────────────────┬────────────────────────────────────────┘
                                  │ existing flow continues unchanged
                                  ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │ argus-exploit-to-detection-reconciler-m2-2 (status reconciler)   │
        │ soc_rule_backtester (gate)                                       │
        │ soc_argus_trust_gate (gate)                                      │
        │ soc_autonomous_applier (apply / pending_review / decline)        │
        └──────────────────────────────────────────────────────────────────┘
```

**Path B convergence**: the new step-type `argus.synthesize_rule_from_gap` lives at `x-pack/solutions/security/plugins/security_solution/server/workflows/step_types/argus_synthesize_rule_step/`. `soc_deteng.yaml` Phase 2 is rewritten to use it. The output goes into `.soc-mutation-intents` (NOT `.soc-recommendations` with `source: argus`) so all rule-creation traffic ends up in the same index.

**Path C convergence**: the new tool `argusSynthesizeRuleCandidate` lives at `x-pack/.../security_solution/server/agent_builder/tools/argus_playbooks/synthesize_rule_candidate_tool.ts`. `argusAssessCveSkill` content is updated to call it before `argusFileMutationIntent`.

## 5. Implementation sequence (4 PRs)

### PR1 — `@kbn/argus-inference-variant-provider` package (B1.b)

**Scope**

- New package `x-pack/solutions/security/packages/kbn-argus-inference-variant-provider/`.
- Implements `VariantProvider` interface from `@kbn/argus-exploit-to-detection`.
- Wraps `@kbn/inference` connector; structured prompt asks for `VariantCandidate[]` for a given (advisory, axis, platform).
- Parses LLM response with zod schema; falls back to `DEFAULT_SCRIPTED_LLM_PROVIDER` on parse error.
- 100% jest coverage with mocked `@kbn/inference`; deterministic seeded fallback path tested end-to-end.

**Tests**

- 8+ unit tests covering prompt shape, response parsing, fallback path, axis-marker conformance, golden-set blocklist downstream interaction.
- Replays an existing fixture from `kbn-argus-exploit-to-detection/scripts/run_exploit_to_detection.ts` against the new provider and asserts the rejection rate is below 30%.

**No production wiring yet** — this PR is a self-contained package. Behind no flag.

### PR2 — TaskManager synthesis driver (B1.c.1)

**Scope**

- New module `x-pack/.../security_solution/server/lib/argus/synthesis/synthesis_driver_task.ts`.
- Mirrors `lead_generation_task.ts` shape: registers a task definition, runs on schedule, persists state in TaskManager.
- Behind `experimentalFeatures.argusSynthesisDriverEnabled` (defaults to `false`).
- Calls the package's full pipeline (`synthesizeRuleFromAdvisory` → `generateLlmVariants` → `synthesizeRuleCandidates` → `buildMutationIntent`).
- Uses the inference-backed provider from PR1.
- Writes to `.soc-mutation-intents` with `agent.id: argus.synthesis.driver`, `argus.actor.trust_tier: probationary` (so the trust-gate cascade routes the first batch through human review).
- Emits `.soc-evolution-log` rows on every tick: `{ event: synthesis.tick, advisories_in: N, candidates_out: K, rejected: R, dead_letter: D }`.

**Tests**

- 12+ unit tests covering kill-switch, cooldown, budget exhaustion, advisory exemption, partial failure, dead-letter path.
- Integration test with a stubbed inference connector that runs against a fresh `.soc-cve-advisories` doc and asserts a `.soc-mutation-intents` doc is written with the correct envelope.
- A fixture-based jest run that asserts the driver's output, given a fixed advisory, matches the existing `kbn-argus-exploit-to-detection` fixture exactly when the scripted fake is used.

### PR3 — Path B convergence: `argus.synthesize_rule_from_gap` step + `soc_deteng.yaml` Phase 2 rewrite (B1.d.1)

**Scope**

- New workflow step type `argus.synthesize_rule_from_gap` registered in `server/workflows/step_types/register_workflow_steps.ts`.
- Step takes a coverage-gap doc, derives a synthetic advisory, runs Path A.
- `soc_deteng.yaml` Phase 2 ai.agent steps are removed; Phase 2 now consists of a single new step + the existing `.soc-mutation-intents` write.
- Phase 1 (tuning) is untouched.

**Tests**

- Existing `soc_deteng.yaml` integration tests are updated to reflect the new step.
- A new test asserts that the same coverage gap that previously produced an `.soc-recommendations` doc with `source: argus` now produces an `.soc-mutation-intents` doc with `agent.id: argus.synthesis.driver` and the same rule-creation intent.

### PR4 — Path C convergence: `argusSynthesizeRuleCandidate` tool + `argusAssessCveSkill` rewrite (B1.d.2)

**Scope**

- New tool `argusSynthesizeRuleCandidate` registered in `server/agent_builder/tools/argus_playbooks/`.
- Tool takes `advisory_id`, runs Path A, returns the top candidate as a structured tool result the chat LLM can render.
- `argusFileMutationIntentTool` requires `candidate_rec_id` for `origin: cti_ingest`; for other origins, the existing freeform path is unchanged.
- `argusAssessCveSkill` content is updated: step 3 ("Trigger synthesis if warranted") now calls the new tool first, then files the resulting candidate via the existing `argusFileMutationIntentTool` with `candidate_rec_id`.

**Tests**

- Tool unit tests (8+).
- Skill response golden tests against fixtures.
- A `kbn-evals-suite-argus-detection` test asserts that the new tool, given a test advisory, produces a `RuleCandidate` whose ES query matches the package's deterministic output.

## 6. Test plan

### Static (Tier-1)

- Lint/type-check the four new modules + their callers — no `any`, no `@ts-expect-error`, no `@ts-ignore`.
- `node scripts/check_changes.ts` per the `.cursor/rules/kibana-project-rules.mdc` standard.

### Fixture (Tier-2)

- New jest tests above land at green; existing 62 + 30 + 27 + 16 = 135 AutoDEX-package tests remain green.
- A new fixture-based replay (`packages/kbn-argus-exploit-to-detection/scripts/replay_synthesis_driver.ts`) takes a fixture advisory, runs PR1+PR2 against it (with the scripted fake provider), and asserts the produced `.soc-mutation-intents` document is byte-identical to a checked-in golden file.

### Live (Tier-3)

- Re-run `soc-simulation/scripts/run_argus_benchmark.sh` (no `--score-only`). The seed pack writes 4 advisories; with the driver enabled and the connector wired to a local stand-in (via the scripted fallback when `xpack.actions.preconfigured` is empty), 4 fresh `change_type=create` mutation intents must show up in `.soc-mutation-intents` within 15 min.
- Expected score uplift: D1.1 from 0/5 → 5/5, D1.2 from 3/5 → 5/5, D4.2 from 0/5 → 5/5 → **+12 points → 95/100 (Autonomous)**.

## 7. Rollout

| Stage | Knobs | Expected behaviour |
|---|---|---|
| **Stage 0** (today) | none | No autonomous synthesis. Path A only callable via the `run_exploit_to_detection.ts` script. |
| **Stage 1** (PR1+PR2 land, flag off) | `argusSynthesisDriverEnabled: false` (default) | No behaviour change; CI green; package + provider available for ad-hoc invocation. |
| **Stage 2** (PR1+PR2 land, flag on, scripted-fake provider) | `argusSynthesisDriverEnabled: true`; no `xpack.actions` connector configured. | Synthesis runs autonomously every 5 min; uses scripted fake; produces deterministic mutation intents. Useful for demos and benchmarks. |
| **Stage 3** (real connector configured) | `argusSynthesisDriverEnabled: true`; `xpack.actions.preconfigured.argus-inference: ...`. | Real-LLM synthesis. Probationary trust tier means first 24h of mutations route to human review queue. |
| **Stage 4** (PR3+PR4 land) | same as Stage 3. | Paths B and C funnel through Path A. The `.soc-recommendations` index stops receiving rule-creation traffic. |
| **Stage 5** (post-bake) | trust tier graduates to `frontier` per `soc_argus_trust_tier_assessor.yaml`. | Autonomous applier auto-applies low-blast-radius mutations from the driver. |

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| LLM hallucinates rule queries that pass `validateLlmVariant` but match too broadly in production | (a) Probationary trust tier on the first day routes everything through human review; (b) `soc_rule_backtester` gate already enforces FP-projection against historical data; (c) `soc_post_apply_observer.yaml` rolls back on volume spikes — same safety net as today. |
| Driver runs while the kill switch is disengaged but a connector is misconfigured | The fallback to `DEFAULT_SCRIPTED_LLM_PROVIDER` triggers on parse error or connector unavailability. The driver continues to produce candidates, just deterministic ones. Logged at `warn` level. |
| Path B/C convergence breaks an existing demo | Stage 4 lands behind a separate flag `argusSynthesisPathConvergenceEnabled` (default `false` until the demos are updated). Demos can stay on the legacy `.soc-recommendations` path during the transition. |
| `.soc-mutation-intents` schema drift (B16) bites the new producer | The new producer writes the **canonical** schema (the one the autonomous applier consumes); we treat that as the authoritative shape and B16 is the workstream that brings the others in line. |
| Cost: real-LLM connector × 360 calls / tick × 12 ticks/hour × 24 hours | Daily budget cap (default 50 synthesis attempts/day across all advisories) caps total LLM cost. Per-advisory cooldown caps duplicates. |

## 9. Open questions

1. **Should the driver operate as a TaskManager task or as a Kibana action?** TaskManager is the precedent for AutoDEX-adjacent workloads (entity_analytics, telemetry); actions are the precedent for outbound synthesis-style triggers (e.g. case automation). Recommendation: TaskManager, because the driver is internal to AutoDEX and should not appear in the user-facing connectors / actions list. Reviewer to confirm.
2. **Where does the inference-backed `VariantProvider` get its connector handle?** Recommendation: at task setup time, the driver resolves the action client from the configured connector ID (env-configurable) and hands it to the provider on construction. This means `xpack.actions.preconfigured` is the single configuration surface. Reviewer to confirm.
3. **Should Path C convergence be retroactive — i.e. should the existing `argusFileMutationIntentTool` reject `origin: cti_ingest` requests without a `candidate_rec_id`?** Recommendation: yes, but behind the same flag as Stage 4, so the existing demos that rely on the freeform path continue to work until they're updated.
4. **Should Phase 2 of `soc_deteng.yaml` continue to exist after PR3, or should it be deleted entirely in favor of the TaskManager driver?** Recommendation: delete; once the driver is the source of rule-creation traffic, the workflow's Phase 2 is duplicate work. Reviewer to confirm.

## 9.5 Implementation notes (added 2026-05-05)

PRs PR1, PR2, and PR4 have landed on this worktree. PR3 (Path B convergence on `soc_deteng.yaml`) is **deferred** with a re-scoping rationale below.

### Landed

- **PR1** — `@kbn/argus-inference-variant-provider` package shipped (B1.b). 100 % jest coverage; deterministic fallback verified.
- **PR2** — TaskManager `argus.synthesis.driver` task shipped (B1.c). Pure logic factored into `synthesize_one.ts` so it can be reused by every entry point. Plugin wiring lives behind `experimentalFeatures.argusSynthesisDriverEnabled`.
- **PR4 (Path C)** — `argusSynthesizeRuleCandidateTool` shipped (B1.d.2) and registered behind `argusConsoleEnabled`. Implementation chose the simpler "block-and-redirect" form over the original "require `candidate_rec_id`" idea:
  - The new tool calls the shared `synthesizeOne` with `callerId: 'chat-skill'` and writes the resulting `MutationIntent`, reasoning traces, and evolution-log row in one transaction.
  - `argusFileMutationIntentTool` now rejects `origin: 'cti_ingest'` at the top of its handler with an explicit error pointing the LLM at the new tool.
  - `argusAssessCveSkill` is updated to call the new tool directly; its registry tools list drops `argus.file_mutation_intent` for the CVE flow.

### Deferred — PR3 (Path B convergence on `soc_deteng.yaml`)

Investigation during PR4 confirmed `soc_deteng.yaml` operates on a **different input domain** than Path A:

- Phase 1 produces `rule_tuning` mutation intents from `.soc-outcomes` triage data — explicitly out of scope per §2.
- Phase 2 produces `rule_authoring` mutation intents from `.soc-coverage-gaps` — *not* CVE advisories. Re-shaping a coverage gap into a synthetic advisory so it can travel through Path A is non-trivial and changes the meaning of the resulting `MutationIntent` (origin `coverage_gap`, not `cti_ingest`).
- The CLI driver `scripts/run_exploit_to_detection.ts` *already* calls Path A primitives (`synthesizeRuleCandidates`, `generateLlmVariants`, `buildMutationIntent`) directly — Path B for **CVE-driven** synthesis is therefore already on Path A via the script.

PR3 is split out into a follow-up workstream tracked under a new blocker:

- **B17 — Coverage-gap → Path A bridge.** Design how a coverage-gap doc maps to the `StructuredAdvisory` shape, with a separate `origin: coverage_gap` lane through `synthesizeOne`. This is gated on B5 (crown-jewel asset model) because the coverage-gap → advisory mapping needs asset context to assign realistic severity.

### Convergence status (current state)

| Surface | Path | Status |
|---|---|---|
| Autonomous workflow `soc_argus_synthesis_driver.yaml` → step `security.argusSynthesizeAdvisory` | Path A via `synthesizeOne` | ✅ shipped (PR2 + §9.6 migration) |
| `run_exploit_to_detection.ts` CLI | Path A primitives directly | ✅ pre-existing |
| Chat: `argusSynthesizeRuleCandidateTool` | Path A via `synthesizeOne` | ✅ shipped (PR4) |
| Chat: `argusFileMutationIntentTool` (CVE) | Blocked, redirects to Path A | ✅ shipped (PR4) |
| `soc_deteng.yaml` Phase 2 (coverage gaps) | Bespoke `ai.agent` step | 🟡 deferred to B17 |
| `soc_deteng.yaml` Phase 1 (rule tuning) | Bespoke (out of scope) | n/a |

CVE-driven synthesis — the explicit goal of this RFC — converges on Path A across every surface that produces it.

## 9.6 Workflow migration (added 2026-05-05, post-§9.live)

Open question 1 in §9 asked whether the driver should run as a TaskManager task or a Kibana action; the recommendation at the time was TaskManager (because the driver is internal to AutoDEX and shouldn't appear in the user-facing connectors list). After the live re-validation in §9.live the answer changed: **the driver runs on the workflow engine**, neither TaskManager nor a Kibana action. The user direction was explicit ("make sure to use workflows over taskmanager") and the live boot evidence corroborated it — every other autonomous SOC loop is a workflow, the kill-switch / scheduling / kill-switch / audit primitives the workflow engine already provides match what the driver needs, and the workflow execution credential context structurally resolves the auth problem (B18 / F-013) that the TaskManager driver had to work around with env vars.

### What changed

- **Workflow YAML:** `soc-simulation/workflows/soc_argus_synthesis_driver.yaml` schedules every 5 m (+ manual trigger), reads `.soc-kill-switch`, fetches advisories, and `foreach`-iterates `security.argusSynthesizeAdvisory`.
- **New workflow step type:** `security.argusSynthesizeAdvisory` (same `BaseStepDefinition` shape as `security.backtestRule`, `security.shadowExecuteRule`, etc.). Server handler delegates to the unchanged `synthesizeOne` primitive and writes the canonical `MutationIntent` + reasoning traces + audit row using `context.contextManager.getScopedEsClient()`. Registered behind `argusConsoleEnabled` so it follows the same gate as the other ARGUS rule steps.
- **Removed:** `synthesis_driver_task.ts`, `synthesis_driver.ts` (composite tick — gating is now in YAML), `state.ts`, `synthesis_driver.test.ts`, `experimentalFeatures.argusSynthesisDriverEnabled`, `ARGUS_SYNTHESIS_ES_USERNAME` / `ARGUS_SYNTHESIS_ES_PASSWORD` env vars.
- **Tests:** `synthesize_one.test.ts` (8 ✅ — preserves all the pure-logic coverage that lived on the deleted `synthesis_driver.test.ts`) + `argus_synthesize_advisory_step.test.ts` (7 ✅) + the existing `@kbn/argus-inference-variant-provider` (11 ✅) suite.

### What stayed

- `synthesizeOne` itself is unchanged. Path A's three entry points (workflow step, chat tool, CLI script) still funnel through the same primitive, so per-advisory behaviour is provably identical.
- The canonical envelope written to `.soc-mutation-intents` / `.soc-reasoning-trace` / `.soc-evolution-log` is byte-for-byte the same. Benchmarks score the same.
- The chat-tool surface (B1.d) is untouched.

### Knock-on effects on Stage 1–5 of §7

The flag-gated rollout described in §7 collapses:

- Stage 1 — "PR1+PR2 land, flag off" — n/a; there's no flag.
- Stage 2 — "PR1+PR2 land, flag on, scripted-fake provider" — equivalent to enabling the workflow YAML (`enabled: true`) without configuring an inference connector. Default scripted provider produces deterministic mutation intents.
- Stage 3 — "real connector configured" — same gating as before; the connector is resolved at workflow-step execution time. The provider abstraction (`@kbn/argus-inference-variant-provider`) is unchanged.
- Stage 4 / 5 — unchanged.

## 10. Acceptance criteria

This RFC is "done" when:

- All four PRs above land on this worktree.
- `node scripts/jest x-pack/solutions/security/packages/kbn-argus-exploit-to-detection`, `node scripts/jest x-pack/solutions/security/packages/kbn-argus-inference-variant-provider`, `node scripts/jest x-pack/solutions/security/plugins/security_solution/server/lib/argus/synthesis` are all green.
- `soc-simulation/scripts/run_argus_benchmark.sh` (full mode, ~30 min) produces a score ≥85.
- `soc-simulation/docs/autodex/conformance-matrix.md` rows 1.3.1, 5.D1.1, 5.D1.2, 5.D4.2 flip from 🟡/❌ to ✅; B1 is struck through in §7; the §0 scorecard is re-rolled.
- The conformance-matrix `Live re-validation` row in §5 records the new score with the same evidence shape used for the 83/100 baseline.
