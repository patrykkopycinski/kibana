# AutoDEX `.soc-*` schemas — canonical contracts (B16)

> This page is the **human-readable index** of the `.soc-*` data shapes
> AutoDEX reads or writes. The **runtime source of truth** is the Zod
> schema in
> [`x-pack/.../security_solution/server/lib/argus/synthesis/contracts.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/synthesis/contracts.ts).
> Producers MUST validate every doc through the matching schema before
> writing. Drift caught at write-time is loud (`logger.error` + skipped
> write); drift caught at test-time is fatal
> (`contracts.test.ts` fails CI).

## Why B16 exists

The live B1 boot (F-007 / F-015) surfaced four parallel sources of `.soc-*`
schema confusion at once:

1. The benchmark runner queried `proposed_rule_delta.change_type` (legacy)
   while the synthesizer wrote `kind: 'rule_create' + draft_rule`
   (canonical). Five queries had to be schema-corrected by hand.
2. The TaskManager driver wrote nested `agent: { id, version }` and
   `actor: { trust_tier }` objects into `.soc-evolution-log`, but the
   data-stream mapping had those fields as flat top-level keywords.
   Every write failed with `document_parsing_exception`.
3. The chat-skill tool independently invented its OWN evolution-log
   shape (`event` instead of `event_type`, `agent: { id }` again),
   silently dropping every chat-skill audit row.
4. The benchmark seed pack used a legacy advisory shape
   (`techniques[]`, `platforms[]`, `observable_signals[]`) that the
   `validateAdvisory` Path A entry rejected at runtime.

There was no single document anyone could point to, no schema version,
no contract test, and no write-time guard. B16 fixes all four.

## Scope of this iteration

The current contracts module covers the **synthesis chain** end-to-end —
the pipeline that goes from advisory ingestion to a written mutation
intent + audit trail. Indices outside that chain (crown jewels, FP
baselines, skill metrics, etc.) are documented as TODO so future blockers
can extend the same pattern instead of re-litigating it.

| `.soc-*` index | Schema version | Doc | Producers | Consumers | Status |
| --- | --- | --- | --- | --- | --- |
| `.soc-cve-advisories` | 1 | [`soc-cve-advisories.md`](./soc-cve-advisories.md) | `seed_argus_demo_advisories.ts`, future CTI ingest workflow | `synthesizeOne`, workflow step, chat tool, benchmark runner | covered |
| `.soc-mutation-intents` | 2 | [`soc-mutation-intents.md`](./soc-mutation-intents.md) | workflow step `security.argusSynthesizeAdvisory`, chat tool `argus.synthesize_rule_candidate`, CLI `run_exploit_to_detection.ts` | trust gate, applier, dashboards, benchmark runner | covered |
| `.soc-reasoning-trace` | 1 | [`soc-reasoning-trace.md`](./soc-reasoning-trace.md) | workflow step, chat tool, CLI | observability dashboards, audit | covered |
| `.soc-evolution-log` | 1 | [`soc-evolution-log.md`](./soc-evolution-log.md) | workflow step, workflow tick-summary YAML, chat tool, kill-switch toggler | autonomy dashboards, benchmark runner D5.* | covered |
| `.soc-kill-switch` | 1 | [`soc-kill-switch.md`](./soc-kill-switch.md) | `argus.toggle_kill_switch` chat tool, operator UI | workflow gating step, applier | covered |
| `.soc-recommendations` | n/a | TODO — legacy index, deprecated by `.soc-mutation-intents` | n/a | n/a | deprecated |
| `.soc-crown-jewels` | 1 | [`soc-crown-jewels.md`](./soc-crown-jewels.md) | operator-curated; bulk-loaded via the asset register UI / CLI | crown-jewel governance gate (`evaluateCrownJewelImpact` helper, applier YAML 12th gate), audit dashboards | covered (B5) |
| `.soc-skill-metrics` | TBD | gated on B9 | skill telemetry | self-adjusting skills loop | TODO |
| `.soc-skill-recommendations` | 1 | [`soc-skill-recommendations.md`](./soc-skill-recommendations.md) | `soc-skill-self-adjust` workflow (mirrors `evaluateSkillHealth`) | trust-tier assessor, ARGUS Console Skills panel, MCP admission gate | covered (B9) |
| `.soc-rule-fp-baseline` | 1 | [`soc-rule-fp-baseline.md`](./soc-rule-fp-baseline.md) | `soc-argus-fp-baseline-roller` workflow (mirrors `estimateRuleFpBaseline`) | future baseline-to-overrides applier; B6 per-rule gate overrides | covered (B3) |
| `.soc-dac-export-queue` | 1 | [`soc-dac-export-queue.md`](./soc-dac-export-queue.md) | `soc-argus-dac-export` workflow (B4) | out-of-cluster DaC sidecar (opens PRs) | covered (B4) |
| `.soc-intel-feed` | 1 | [`soc-intel-feed.md`](./soc-intel-feed.md) | generic adapter, analytics adapter, Mythos aggregator, **`soc-incident-reverse-intel` (B10)**, **`soc-argus-intel-adapter-kev` (B2)** | Mythos aggregator, ARGUS Console intel-feed panel, `@kbn/argus-exploit-probability` | covered (B10 added `kind: ttp_observed` + `evidence.*` block; B2 added KEV → intel-feed production fan-out producer) |
| `.soc-coverage-gaps` | TBD | gated on B17 | coverage scanner | Phase 2 of `soc-deteng.yaml` | TODO |
| `.soc-backtests` | TBD | TODO | backtester workflow | trust gate, dashboards | TODO |
| `.soc-outcomes` | TBD | TODO | analyst triage UI, applier feedback | reverse intel loop, FP baseline | TODO |

The TODO rows are explicitly listed so reviewers can see what's NOT yet
canonical. When a blocker lands that touches one of those indices,
extend `contracts.ts` and add the matching `soc-<index>.md` page.

## Versioning rules

- Each schema in `contracts.ts` exports a `*_SCHEMA_VERSION` integer.
- Every document MUST carry that version when the index mapping
  reserves a `schema_version` field (today: `.soc-mutation-intents`).
- A backwards-incompatible change bumps the integer **and** keeps the
  previous shape readable for one release (consumer-side branch in the
  Zod schema, producer-side migration in the workflow YAML).
- Forward compatibility: every Zod schema is `.passthrough()`. Producers
  may attach extra fields (trust-policy decorations, applier
  reconciliation marks, etc.) without coordinating a schema bump.
- Drift catcher: `.refine()` clauses on the canonical envelopes
  explicitly REJECT known legacy shapes (e.g. `proposed_rule_delta`,
  nested `agent: { id }`, `event` vs `event_type`, `techniques` vs
  `mitre`) so reverts to old shapes fail loudly.

## Adding a producer

1. Build the document.
2. Validate it via `checkContract(<Schema>, doc)` from
   `x-pack/.../server/lib/argus/synthesis/contracts.ts`.
3. On `ok=false`, log `[contract]`-prefixed error and either fail closed
   (canonical writes) or skip (best-effort audit writes).
4. Add a positive contract test next to `contracts.test.ts` — ideally
   exercise the producer end-to-end so a future refactor that breaks the
   contract fails the test.

## Adding a consumer

1. Read the canonical schema doc in this folder.
2. Use the matching Zod schema's `.parse()` if you need TS types.
3. Tolerate `.passthrough()` extras — never assert exact equality.
4. If you need a field that isn't documented, treat that as a contract
   negotiation: open a follow-up to add it to `contracts.ts` and bump
   the schema version.

## Drift history

The blockers / findings table below is the running ledger of every
schema drift event the benchmark or live boot has surfaced.

| Date | Tag | Drift | Resolution | Next action |
| --- | --- | --- | --- | --- |
| 2026-05-04 | F-007 | benchmark queried `.soc-recommendations` + `proposed_rule_delta.*`; producer wrote to `.soc-mutation-intents` + `kind: 'rule_create'` | benchmark queries rewritten; canonical envelope kept | created B16 |
| 2026-05-05 | F-015 (a) | TaskManager driver wrote nested `agent / actor` to `.soc-evolution-log`; mapping wanted flat keywords | driver migrated to flat shape; workflow step + chat tool now share helpers | this doc + contract |
| 2026-05-05 | F-015 (b) | benchmark scorer queried legacy `proposed_rule_delta.change_type / mitre_technique` | scorer made schema-tolerant | covered by B16 contract |
| 2026-05-05 | F-015 (c) | seed pack advisories used `techniques[] / platforms[] / observable_signals[]` instead of canonical `mitre[] / target_platforms[] / signals[]` | seed pack rewritten to canonical shape | `StructuredAdvisorySchema` rejects legacy fields |
| 2026-05-05 | B16 | discovered chat tool was writing legacy `event / agent.id` evolution-log row, silently failing | chat tool fixed to canonical flat shape; `EvolutionLogRowSchema.refine()` denylist locks it down | covered by `contracts.test.ts` |
| 2026-05-05 | B5 | `.soc-crown-jewels` had no schema, no helper, no contract test — vision-doc 6.3 entirely unimplemented | added `CrownJewelDocSchema` to `contracts.ts`, `evaluateCrownJewelImpact` helper, 21 helper tests + 8 contract tests, per-index doc | applier YAML wiring is a one-step follow-up |
| 2026-05-05 | B9 | `.soc-skill-metrics` had no consumer — vision-doc §1.5 self-adjusting skills loop entirely unimplemented | added `evaluateSkillHealth` verdict matrix in `kbn-argus-tool-manifest`, mirroring Liquid impl in `soc-skill-self-adjust.yaml`, new `.soc-skill-recommendations` index template + per-index doc | trust-tier assessor / Console / MCP admission-gate consumers are explicit follow-ups |
| 2026-05-05 | B10 | vision-doc §1.7.4 incident-TTPs → threat-intel reverse loop missing — `.soc-forensic-summary` and `.soc-outcomes` already carried TTPs but no producer wrote them back into `.soc-intel-feed` | added `extractReverseIntel` pure-logic spec in `lib/argus/intel/reverse_intel_extractor.ts` with 24 unit tests, `soc-incident-reverse-intel.yaml` workflow, extended `.soc-intel-feed` with `kind: ttp_observed` + `evidence.*` block, per-index doc + RFC | full-fidelity aggregation step (registered `security.argusReverseIntelExtract`) is the explicit follow-up; YAML ships in conservative one-row-per-technique mode |
| 2026-05-05 | B8 | vision-doc §2 epic 17093 (Prebuilt Rule Lifecycle) had no engine — chat surface for "this prebuilt upgrade conflicts with my customisations" entirely missing | added `evaluatePrebuiltLifecycle` pure-logic engine in `lib/argus/governance/prebuilt_lifecycle_advisor.ts` with 24 unit tests (5-verdict matrix, 3 proposal types, operator-tunable `manual_review_conflict_floor=3` + `protected_fields=['query', 'threshold', 'language', 'index', 'type']` knobs), RFC | chat-skill registration + four prerequisite tools (`get_prebuilt_rule_diff`, `preview_prebuilt_upgrade`, `apply_prebuilt_upgrade`, `merge_prebuilt_upgrade`) sequenced behind 17090.4 ramp; persistence index TBD (likely extension of `.soc-skill-recommendations` from B9, or dedicated `.soc-prebuilt-lifecycle`) |
| 2026-05-05 | B2 | vision-doc §1.2.2 / §1.8.2 / §3.1 production CTI source not connected — `.soc-intel-feed` carried only demo seeds; KEV ingest wrote only to `.soc-cve-advisories` | added `soc-argus-intel-adapter-kev.yaml` workflow (Phase 1 production-CTI spike): every 30m fans out KEV advisories already pulled by R14 `soc-kev-ingest` into `.soc-intel-feed` rows of `kind: exploit_availability` with `source_trust=0.9 / signal_strength=0.85 / half_life_days=30`, idempotent `intel_id=kev-<cve>`. RFC + registry entry. | Phase 2 cross-cluster `ia-cti_enrichment` adapter deferred on org-level cross-cluster-auth + per-tenant CTI scrubbing decisions; Phase 3 STIX/TAXII deferred behind a dedicated `@kbn/argus-taxii-adapter` package |
| 2026-05-05 | B3 | vision-doc §1.3.3 production-grounded FP baseline absent — `DEFAULT_GATE_THRESHOLDS` are global constants; B6 per-rule overrides have no data source | added `estimateRuleFpBaseline` pure-logic estimator in `lib/argus/governance/fp_baseline_estimator.ts` with 22 unit tests (4-verdict matrix, Laplace-smoothed FP-rate, exp confidence curve), new `.soc-rule-fp-baseline` index template + per-index doc, ingestion workflow `soc-argus-fp-baseline-roller.yaml` (24h cadence, conservative volume-only emission), RFC | registered server-side step (label-aware emission joining alerts with `.soc-outcomes`) + applier workflow that projects baselines onto B6's `gate_overrides` are explicit RFC §6 follow-ups |
| 2026-05-05 | B4 | vision-doc §1.6.1 detection-as-code git-backed deployment absent — every mutation written via Kibana detection-engine API in place; no committable artifact, no PR review, no reverse-merge applier | added pure-logic `lib/argus/dac/rule_artifact.ts` (CRD-shaped envelope `apiVersion: argus.elastic.co/v1` / `kind: ARGUSDetectionRule`; `toArtifact` / `fromArtifact` / `stringifyArtifact` with deterministic key ordering and round-trip identity proven by 23 unit tests; rejects schema drift on parse), new `.soc-dac-export-queue` index template + per-index doc, producer workflow `soc-argus-dac-export.yaml` (1h cadence, queues applied ARGUS-authored mutations not yet exported, idempotent `queue_id = mutation_intent_id`), RFC | out-of-cluster sidecar agent (the only piece that holds git credentials and opens PRs) + reverse-merge applier (`soc-argus-dac-applier`) + registered `security.argusBuildDacArtifact` step that calls the canonicaliser are explicit RFC §4 follow-ups |

## Where this lives in code

```
x-pack/solutions/security/plugins/security_solution/server/lib/argus/synthesis/
├── contracts.ts          ← Zod schemas (runtime source of truth)
├── contracts.test.ts     ← positive + negative contract tests
├── synthesize_one.ts     ← producer of MutationIntent + traces
└── constants.ts          ← shared agent_id / trust_tier strings

x-pack/solutions/security/plugins/security_solution/server/workflows/step_types/argus_synthesize_advisory_step/
├── argus_synthesize_advisory_step.ts        ← writes to .soc-mutation-intents,
│                                              .soc-reasoning-trace,
│                                              .soc-evolution-log
└── argus_synthesize_advisory_step.test.ts   ← exercises the writes

x-pack/solutions/security/plugins/security_solution/server/agent_builder/tools/argus_playbooks/
├── synthesize_rule_candidate_tool.ts        ← chat-skill producer (same writes)
└── toggle_kill_switch_tool.ts               ← .soc-kill-switch producer

soc-simulation/workflows/
└── soc-argus-synthesis-driver.yaml          ← orchestrates ticks, writes
                                                tick-summary rows to
                                                .soc-evolution-log

soc-simulation/docs/autodex/schemas/         ← THIS FOLDER (human-readable docs)
```

## Cross-references

- [`conformance-matrix.md`](../conformance-matrix.md) — overall AutoDEX
  validation status, including the B16 ledger row.
- [`rfcs/B1-synthesis-driver.md`](../rfcs/B1-synthesis-driver.md) —
  RFC for Path A convergence; explains why every synthesis path produces
  the canonical envelope this folder documents.
