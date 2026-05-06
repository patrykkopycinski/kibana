# `.soc-mutation-intents` — schema v2

Source-of-truth Zod schema: `MutationIntentEnvelopeSchema` in
[`contracts.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/synthesis/contracts.ts).

TypeScript shape: [`MutationIntent`](../../../../x-pack/solutions/security/packages/kbn-argus-exploit-to-detection/mutation_intent.ts).

Builder: `buildMutationIntent()` in
[`mutation_intent.ts`](../../../../x-pack/solutions/security/packages/kbn-argus-exploit-to-detection/mutation_intent.ts).

## Purpose

The canonical Path A output — a write-time envelope that carries
everything the trust gate, applier, dashboards, and reverse-intel loop
need to act on a proposed rule mutation. Every CVE-driven synthesis path
(workflow step, chat tool, CLI) MUST emit this exact shape.

## Discriminator + version

| Field | Value | Notes |
| --- | --- | --- |
| `type` | `'mutation_intent'` | Top-level discriminator. |
| `kind` | `'rule_create'` | Sub-discriminator. Rule-patch / rule-disable variants will appear as new `kind` values when implemented. |
| `schema_version` | `2` | Integer. v1 was the legacy `proposed_rule_delta` shape; v2 is the canonical M2.2 envelope. |
| `source` | `'argus.exploit_to_detection'` | Declares the producing pipeline. |
| `status` | `'pending'` | Always `pending` at write time. The applier mutates this. |
| `track` | `'agentic'` | Distinguishes agent-filed intents from manual ones. |

## Envelope fields

`rec_id`, `title`, `summary`, `confidence (0..100)`, `advisory_id`,
`cve?`, `draft_rule`, `variant_corpus_id`, `variant_count`, `evidence[]`
(non-empty), `expected_impact { expected_tp_impact, coverage_delta,
blast_radius?, blast_tier? }`, `details`. See `MutationIntent` for the
full TS contract.

## ARGUS-specific fields

The `argus.*` namespace carries:

- `origin`: routing tag — one of `exploit_to_detection`, `gap_analysis`,
  `consolidation`, `cti_ingest`, `pattern_seed`, `manual`.
- `decision { kind, confidence (0..1), door_class }`.
- `agent { id: 'argus.exploit_to_detection', version }`.
- `actor { trust_tier }` — one of the four tiers
  (`probationary`, `scoped`, `trusted`, `frontier`).
- `corpus { id, expected_rule_id }`.
- `synthesis?` — Pareto-pass metadata (chosen + frontier + dominated).
- `pattern_id?`, `procedure_clusters?`, `coverage_delta?` — Tier 2.

## Forbidden / legacy fields

The Zod schema rejects documents that carry `proposed_rule_delta`. That
field was the v1 envelope shape (a flat delta object instead of a full
draft rule). Five benchmark queries had to be rewritten when the
producer migrated; the contract now refuses to write a doc that mixes
the two shapes.

## Forward compatibility

`MutationIntentEnvelopeSchema` is `.passthrough()` — downstream consumers
(trust gate, applier reconciler) routinely attach decoration fields like
`governance_gate { status, verdict }` or `applier_marks { applied_at }`.
Producers MUST NOT enforce strict equality on the doc.

## Producers

| Producer | File | Notes |
| --- | --- | --- |
| Autonomous synthesis workflow | `soc-simulation/workflows/soc_argus_synthesis_driver.yaml` → `security.argusSynthesizeAdvisory` step | Primary loop. Writes through workflow-execution credentials. |
| Chat-skill tool | `argus.synthesize_rule_candidate` (see `synthesize_rule_candidate_tool.ts`) | Same `synthesizeOne` core; writes via `asCurrentUser`. |
| CLI | `run_exploit_to_detection.ts` | Used for replay / fixture seeding. Writes through `kbn/elasticsearch` client. |

All three use `MutationIntentEnvelopeSchema` as a write-time guard. A
contract violation is **fail-closed** on every path — the doc is not
written.

## Consumers

- Trust gate (`@kbn/argus-trust-policy`): reads `argus.actor.trust_tier`,
  `argus.decision.door_class`, `expected_impact.blast_tier`.
- Applier (`soc-applier`): reads `kind`, `details.*`, `draft_rule`.
- Dashboards: read `argus.synthesis`, `argus.coverage_delta`.
- Benchmark runner D1.* / D4.*: now uses canonical fields only.
- Reverse-intel loop (B10): reads `cve`, `argus.coverage_delta`.

## Drift history

- 2026-05-04 — F-007: benchmark queried legacy
  `proposed_rule_delta.change_type / mitre_technique`. Producer was
  always canonical (v2); benchmark queries rewritten.
- 2026-05-05 — B16: contract test now exercises a real
  `synthesizeOne` output and rejects the legacy `proposed_rule_delta`
  shape; both producers (workflow step + chat tool) wired through
  the contract.

## Versioning

Schema is at v2. Future bumps:

- `kind: 'rule_patch'` and `kind: 'rule_disable'` will be added as new
  literals in the discriminator (no version bump — additive).
- A `kind: 'response_action'` synthesizer (host isolation, credential
  revoke) would change the `details` sub-shape and would be a
  breaking change → bump to v3 with both branches kept for one release.
