# `.soc-evolution-log` — schema v1

Source-of-truth Zod schema: `EvolutionLogRowSchema` in
[`contracts.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/synthesis/contracts.ts).

## Purpose

Per-tick / per-action audit row. Captures every "something happened in
the autonomy loop" event so the autonomy dashboards, benchmark D5.*
queries, and forensic reverse-intel investigations have a single
chronological feed to walk.

## Schema (FLAT)

The data-stream mapping is **flat**: every audit-relevant field is a
top-level keyword. Producers MUST NOT nest `agent`, `actor`, or
`event` as objects — that triggers
`document_parsing_exception: Expected text but found START_OBJECT` and
silently drops every write (see F-015 part a).

| Field | Type | Notes |
| --- | --- | --- |
| `@timestamp` | ISO-8601 string | Required. |
| `event_type` | string | snake.dotted.string — `synthesis.tick`, `synthesis.advisory`, `synthesis.chat_skill`, etc. **Must be a string, not an object.** |
| `agent_id` | string | The agent that produced the row (e.g. `argus.synthesis.driver`). Top-level scalar. |
| `source` | string | The component identity (workflow name, tool name). |
| `actor` | string | The acting principal — e.g. `argus.synthesis.driver.workflow`. **String, not an object.** |
| `trust_tier` | enum | `'probationary' \| 'scoped' \| 'trusted' \| 'frontier'`. Used for trust-tier dashboards. |
| `result` | string | Free-form. `ok`, `halted`, `dead_letter_high_rejection_rate`, `mutation_intent_contract_violation`, etc. |
| `message` | string | Human-readable summary. Surfaces in the audit feed. |
| `metrics_snapshot?` | object | Free-form payload. Producer attaches structured details (advisory_id, rec_id, durations, autonomy_enabled, etc.). |

## Forbidden / legacy fields

The Zod refine clause rejects rows with **any** of:

- `agent` as an object — must be flat `agent_id`.
- `actor` as an object — must be flat string.
- `event` as a top-level field when `event_type` is missing — that's
  the legacy chat-tool shape. Use `event_type`.

These are not theoretical: every one of them was found in the wild
during the F-015 boot.

## Producers

| Event type | Producer | Where |
| --- | --- | --- |
| `synthesis.tick` | `soc-argus-synthesis-driver.yaml` (tick summary step) | One row per workflow tick. |
| `synthesis.advisory` | `security.argusSynthesizeAdvisory` step | One row per advisory processed. |
| `synthesis.chat_skill` | `argus.synthesize_rule_candidate` chat tool | One row per chat-skill invocation. |
| `kill_switch.toggle` | `argus.toggle_kill_switch` chat tool | One row per kill-switch toggle (this producer is documented elsewhere; the contract still applies). |

All producers share the canonical agent_id constant
(`SYNTHESIS_DRIVER_AGENT_ID`) and the initial trust tier
(`SYNTHESIS_DRIVER_INITIAL_TRUST_TIER`), so every row is correctly
attributed to the autonomy loop.

## Consumers

- Autonomy dashboards (Mutation Inspector → Audit tab).
- Benchmark D5.* queries (autonomy / safety dimensions).
- Reverse-intel loop (B10) reads `event_type='synthesis.advisory'`
  rows to correlate field-deployed mutations back to advisories.

## Drift history

- 2026-05-05 — F-015 (a): TaskManager driver wrote nested
  `agent: { id, version }`, `actor: { trust_tier }`, `event_type`
  inadvertently as an object. Mapping rejected every row.
- 2026-05-05 — B16: chat tool was independently writing legacy
  `event` + `agent: { id }` shape. Fixed; both producers now share the
  same flat helper.

## Versioning

v1. The schema is intentionally permissive (`.passthrough()` +
free-form `metrics_snapshot`) so new event types or new metric fields
land additively. The denylist refine catches the specific drift modes
that have actually broken production; everything else is forward
compatible.
