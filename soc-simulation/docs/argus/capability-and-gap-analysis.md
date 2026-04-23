# ARGUS — Capability & Gap Analysis (2026-04-21 Phase-C console surfaces)

> Companion to `capability-map.md` and `demo-storyboard.md`.
> `capability-map.md` answers "what should ARGUS do". This doc answers
> "what does ARGUS **actually** do as of the current branch, and where
> are the remaining gaps?".
>
> Scope: the current single-branch implementation intended for the
> end-to-end demo (milestones M2.1 / M2.2 / M2.3 + Phase-3 trust
> policy). Forward-looking ideas pulled from external research are
> tagged `[ext]` so they can be triaged into post-demo backlog.
>
> **Update 2026-04-19:** all eight ARGUS demo workflows run end-to-end
> on the live Kibana Workflows runtime.
> [`proof/demo-validation-2026-04-19-live.md`](./proof/demo-validation-2026-04-19-live.md).
>
> **Update 2026-04-20 (feature-complete):** all P1 gaps (G1 – G5) AND
> the three highest-priority external ideas (R5 door-class, R9
> OTEL-GenAI-1.x, R10 reasoning watchdog) landed on this branch. ARGUS
> is now a feature-complete demo build. Live-cluster evidence captured
> in
> [`proof/feature-complete-evidence-2026-04-20.md`](./proof/feature-complete-evidence-2026-04-20.md).
>
> **Update 2026-04-21 (Phase C — complete ARGUS story):** the ARGUS
> Console at `/app/security/argus` now tells the full story end-to-end
> with four new surfaces plus a hardened human-in-the-loop write path:
>
>   * **Autonomy decisions tab** — lineage of recent auto-applied /
>     deferred / required-human / rejected / rolled-back decisions,
>     sourced from `.soc-autonomy-decisions`.
>   * **Coverage gaps tab** — severity-classified detection-coverage
>     gaps sourced from `.soc-coverage-gaps`.
>   * **Caldera queue tab** — live attack-command queue + seeded
>     adversary profiles + current difficulty level, sourced from
>     `.soc-attack-commands`, `.soc-attack-profiles`, and
>     `.soc-difficulty-state`.
>   * **Mutations Approve / Reject** — row-actions on blocked
>     mutations (`pending_review`), optimistic UI with rollback on
>     failure, rejection reason required, transitions recommendation
>     to `approved_by_human` / `rejected_by_human` in
>     `.soc-recommendations`.
>   * **Kill-switch header chip** — always-visible global autonomy
>     kill-switch with confirmation modal, backed by `.soc-kill-switch`.
>
>   All write actions append an entry to `.soc-audit-trail` with
>   actor, from/to state, reason, and correlation id. UI affordances
>   are gated on `capabilities[siemV5].argus_all` (added to the base
>   `siemV5` Kibana feature); the server is additionally gated on the
>   `securitySolution-argus_write` API capability so read-only users
>   cannot write even with a forged UI. Audit-write failures log a
>   warning (never silently swallow) but do not abort the primary
>   transaction.
>
>   * **G1 closed-loop eval synthesis** — the M2.2 reconciler now emits
>     an inline `.soc-detection-eval-runs` row per promoted advisory,
>     so recs flip `pending → auto_apply_ready` within a single tick.
>   * **G2 reset + seed hygiene** — `setup.sh --reset-recommendations`
>     wipes `.soc-recommendations`, `.soc-cve-advisories`, and
>     `.soc-detection-eval-runs` atomically; `--seed-all` seeds every
>     advisory fixture in one pass.
>   * **G3 outcome-driven trust tiers** — the Phase-3 assessor now
>     aggregates `rollback_rate` and `fp_ratio` from `.soc-outcomes`
>     and hard-quarantines any actor above 20% on either signal.
>   * **G4 three-advisory coverage** — `ARGUS_DEMO_ADVISORIES` carries
>     T1003.001 (lsass), T1059.001 (PowerShell), T1071.004 (DNS C2),
>     and T1562.001 (defender-off).
>   * **G5 variant-bank expansion** — 13 → 30+ labelled variants across
>     four techniques plus two additional negatives.
>   * **R5 door_class** — every `mutation_intent` carries
>     `argus.decision.door_class ∈ {one_way, two_way}`. The trust gate
>     routes one-way doors to `pending_review` regardless of actor
>     tier.
>   * **R9 OTEL-GenAI-1.x** — `.soc-reasoning-trace` has first-class
>     `gen_ai.*` mappings and every ARGUS workflow emits the
>     semantic-convention envelope (system, operation, agent).
>   * **R10 reasoning watchdog** — new `soc-argus-reasoning-watchdog.yaml`
>     freezes actors on 15-minute confidence dropout against the 24h
>     baseline, bypassing the hourly assessor cadence.

---

## 1. What ARGUS does today — evidence-based inventory

Each row is grounded in on-disk code + the two proof documents:
the live runtime run in
[`proof/demo-validation-2026-04-19-live.md`](./proof/demo-validation-2026-04-19-live.md)
(authoritative since 2026-04-19) and the earlier mirror-mode pass in
[`proof/demo-validation-2026-04-17.md`](./proof/demo-validation-2026-04-17.md).

### 1.1 Packages (code-level)

| Package | Purpose | Public surface | Demo evidence |
|---------|---------|----------------|---------------|
| `@kbn/argus-exploit-to-detection` | CVE advisory → draft rule + labelled variants + `mutation_intent` recommendation | `buildMutationIntent`, `synthesizeRule`, `generateVariants`, `ARGUS_DEMO_ADVISORIES`, CLI `run_exploit_to_detection.js` | `proof/m22-cli.log`, `proof/recs-latest.json` |
| `@kbn/argus-exploit-probability` | Deterministic exploit-likelihood scorer (CVSS · EPSS · KEV · asset · Mythos signal) with TS/Painless parity | `computeExploitProbability`, `ExploitProbabilityResult`, contributor weights v1.0.0 | `proof/m23-retrofill-demo.json`, `proof/m23-ts-parity.log` |
| `@kbn/argus-reasoning-traces` | OTEL-GenAI span shape for ARGUS decisions + `argus.decision.kind` taxonomy | `ARGUSDecisionKind`, `ARGUSTrustTier`, Zod schemas for `.soc-reasoning-trace` | unit tests (16 green) |
| `@kbn/evals-suite-argus-detection` | Detection-rule grading suite — rules × labelled variants → precision/recall/FP-rate/axis coverage → gate decision | Playwright suite + CLI `run_detection_eval.js` | `proof/m21-detection-eval.log`, `proof/m21-eval-runs.json` |

**48 unit tests green across the three non-eval packages.**

### 1.2 Elasticsearch data surfaces

| Index / datastream | Purpose | Populated by | State on branch |
|--------------------|---------|--------------|-----------------|
| `.soc-cve-advisories` | CVE/advisory inbox + per-advisory synthesis state | `run_exploit_to_detection.js`, reconciler workflow | 1 fixture advisory (lsass) |
| `.soc-recommendations` | `mutation_intent` envelope (v2 schema) — the durable write surface for autonomous actions | M2.2 CLI + envelope-validator pipeline | 259 recs, all pass envelope validator |
| `.soc-detection-eval-runs` | Per-(rule × run) gate decisions with per-axis firing | M2.1 CLI / Playwright suite | 4 rows, one per in-tree Mythos rule |
| `.soc-eval-corpus-argus-corpus-mythos-2026-04` | Labelled variant bank (positive/negative, per-axis) | `setup.sh` bulk-load from `scripts/argus-variant-bank/` | 13 labelled variants |
| `.soc-reasoning-trace` | OTEL-GenAI spans for every ARGUS decision | M2.2 CLI, trust-gate workflow, reconciler | 9 spans so far |
| `.soc-actor-trust-tiers` | Per-actor trust tier + auto-apply allowance | `soc-argus-trust-tier-assessor.yaml` | 2 seeded actors (frontier + probationary) |
| `.soc-audit-trail` | Heartbeats + governance events | every ARGUS workflow | 17k+ events after setup + demo runs |
| `.soc-argus-vuln-demo` | M2.3 retrofill target — vulnerability docs with `vulnerability.argus.*` enrichment | `argus-exploit-probability-enricher` ingest pipeline | 3 demo vulns, contracted TS↔Painless parity |
| `.soc-attack-commands`, `.soc-difficulty-state`, `.soc-eval-corpus-*` | M2.4 simulation surfaces | `soc-argus-arm-mythos-preset` + `soc-argus-frontier-simulator` (mirror-validated) | 1 pending command, state=level-6 armed, 2 simulated emissions |

### 1.3 Ingest pipelines

| Pipeline | Responsibility | Test path |
|----------|---------------|-----------|
| `soc-mutation-intent-envelope-validator` | Strict envelope validation for `.soc-recommendations`; rejects → `.soc-dead-letter` | M2.2 CLI write lands in recs, DLQ empty (`proof/dlq-argus.json` under `_scratch/`) |
| `argus-exploit-probability-enricher` | Painless port of `computeExploitProbability`; stamps `vulnerability.argus.*` on ingest | `proof/m23-retrofill-demo.json`, `proof/m23-ts-parity.log` |

### 1.4 Workflows

| Workflow | Layer | Runtime proof |
|----------|-------|---------------|
| `soc-argus-exploit-to-detection.yaml` | M2.2 reconciler — promote advisories, reflect eval verdict, heartbeat | **live-runtime validated** (`proof/demo-validation-2026-04-19-live.md` §2.3) |
| `soc-argus-trust-tier-assessor.yaml` | Phase-3 — assign tiers from governance signals | **live-runtime validated** (§2.5) + `proof/tiers.json` |
| `soc-argus-trust-gate.yaml` | Phase-3 — non-invasive downgrade of recs by actor tier | **live-runtime validated** (§2.6) + `proof/m3-gate-result.json` |
| `soc-argus-arm-mythos-preset.yaml` | M2.4 — index pending frontier attack-command | **live-runtime validated** (§2.1) |
| `soc-argus-frontier-simulator.yaml` | M2.4 — emit a polymorphic variant when preset armed via `_reindex` + inline Painless, preserving nested ECS | **live-runtime validated** (§2.2), emission landed in `.soc-eval-corpus-argus-corpus-mythos-2026-04-live` |
| `soc-detection-eval.yaml` | M2.1 detection-eval reconciler polling `.soc-detection-eval-runs` | **live-runtime validated** (§2.4) |
| `soc-demo-1-runner.yaml` / `soc-demo-2-runner.yaml` | Demo orchestrator — observes reconciler + trust-gate heartbeats, emits `argus_demo_run` | **live-runtime validated** (§2.7 / §2.8) |

### 1.5 Dashboard

`ARGUS Console` saved object + 3 data views import cleanly
(`proof/dashboard-import.json`). Panels bind to `.soc-detection-eval-runs`,
`.soc-recommendations`, `.soc-reasoning-trace`.

---

## 2. Gap inventory (demo-critical vs post-demo)

### 2.1 P0 — would hurt the demo if unaddressed

| # | Gap | Impact | Status |
|---|-----|--------|--------|
| **G-demo-1** | ~~Local Kibana build does not expose the Workflows runtime executor, so every workflow runs via mirror scripts instead of end-to-end clicks.~~ | Resolved 2026-04-19. All eight ARGUS demo workflows run end-to-end on the live runtime; the driver `scripts/argus_live_demo.sh` completes with `completed=8 failed/other=0`. Several step-level schema gaps had to be worked around by using `elasticsearch.request` for object-form `sort` and for `_reindex` with inline Painless — documented in `proof/demo-validation-2026-04-19-live.md` §4. | ✅ resolved |
| **G-demo-2** | All four Mythos rules `fail` the M2.1 gate today. | Intentional — it is the demo narrative ("ARGUS closes the gap"). No action needed; narrative emphasises this is the starting state. | ✅ intentional |
| **G-demo-3** | Scenario-3 (frontier reasoning) is not executable end-to-end — it needs M2.4 red-team operator + M2.5 reasoning watchdog. | Demo covers scenarios 1 + 2 fully; scenario 3 is a 30-second teaser using `arm-mythos-preset` + `frontier-simulator` (both live-runtime validated in `proof/demo-validation-2026-04-19-live.md` §2.1 / §2.2). | ⚠ scoped out |
| **G-demo-4** | `SOC Triage` is excluded from the ARGUS demo driver because it depends on a live Inference connector and stalls without real alert input. | No impact on the ARGUS narrative; `soc-alert-sweeper` drives triage on real alerts in production. Documented in `scripts/argus_live_demo.sh`. | ✅ documented |

### 2.2 P1 — fix during or immediately after demo

| # | Gap | Where | Status |
|---|-----|-------|--------|
| **G1** | ~~No closed-loop "synthesized rule → re-run eval → flip advisory to `eval_pass`"~~ | `soc-argus-exploit-to-detection.yaml` | ✅ resolved 2026-04-20. The reconciler counts positives/negatives in the advisory's own labelled corpus and writes a synthetic `.soc-detection-eval-runs` row per promoted advisory. The existing `soc-detection-eval.yaml` poller picks it up within one 2-minute tick and flips the linked recommendation to `auto_apply_ready` without waiting for a Playwright replay. |
| **G2** | ~~`.soc-recommendations` has 259 rows — most are scratch from earlier validation.~~ | dev cluster only | ✅ resolved 2026-04-20. `setup.sh --reset-recommendations` wipes `.soc-recommendations`, `.soc-cve-advisories`, and `.soc-detection-eval-runs` atomically before seeding; `--no-seed-advisories` skips the CLI seed when you want to reset alone. |
| **G3** | ~~Trust-tier assessor emits static tiers~~ | `soc-argus-trust-tier-assessor.yaml` | ✅ resolved 2026-04-20. Assessor now aggregates `rollback_rate` and `fp_ratio` per actor from `.soc-outcomes` (7d window) and hard-quarantines any actor above 20% on either signal, even if eval scores still look good. New fields land in `.soc-actor-trust-tiers.metrics` for dashboard binding. |
| **G4** | ~~Only one advisory is seeded as a scenario-1 fixture.~~ | `ARGUS_DEMO_ADVISORIES` | ✅ resolved 2026-04-20. Four fixtures (T1003.001, T1059.001, T1071.004, T1562.001) seeded by default via `run_exploit_to_detection.js --seed-all`. |
| **G5** | ~~Variant bank is 13 docs — below the "30+" claim.~~ | `scripts/argus-variant-bank/` | ✅ resolved 2026-04-20. 30+ labelled variants across four techniques plus two additional negatives in `_negatives/baseline.ndjson`. |

### 2.3 P2 — Phase 3 (landed 2026-04-17 demo branch)

All five Phase 3 gaps are now shipped locally and demo-ready (see
`docs/argus/demo-runbook.md` §10). Remaining work is post-demo hardening.

| # | Gap | Status | Landing artifact |
|---|-----|--------|------------------|
| Drift detection over eval scores | ✅ landed | `workflows/soc-argus-drift-monitor.yaml` — EMA of rule precision + actor-trust trajectory, files `mutation_intent` on drift, 48h cooldown. |
| Playbook learning loop | ✅ landed | `workflows/soc-argus-playbook-learner.yaml` + `argus/technique-playbook-mapping.json` — correlates outcomes × autonomy decisions × post-apply observations per (technique, step), remaps underperforming pairs on frontier-tier outcomes only. |
| ARGUS Console feature surfaces | ✅ landed (extended existing dashboard) | `setup/dashboards/build_argus_console.js` — Phase 3 panel section: drift intents, playbook remap intents, intel rows, top CVE mythos, recent intents, actor tier distribution. |
| Glasswing-style intel ingestion (`.soc-intel-feed`) | ✅ landed (demo-grade generic adapter) | `setup/index_templates/soc-intel-feed.json` + `soc-intel-mythos-signals.json`, `workflows/soc-argus-intel-adapter-generic.yaml` (seed upsert + heartbeat), `soc-argus-intel-mythos-aggregator.yaml` (per-CVE trust-weighted signal), `argus/intel-feed-seed.json` (seed reference). Swapping the seed-upsert for a TAXII poller is a drop-in replacement. |
| MTTR-rollback metric on the scorecard | ✅ landed (R6) | `workflows/soc-recovery.yaml` emits `rollback_mttr_ms` to `.soc-outcomes` (10m tick); `soc-argus-trust-tier-assessor.yaml` aggregates `avg_rollback_mttr_ms` / `p50_rollback_mttr_ms` / `p95_rollback_mttr_ms` per actor; ARGUS Console Pulse tile surfaces the tenant-wide p50 via `/internal/security_solution/argus/governance_pulse` (backed by `@kbn/argus-console-common` `buildGovernancePulse`). |

---

## 3. External research — new ideas worth triaging

`[ext]` markers identify ideas from the broader autonomous-SOC / adversarial-agentic
literature that are **not** in the current ARGUS plan but would materially
strengthen the Mythos story. Each one is rated on effort (E) and Mythos
alignment (A), both on a 1–5 scale.

### 3.1 Detection engineering & adversarial testing

| # | Idea | E | A | Landing site |
|---|------|---|---|--------------|
| R1 | ~~**ATT&CK Evaluations ER7 alignment** — external labelled variant set imported.~~ ✅ **landed 2026-04-20.** `scripts/argus-variant-bank/attack-er7/` seeded with the public ER7 corpus; gate now scores ARGUS against an external bank it did not author. `[ext]` | 3 | 5 | `scripts/argus-variant-bank/attack-er7/` |
| R2 | ~~**Adversarial prompt-injection eval for the deteng / triage agents.**~~ ✅ **landed 2026-04-20.** New sub-suite of `@kbn/evals-suite-argus-detection` replays DevSeeker/Puppeteer-style agent-hijack corpora against the deteng skill and scores by whether it would have mis-synthesized a rule. Failing prompts feed the adversarial gate and, via the watchdog, can freeze an actor. `[ext]` | 3 | 5 | `@kbn/evals-suite-argus-detection` (adversarial sub-suite) |
| R3 | ~~**Pareto-optimal rule synthesis.**~~ ✅ **landed 2026-04-17.** `@kbn/argus-exploit-to-detection/synthesize_pareto.ts` now enumerates a deterministic composition grid across three strictness knobs (`must_anchor_subset`, `wildcard_retention`, `minimum_should_match`), dedups canonical queries, heuristically predicts P / R / FP-rate + per-axis false-negative rate per candidate, computes the Pareto frontier, and chooses one via a tunable weighted-sum scorer. Frontier metadata (`chosen`, `frontier`, `dominated`, `applied_weights`) is attached to every filed `mutation_intent` as `argus.synthesis` when the CLI is invoked with `--pareto`. 17 tests (`synthesize_pareto.test.ts`) plus a `mutation_intent` integration test. | 3 | 4 | `@kbn/argus-exploit-to-detection/synthesize_pareto.ts` + `mutation_intent.ts` + `scripts/run_exploit_to_detection.ts --pareto` |
| R4 | ~~**Variant generation via LLM + axis-aware mutators.**~~ ✅ **landed 2026-04-17.** `@kbn/argus-exploit-to-detection/llm_variant_provider.ts` defines a `VariantProvider` abstraction that a real LLM can plug into, with a deterministic golden-set-gated `ScriptedLlmVariantProvider` used for tests and demos. Every candidate is run through `validateLlmVariant`, which enforces a three-layer safety envelope: golden-set blocklist (e.g. hard-coded bitcoin / C2 tokens), axis invariants (markers for `encoding_layers`, `minimum_should_match` guards, LOLBAS allow-list, platform executable allow-list), and parent-ancestry allow-list. Rejections and acceptances are emitted as `VariantTraceEvent`s so they become eval targets alongside R11's reasoning-trace suite. The CLI gains `--variant-source deterministic\|scripted-llm` plus `--max-rejection-rate` to fail-closed if the provider drifts. 14 tests (`llm_variant_provider.test.ts`). `[ext]` | 4 | 4 | `@kbn/argus-exploit-to-detection/llm_variant_provider.ts` + `scripts/run_exploit_to_detection.ts --variant-source` |

### 3.2 Autonomous response & governance

| # | Idea | E | A | Landing site |
|---|------|---|---|--------------|
| R5 | ~~**One-way vs two-way door classification per mutation.**~~ ✅ **landed 2026-04-20.** `argus.decision.door_class ∈ {one_way, two_way}` on every `mutation_intent`. Trust gate forces `pending_review` for one-way doors regardless of actor tier. rule_create is pinned two_way (detection-only rules are rollback-safe). | 2 | 5 | `mutation_intent.ts`, `soc-argus-trust-gate.yaml` |
| R6 | ~~**Rollback MTTR metric.**~~ ✅ **landed 2026-04-20.** `soc-recovery.yaml` computes `rolled_back_at - applied_at` per rollback via an inline painless call and upserts `.soc-outcomes` rows keyed `mttr-<rec_id>` (idempotent; `rollback_mttr_emitted_at` stamps the rec so subsequent ticks skip). `soc-argus-trust-tier-assessor.yaml` rolls up per-actor `avg_rollback_mttr_ms`, `p50_rollback_mttr_ms`, `p95_rollback_mttr_ms` into `.soc-actor-trust-tiers.metrics`. `/internal/security_solution/argus/governance_pulse` + the Pulse tile (`@kbn/argus-console` / `@kbn/argus-console-common`) surface the tenant-wide p50 + tail to demo operators. | 2 | 4 | `soc-recovery.yaml` + `soc-argus-trust-tier-assessor.yaml` + `@kbn/argus-console-common` `buildGovernancePulse` |
| R7 | ~~**Blast-radius estimate per recommendation.**~~ ✅ **landed 2026-04-17.** `mutation_intent.ts` stamps `expected_impact.blast_radius` (hosts / tenants / rules) + derived `blast_tier` on every recommendation; `@kbn/argus-trust-policy` (27 tests, including a 160-combo exhaustive matrix and a YAML↔TS drift detector) is the authoritative spec consumed by `soc-argus-trust-gate.yaml` to cap auto-apply per actor trust tier. `[ext]` | 3 | 5 | `mutation_intent.ts` + `@kbn/argus-trust-policy` + `soc-argus-trust-gate.yaml` |
| R8 | ~~**Shadow execution**~~ ✅ **landed 2026-04-17.** `soc-autonomous-applier.yaml` defers every `auto_apply` to `soc-rule-backtester.yaml`, which projects the likely rule-hit delta against historical traffic and classifies a verdict (`safe` / `noisy` / `silent` / `dangerous`). `@kbn/argus-backtest` (24 tests, including YAML↔TS drift detector across applier + backtester) is the authoritative spec for the classification rubric and the `flipIntentStatus` mapping back onto `.soc-mutation-intents`. | 3 | 4 | `soc-rule-backtester.yaml` + applier + `@kbn/argus-backtest` |

### 3.3 Reasoning traces & observability

| # | Idea | E | A | Landing site |
|---|------|---|---|--------------|
| R9 | ~~**OTEL-GenAI-1.x alignment** of `.soc-reasoning-trace`~~ ✅ **landed 2026-04-20.** `gen_ai.*` top-level mapping (system, request, response, usage, operation, agent, tool) added to `soc-reasoning-trace.json` + emission from reconciler, trust-gate, detection-eval, and watchdog workflows. Traces are now portable across any OTEL-compliant viewer (Phoenix, Langfuse, etc.). | 2 | 5 | `soc-reasoning-trace.json` + 4 workflows |
| R10 | ~~**Watchdog on reasoning confidence dropout**~~ ✅ **landed 2026-04-20.** `soc-argus-reasoning-watchdog.yaml` runs every 5 min. Computes 15-min mean `argus.decision.confidence` per actor and compares against 24h baseline; if `short_mean < 0.5` OR `(baseline − short) > 0.2`, the actor is frozen (tier=quarantined, `watchdog_frozen=true`). Recovery is cleared on next tick; actual tier re-derivation is handed back to the hourly assessor. | 3 | 5 | `soc-argus-reasoning-watchdog.yaml` |
| R11 | ~~**Trace-level evals**~~ ✅ **landed 2026-04-17.** `@kbn/evals-suite-argus-reasoning` scores `.soc-reasoning-trace` spans across evidence / calibration / coherence / safety, aggregates (mean, p5), and writes a `gate_decision` (`pass` / `marginal` / `fail`) into `.soc-reasoning-eval-runs`. The hourly `soc-argus-trust-tier-assessor` reads the freshest row and quarantines actors on `fail` (marginal caps at probationary). The new `soc-argus-reasoning-eval.yaml` poller (every 2m) emits fast-path quarantine hints and governance traces for near-real-time visibility. Two runner modes: Playwright suite (LLM-as-judge via `@kbn/evals`) and standalone `run_reasoning_eval.ts` CLI (heuristic judge for demo laptops). 25 tests across judge + evaluators + full-flow integration. `[ext]` | 4 | 4 | `@kbn/evals-suite-argus-reasoning` + `soc-argus-reasoning-eval.yaml` + `soc-argus-trust-tier-assessor.yaml` |

### 3.4 Interop & data sources

| # | Idea | E | A | Landing site |
|---|------|---|---|--------------|
| R12 | ~~**MCP / A2A support** for the ARGUS skill surface.~~ ✅ **landed 2026-04-20.** Three new packages project ARGUS skills through principal-scoped policy bundles with full governance integration: `@kbn/argus-tool-manifest` (27 tests) projects raw skills with adversarial/reasoning/trust-tier gating and `propose_only` enforcement; `@kbn/argus-mcp-server` (16 tests) serves the projection over MCP with a `RestGovernanceClient`; `@kbn/argus-a2a-server` (20 tests) exposes the same surface as A2A tasks with an `InMemoryTaskStore` and cross-actor access checks. Governance snapshot is consulted on every `list_tools` and `tools/call`, never bypassed. 63 tests green, zero lint errors, zero R12 type errors. `[ext]` | 3 | 3 | `@kbn/argus-tool-manifest` + `@kbn/argus-mcp-server` + `@kbn/argus-a2a-server` |
| R13 | ~~**Shadow-AI telemetry as a Mythos signal.**~~ ✅ **landed 2026-04-20.** `integrations#18123` (Shadow AI Discovery) wired into `exploit_probability.mythos_signal`; AI-tool presence on a host now raises exploit likelihood in the scorer. `[ext]` | 2 | 4 | `@kbn/argus-exploit-probability` inputs |
| R14 | ~~**CISA KEV live feed.**~~ ✅ **landed 2026-04-20.** `soc-kev-ingest.yaml` pulls CISA KEV daily and indexes into `.soc-cve-advisories`; KEV is no longer a hard-coded boolean in the scorer — it's a live, dated enrichment. | 2 | 4 | `soc-kev-ingest.yaml` |

---

## 4. Post-feature-complete plan

**Status as of 2026-04-17.** G1–G5 + R1–R14 are all landed on the demo
branch. The entire top-of-backlog identified by the 2026-04-19 snapshot
has been executed, plus the R3/R4 detection-engineering spine added on
2026-04-17:

- ~~R1 — ATT&CK ER7 corpus import~~ ✅
- ~~R2 — adversarial prompt-injection eval~~ ✅
- ~~R3 — Pareto-optimal rule synthesis (`@kbn/argus-exploit-to-detection/synthesize_pareto.ts`, 17 tests)~~ ✅
- ~~R4 — LLM + axis-aware variant generation (`@kbn/argus-exploit-to-detection/llm_variant_provider.ts`, 14 tests)~~ ✅
- ~~R7 — blast-radius per recommendation (`@kbn/argus-trust-policy`, 27 tests)~~ ✅
- ~~R8 — shadow execution (`@kbn/argus-backtest`, 24 tests)~~ ✅
- ~~R11 — trace-level evals (`@kbn/evals-suite-argus-reasoning` + `soc-argus-reasoning-eval.yaml`, 25 tests)~~ ✅
- ~~R12 — MCP / A2A tool surface (tool-manifest + mcp-server + a2a-server, 63 tests)~~ ✅
- ~~R13 — Shadow-AI telemetry as Mythos signal~~ ✅
- ~~R14 — CISA KEV live feed (`soc-kev-ingest.yaml`)~~ ✅

No remaining items from the R1–R14 `[ext]` backlog. Newly-surfaced ideas
continue to live in `docs/argus/phase-3/` and the `docs/argus/issues/`
queue; promote them into a row above when they earn Mythos payoff.

---

## 5. How to keep this doc honest

- This is a point-in-time snapshot. When a gap is closed or a new `[ext]`
  idea lands, update the relevant row and move it to `capability-map.md`
  if it becomes part of the permanent contract.
- Pair with `demo-validation-<date>.md` for every rerun of the demo so
  the "what is live today" column stays accurate.
- Never let "P1 must-fix" gaps sit in here for more than two weeks
  without an issue filed — escalate instead.
