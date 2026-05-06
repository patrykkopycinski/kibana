# `.soc-intel-feed`

> **Owner:** `argus-governance` ·
> **Schema version:** 1 ·
> **Index template:**
> [`soc-simulation/setup/index_templates/soc-intel-feed.json`](../../../setup/index_templates/soc-intel-feed.json)

The abstract intel-feed contract. Every CTI / threat-intel adapter
(KEV, Mythos, generic STIX/TAXII, Glasswing, **and as of B10 the
reverse-intel adapter**) writes the same envelope shape so downstream
consumers can score signal-strength uniformly.

This index has multiple producers and one canonical envelope. Adapters
differ in their `adapter` / `feed_id` keyword, the `kind` taxonomy
they use, and any kind-specific extras attached via Elasticsearch
field passthrough. **All producers must keep the canonical envelope
fields populated** — any adapter that skips e.g. `signal_strength`
breaks the Mythos aggregator.

## Field reference (canonical envelope)

| Field | Type | Notes |
|---|---|---|
| `@timestamp` | `date` | When the row was indexed. |
| `intel_id` | `keyword` | Doc id and dedup key. Must be stable per logical signal so re-emission upserts cleanly (e.g. `kev-CVE-2024-30100`, `incident-rev-T1059.001-2026-05-04T11:11:11Z`). |
| `feed_id` | `keyword` | Logical feed identifier. Examples: `argus-demo-feed` (generic), `mythos.aggregator` (Mythos), `soc.incident.observed` (B10 reverse-intel). |
| `adapter` | `keyword` | Adapter that produced the row. Examples: `argus_intel_adapter_generic`, `argus_intel_mythos_aggregator`, `soc_incident_reverse_intel`. |
| `kind` | `keyword` | Signal taxonomy. See [§2](#2-signal-taxonomy-kind) below. |
| `reference.cve` | `keyword` | Optional CVE ID. Set when the signal is CVE-bound. |
| `reference.technique_ids` | `keyword[]` | ATT&CK technique IDs the signal applies to. |
| `reference.actor_ids` | `keyword[]` | Threat-actor cluster IDs. |
| `signal_strength` | `float` | `[0, 1]`. Adapter's confidence that this signal is relevant. |
| `half_life_days` | `integer` | Exponential decay half-life for the Mythos aggregator. |
| `source_trust` | `float` | `[0, 1]`. Per-feed trust weight set at adapter config. |
| `observed_at` | `date` | When the underlying event happened (vs `@timestamp`, when this row landed). |
| `summary` | `text` | Human-readable one-liner. Surfaces in the ARGUS Console intel-feed panel. |
| `raw` | `object`, `enabled: false` | Opaque forensics passthrough. Never consumed by scoring. |

## 2. Signal taxonomy (`kind`)

Adapters tag rows with one of these keys. Consumers branch on `kind` to apply kind-specific weighting.

| `kind` | Meaning | Producers |
|---|---|---|
| `actor_capability` | An actor demonstrated a capability (in-the-wild exploitation chain, etc.). | generic adapter, Glasswing |
| `exploit_availability` | A weaponised exploit / PoC is observable. | generic adapter, KEV adapter |
| `campaign` | Coordinated activity across multiple targets. | generic adapter, Glasswing |
| `mythos_signal` | Aggregated Mythos-class signal. | Mythos aggregator |
| **`ttp_observed`** | **B10** — the org's own confirmed incidents observed this technique. The strongest possible evidence the technique is in scope for *this environment*. | `soc_incident_reverse_intel` |

## 3. The B10 `ttp_observed` extension (evidence block)

Reverse-intel rows carry an additional `evidence.*` audit-trail block
on top of the canonical envelope. Other adapters do not populate
`evidence`.

| Field | Type | Notes |
|---|---|---|
| `evidence.observation_count` | `integer` | TP + FP combined. |
| `evidence.true_positive_count` | `integer` | Confirmed observations. |
| `evidence.false_positive_count` | `integer` | Confirmed false alarms (recorded for context; do not subtract from `signal_strength` on first pass — see [`rfcs/B10-incident-reverse-intel.md`](../rfcs/B10-incident-reverse-intel.md) §4). |
| `evidence.window.from` / `evidence.window.to` | `date` | Rolling window the row aggregates over. |
| `evidence.distinct_actors` | `keyword[]` | Threat actors observed using this technique in the window. |
| `evidence.distinct_campaigns` | `keyword[]` | Campaign identifiers. |
| `evidence.distinct_rule_ids` | `keyword[]` | Detection rule IDs that fired the underlying outcomes — useful for downstream calibration ("which existing rules already cover this?"). |
| `evidence.distinct_incident_ids` | `keyword[]` | `case_id`s the row aggregates. The chain of custody back to the original closing case. |
| `schema_version` | `integer` | Currently `1`. |

## 4. Producers

| Adapter | Workflow | Doc |
|---|---|---|
| Generic / STIX-TAXII | [`soc_argus_intel_adapter_generic.yaml`](../../../workflows/soc_argus_intel_adapter_generic.yaml) | (this file) |
| Analytics adapter | [`soc_argus_intel_adapter_analytics.yaml`](../../../workflows/soc_argus_intel_adapter_analytics.yaml) | (this file) |
| Mythos aggregator | [`soc_argus_intel_mythos_aggregator.yaml`](../../../workflows/soc_argus_intel_mythos_aggregator.yaml) | (this file) |
| **Incident reverse-intel (B10)** | [`soc_incident_reverse_intel.yaml`](../../../workflows/soc_incident_reverse_intel.yaml) | [`rfcs/B10-incident-reverse-intel.md`](../rfcs/B10-incident-reverse-intel.md) |
| **CISA KEV adapter (B2)** | [`soc_argus_intel_adapter_kev.yaml`](../../../workflows/soc_argus_intel_adapter_kev.yaml) | [`rfcs/B2-production-cti.md`](../rfcs/B2-production-cti.md) |

## 5. Consumers

- **Mythos aggregator** — reads all rows with `signal_strength > 0`,
  applies `half_life_days`-weighted exponential decay, sums into the
  per-CVE / per-actor `mythos_signal` score.
- **ARGUS Console intel-feed panel** — queries by `feed_id` and
  freshness; renders `summary` for each row.
- **`@kbn/argus-exploit-probability`** — reads aggregated Mythos
  signal as one of its scoring inputs.

## 6. Drift / migration history

| Date | Change | Owner |
|---|---|---|
| Phase 3 | Initial schema. | argus-governance |
| 2026-05-05 | B10 — added `kind: ttp_observed` and per-emission `evidence.*` block. Backwards compatible — existing rows have no `evidence` field. | argus-governance |

## 7. How to query

```bash
# All rows from the reverse-intel adapter
GET .soc-intel-feed/_search
{ "query": { "term": { "adapter": "soc_incident_reverse_intel" } } }

# Strongest reverse-intel signals in the last 24h
GET .soc-intel-feed/_search
{
  "query": {
    "bool": {
      "must": [
        { "term": { "adapter": "soc_incident_reverse_intel" } },
        { "range": { "@timestamp": { "gte": "now-24h" } } }
      ]
    }
  },
  "sort": [{ "signal_strength": "desc" }]
}

# Reverse-intel signals that already fired existing rules — calibration
GET .soc-intel-feed/_search
{
  "query": {
    "bool": {
      "must": [
        { "term": { "adapter": "soc_incident_reverse_intel" } },
        { "exists": { "field": "evidence.distinct_rule_ids" } }
      ]
    }
  }
}
```
