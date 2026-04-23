# M2.5 — Reasoning-Trace Schema

The field dictionary for `.soc-reasoning-traces-*`, produced by the
`argus_reasoning_trace_enricher` ingest processor from upstream OTLP spans.

Document shape:

```jsonc
{
  "@timestamp": "2026-04-17T12:34:56.789Z",
  "trace_id":  "7a1b...",              // OTLP trace id (hex, 32 chars)
  "span_id":   "0b12...",              // OTLP span id (hex, 16 chars)
  "parent_span_id": "0a11...|null",

  "otlp": {                             // preserved raw passthrough for forensics
    "name": "skill.soc-alert-sweeper.invoke",
    "kind": "internal|client|server",
    "status_code": "ok|error",
    "attributes": { "...": "..." }
  },

  "argus": {
    "kind": "skill|agent|tool",
    "actor_id": "soc-alert-sweeper-skill", // tool/skill/agent id (triage merged into alert sweeper)
    "actor_version": "1.4.2",
    "invocation_id": "<uuid>",          // one per skill turn; groups spans
    "turn": 3,                          // 1-based turn counter within the invocation
    "decision": {
      "kind": "triage_verdict|rule_draft|tool_choice|tool_result|confidence_update",
      "value": "...",                   // shape depends on kind (see §2)
      "freeform_summary": "..."         // at most 200 chars, structured > prose
    },
    "confidence": 0.87,                 // 0..1, normalized per actor
    "confidence_delta_from_prev_turn": -0.05,
    "inputs_digest": [
      { "field": "source_event.original.message", "hash": "sha256:..." },
      { "field": "process.args", "hash": "sha256:..." }
    ],
    "tool_calls": [
      { "tool_id": "security.detection.synthesize_rule_from_exploit", "span_id": "0c22..." }
    ],
    "consumed_injection_surface": false,       // set by injection-surface detector
    "injection_surface_matches": [             // empty when false
      { "field": "source_event.original.message", "corpus_id": "injection-severity-downgrade-001" }
    ],
    "trust_tier_at_decision": "trusted|probationary|frontier|quarantined",
    "governance": {
      "quarantined_by": null,                  // watchdog/rule id if this span caused a quarantine
      "audit_row_id": "<uuid>"                 // link back to .soc-audit-trail
    }
  }
}
```

## 2. Decision shapes

| `decision.kind` | `decision.value` |
|---|---|
| `triage_verdict` | `{ verdict: "true_positive"|"false_positive"|"benign"|"escalate", rationale_signal_ids: [] }` |
| `rule_draft` | `{ rule_id, precision_hypothesis, observable_signals: [] }` |
| `tool_choice` | `{ tool_id, args_digest: "sha256:..." }` |
| `tool_result` | `{ tool_id, status: "ok"|"error", output_digest: "sha256:..." }` |
| `confidence_update` | `{ from: 0.72, to: 0.87, evidence_kind: "corroborated"|"contradicted"|"new_signal" }` |

Constraints:

- `decision.value` is always a flat object, never free text only.
- Raw prompts are **never** logged. Only digests (sha256 of canonical JSON) land in the
  trace. Raw prompts may be retained by upstream OTLP per its retention policy, never
  by ARGUS.

## 3. Injection-surface detector

Runs as a processor step after the main enricher:

1. Input: the set of `inputs_digest` fields on this span.
2. Lookup: `injection_surface_map` — a frozen set of `(field, digest)` pairs from the
   M2.4 prompt-injection corpus.
3. If any pair matches → set `argus.consumed_injection_surface = true` and populate
   `argus.injection_surface_matches` with the matching corpus ids.
4. Emit an `.soc-audit-trail` row `event_type: argus_reasoning_injection_consumed`
   with the trace_id and decision.kind, so `soc-trust-scorer` can downgrade the
   skill's trust tier if the subsequent decision was also drifted.

## 4. Mapping additions

`.soc-reasoning-traces-*` index template:

- `argus.kind`, `argus.actor_id` → `keyword`
- `argus.invocation_id`, `argus.decision.kind` → `keyword`
- `argus.confidence`, `argus.confidence_delta_from_prev_turn` → `float`
- `argus.consumed_injection_surface` → `boolean`
- `argus.inputs_digest` → `nested`
- `argus.trust_tier_at_decision` → `keyword`

## 5. Trust-scorer integration

`soc-trust-scorer` gains a new signal:

```
reasoning_trace_quality(actor_id, window=24h) =
   1.0
   - 0.5 * fraction_of_spans_that_consumed_injection_and_drifted
   - 0.2 * fraction_of_spans_with_missing_decision_value
   - 0.1 * max(0, mean_confidence_delta_absolute_value - 0.3)
```

Clamped to `[0, 1]`. A skill whose `reasoning_trace_quality` drops below 0.6 for 24h
is downgraded to `probationary`. Watchdog quarantines at < 0.3 for 2h.

## 6. Privacy

- No raw user PII in traces. The enricher drops any `argus.*` field whose value
  looks like an email address, phone number, or SSN pattern (conservative regex set).
- Digests use a per-deployment salt so cross-deployment correlation isn't trivial.

## 7. Minimum reviewable deliverable

- Index template + component templates for `.soc-reasoning-traces-*`.
- Ingest processor `argus_reasoning_trace_enricher` + pipeline test with at least
  5 fixture spans spanning all `decision.kind` values.
- Injection-surface detector with fixture matching against at least 3 curated
  injections.
- Governance dashboard panel: alert → reasoning drill-down (single saved query +
  Lens visualisation).
- Trust-scorer update with new signal wired to `.soc-trust-scores`.
