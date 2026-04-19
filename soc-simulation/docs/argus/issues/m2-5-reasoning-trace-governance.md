# M2.5 — Reasoning-Trace Governance

**Argus layer:** 05 Governance · **Pressure:** P3 agentic adversary · **Net-new**

## Context

Argus skills and agents make decisions at machine speed. Without structured
reasoning-trace capture, we cannot answer the single most important governance
question of the Mythos era: *"Why did this agent do this?"* The existing
`.soc-audit-trail` records *what* happened; M2.5 records *why*.

This milestone adopts OpenTelemetry tracing (OTLP) as the transport, Elasticsearch
as the backing store, and an Argus-specific enrichment layer that maps skill/agent
decisions into a reviewable schema.

## Goal

Every Argus skill, agent, and Agent-Builder tool invocation emits an OTLP trace that
lands in Elasticsearch as `.soc-reasoning-traces-*`. A reviewer can ask:

- Which tool calls did this skill consider, and which did it reject? Why?
- What context documents shaped this reasoning step?
- Did this reasoning step ingest any field that contained an
  `argus.simulation.preset = mythos_class_frontier` tag? (i.e., did it touch a
  known-malicious injection surface?)
- Did this skill's confidence change during the conversation, and on what evidence?

…all answerable via a dashboard and a saved-query set in Security Solution.

## Scope

### In scope

- OTLP instrumentation in the Argus-owned skills/agents using the Agent Builder
  trace SDK (falling back to a thin wrapper if upstream isn't available).
- Mapping pipeline OTLP → `.soc-reasoning-traces-*` using the existing
  `apm-@custom` + `logs-otel-*` infra; Argus adds an ingest processor
  `argus_reasoning_trace_enricher` that lifts Argus-specific attributes.
- Schema: see `scaffolds/m2-5-trace-schema.md` for the full field dictionary.
- Governance dashboard panel (Security Solution → Argus → Reasoning Traces) with
  drill-down from an alert to the reasoning chain that produced its triage verdict.
- Injection-surface detector: a subprocess on the enricher that flags traces where a
  skill consumed a field labelled as a simulated injection.

### Out of scope

- Forcing non-Argus skills to emit traces (opt-in).
- Custom tracing protocol — OTLP only.
- Retention / archival policy — inherits from existing APM ILM.

## Acceptance criteria

- [ ] Agent Builder tool and skill wrappers emit OTLP spans for every invocation,
      with the Argus-specific attributes from the schema.
- [ ] Enricher ingest processor populates `.soc-reasoning-traces-*` with the mapped
      documents; end-to-end lag < 30 s P95.
- [ ] Injection-surface detector fires on at least one trace per Scenario-3 run and
      writes a `.soc-audit-trail` row.
- [ ] Governance dashboard shows an alert-to-reasoning drill-down.
- [ ] Trust scorer consumes `reasoning_trace_quality` as a new input signal (see
      `phase-3/trust-thresholds.md`).

## Data contract (preview)

Full contract in `../scaffolds/m2-5-trace-schema.md`. Minimum Argus-mapped fields:

```json
{
  "@timestamp": "...",
  "trace_id": "otlp-<hex>",
  "span_id": "otlp-<hex>",
  "parent_span_id": "otlp-<hex>|null",
  "argus": {
    "kind": "skill|agent|tool",
    "actor_id": "soc-triage-skill",
    "invocation_id": "<uuid>",
    "decision": { "kind": "triage_verdict|rule_draft|tool_choice", "value": "..." },
    "confidence": 0.0,
    "inputs_digest": [{ "field": "source_event.message", "hash": "..." }],
    "consumed_injection_surface": false,
    "trust_tier_at_decision": "frontier|trusted|probationary|quarantined"
  }
}
```

## Phases

1. **OTLP wrappers** (1 wk): Argus-owned skills/agents/tools emit spans.
2. **Enrichment pipeline** (1 wk): ingest processor maps OTLP → Argus schema.
3. **Injection-surface detector** (0.5 wk): flags traces that touched a simulated
   injection field.
4. **Governance dashboard** (0.5 wk): alert → reasoning drill-down.
5. **Trust-scorer integration** (0.5 wk): new signal surfaced to `.soc-trust-scores`.

Est. total: 3.5 weeks.

## Non-goals

- Observability for *human-operated* Kibana workflows. M2.5 focuses on autonomous
  decision paths.
- Generic LLM prompt logging. We log structured decisions, not raw prompts.
- Retention-policy reform.

## Links

- Data contract scaffold: `../scaffolds/m2-5-trace-schema.md`
- Consumer: Trust-tier design (`../phase-3/trust-thresholds.md`)
- Consumer: Scenario 3 (demo storyboard)
- Adjacent anchor: [`kibana#259559`][k6] default SOC skill + tool surface (baseline
  skills that will be wrapped first).

[k6]: https://github.com/elastic/kibana/pull/259559
