# Phase 3 Design — Glasswing-Compatible Intel Ingestion

Status: **Draft**

## Problem
i
Mythos-era exploit-probability scoring (M2.3) reserves a `mythos_signal`
contributor (weight 0.05) that currently returns `0.0` because Argus has no
Mythos-era intel feed. Anthropic's Project Glasswing distrbutes signal about
frontier-capability threat actors via a structured feed; we want to consume it as
one intel source among several, without coupling Argus to a single vendor.

## Decision

Introduce an **abstract intel-feed contract** (`.soc-intel-feed`) and two
adapters:

1. `argus_intel_adapter_glasswing` — Glasswing-shaped ingest, when and if the
   feed format is public / partner-accessible.
2. `argus_intel_adapter_generic` — thin adapter for STIX/TAXII 2.1 and JSON-Lines
   feeds.

Both adapters normalise to the same intel-event shape below. The M2.3 enricher
reads `.soc-intel-feed` aggregated over the last 7 days for the CVE in question
and maps the resulting score into `vulnerability.argus.exploit_context.mythos_signal`.

## Intel-event shape (`.soc-intel-feed`)

```json
{
  "@timestamp": "...",
  "feed_id": "glasswing|vendor-x|internal",
  "kind": "actor_capability|exploit_availability|campaign",
  "reference": {
    "cve": "CVE-2025-XXXX",
    "technique_ids": ["T1003.001"],
    "actor_ids": ["apt-mythos-aligned-01"]
  },
  "signal_strength": 0.82,
  "half_life_days": 14,
  "source_trust": 0.9,
  "raw": { "...": "..." }
}
```

Field contract:

- `signal_strength`: the adapter's best estimate of how relevant the intel is to a
  Mythos-class exploitation probability, `[0, 1]`.
- `half_life_days`: decay parameter; the M2.3 enricher applies an exponential
  decay `effective_signal = signal_strength * 2^(-days_since / half_life_days)`.
- `source_trust`: per-feed trust weight, set at adapter config time, not by the
  feed itself. Glasswing starts at 0.9, generic STIX/TAXII starts at 0.5.
- `raw`: opaque passthrough for forensics; never consumed by downstream logic.

## Mapping into M2.3

The enricher computes, for a given CVE at scoring time:

```
mythos_signal = min(
  1.0,
  sum(
    effective_signal * source_trust
    for every .soc-intel-feed row with reference.cve == this_cve
    or any technique in this_cve's mapped techniques
    in the last 14 days
  )
)
```

`mythos_signal` is bounded at 1.0. The M2.3 formula already caps the weight
(`w_mythos = 0.05`), so even a maximum signal never dominates the final
`exploit_probability`.

## Privacy / scope

- `.soc-intel-feed` is a **downstream consumer**, never a producer, of any
  customer telemetry. Only Argus-owned workflows and the M2.3 enricher read it.
- Adapters never store authentication tokens in the index — only in Kibana
  saved-object credentials.
- Raw feed payloads are preserved in `raw` for at most 30 days (ILM policy).

## Dependencies

- M2.3 field contract must ship first so the consumer exists.
- Glasswing access, if not publicly available, routes through legal.

## Non-goals

- Making Argus a STIX/TAXII server. We consume, never produce.
- Normalising conflicting intel. If two feeds disagree on a CVE's `signal_strength`,
  both rows persist; the enricher sums effective signals with their per-feed trust
  weight and lets the sum adjudicate.

## Open questions

1. **Half-life default** — 14d is a guess. Needs calibration against historic CVE
   campaigns where the operational window can range from 3d to 60d.
2. **Feed trust recalibration** — if `argus_intel_adapter_*` starts producing
   signals that don't correlate with observed exploitation, should `source_trust`
   auto-adjust? Proposed: no — manual, reviewed quarterly.
3. **Glasswing-specific gating** — does Glasswing carry any flags that would ban
   re-derivation for automated decision-making? If so, adapter must honour them
   and downgrade to "display-only" intel.
