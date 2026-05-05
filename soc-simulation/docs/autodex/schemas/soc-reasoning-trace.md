# `.soc-reasoning-trace` — schema v1

Source-of-truth Zod schema: `ReasoningTraceEventSchema` in
[`contracts.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/synthesis/contracts.ts).

TypeScript shape: [`VariantTraceEvent`](../../../../x-pack/solutions/security/packages/kbn-argus-exploit-to-detection/llm_variant_provider.ts).

## Purpose

Per-variant reasoning trace emitted by the variant validator. One row
per (advisory, axis, platform, variant_index). Drives the
`Variant Trace` panel in the Mutation Detail flyout and the D5.* audit
queries in the benchmark runner.

## Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `corpus_id` | string | Identifies the variant corpus this row belongs to. |
| `rule_id` | string | The draft rule this corpus targets. |
| `advisory_id` | string | Cross-references `.soc-cve-advisories`. |
| `axis` | `VariantAxis` | One of the six canonical axes. |
| `platform` | `TargetPlatform` | One of the four canonical platforms. |
| `variant_index` | integer ≥ 0 | Position within the corpus. |
| `accepted` | boolean | Whether the validator accepted this variant. |
| `reasons[]` | string[] | Reject reasons (empty when accepted). |
| `rationale` | string | LLM / scripted-fake rationale. |
| `command_line_sample` | string | The candidate's shell line. |
| `provider` | string | `scripted`, `inference.<connector>`, etc. |

## Optional fields

| Field | Type | Notes |
| --- | --- | --- |
| `@timestamp` | ISO-8601 string | Stamped by the producer right before write. |

## Producers

- Workflow step `security.argusSynthesizeAdvisory` (bulk index per advisory).
- Chat-skill tool `argus.synthesize_rule_candidate` (bulk index per call).
- CLI `run_exploit_to_detection.ts` (bulk index for fixture replays).

Both server-side producers run each event through
`ReasoningTraceEventSchema` at write time and **drop** drifted events
rather than fail the whole synthesis. This is best-effort (the audit
trail is informational; the canonical write is the mutation intent).

## Consumers

- Mutation Detail flyout — `Variant Trace` tab.
- Benchmark runner D5.* queries.
- Reasoning-trace dashboard (`.soc-self-learning-loop` workflow audit).

## Drift history

No drift events to date. The schema is small and the producers all
share the same `synthesizeOne` core, so the surface is naturally
narrow.

## Versioning

v1. The next likely change is adding a `family` axis (split out from
`command_args`) which would be a backward-compatible enum extension.
