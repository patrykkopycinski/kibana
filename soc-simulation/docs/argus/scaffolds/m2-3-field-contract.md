# M2.3 — Exploit-Probability Field Contract

Stable field contract under `vulnerability.argus.*` that every downstream Argus
milestone can rely on. Versioned; breaking changes require a bump + a migration row.

## 1. Fields

```yaml
vulnerability.argus.exploit_probability:          # float, 0.0-1.0 inclusive
vulnerability.argus.exploit_probability_version:  # semver; current: 1.1.0 (R13 — Shadow-AI derivation)
vulnerability.argus.exploit_context.cvss_v3_base:            # float 0-10
vulnerability.argus.exploit_context.cisa_kev:                # boolean
vulnerability.argus.exploit_context.epss_score:              # float 0-1
vulnerability.argus.exploit_context.asset_criticality:       # keyword: low|medium|high|critical
vulnerability.argus.exploit_context.public_exploit_available: # boolean
vulnerability.argus.exploit_context.mythos_signal:           # float 0-1; R13: derived from host.argus.shadow_ai.* (see §2a) unless explicitly pinned
vulnerability.argus.exploit_context.top_contributors:        # keyword[], names of top-k factors
vulnerability.argus.scored_at:                               # date (iso8601)
```

All fields live under `vulnerability.argus.*` to avoid polluting the upstream
`vulnerability` namespace owned by the vuln-checker PR (`kibana#258041`). Argus is a
consumer; it never rewrites non-Argus fields.

## 2. Score formula (v1.1.0)

```
exploit_probability = clamp(
  w_cvss     * normalize_cvss(cvss_v3_base) +
  w_epss     * epss_score +
  w_kev      * (cisa_kev ? 1.0 : 0.0) +
  w_exploit  * (public_exploit_available ? 1.0 : 0.0) +
  w_asset    * asset_weight(asset_criticality) +
  w_mythos   * mythos_signal,
  0.0, 1.0
)

with initial weights:
  w_cvss    = 0.15
  w_epss    = 0.25
  w_kev     = 0.25
  w_exploit = 0.10
  w_asset   = 0.20
  w_mythos  = 0.05   # R13: fed by Shadow-AI telemetry; see §2a

normalize_cvss(x)   = min(1.0, x / 10.0)
asset_weight(level) = { low: 0.2, medium: 0.5, high: 0.8, critical: 1.0 }[level] | 0.5
```

Weights are *capped to sum ≤ 1.0* (they do). Any weight change is a new
`exploit_probability_version` and a calibration run on the historic CVE set.

### 2a. `mythos_signal` derivation (R13, v1.1.0)

When `vulnerability.argus.exploit_context.mythos_signal` is not explicitly set,
it is derived from the Shadow-AI envelope at `host.argus.shadow_ai.*` (or
`threat.argus.shadow_ai.*` as fallback):

```
density    = min(detections_24h, 10) / 10
severity   = { none: 0.0, low: 0.2, medium: 0.4, high: 0.7, critical: 1.0 }[max_severity]
boost      = 0.2 * unauthorized_model_access + 0.3 * sensitive_data_leak
mythos     = clamp(max(density, severity) + boost, 0, 1)
```

`max(density, severity)` (rather than the average) prevents a single high-severity
detection from being diluted by a quiet 24-hour window. An explicit pin in
`vulnerability.argus.exploit_context.mythos_signal` always wins — operators can
use this to stamp an authoritative value during incident response.

## 3. `top_contributors` computation

At scoring time, produce the list of field names ranked by their contribution to the
final score, picking the top two. Populate a `top_contributors` keyword array in
descending order; if a contributor rounds to 0.0, it is excluded.

This is the field the Security Solution alert flyout renders as "Top factors."

## 4. Enrichment pipeline

1. Ingest processor `argus_exploit_probability_enricher` runs on every
   vuln-checker alert emission:
   - Reads `vulnerability.id`, `host.risk.calculated_level`,
     `threat.software.cisa_kev`, `threat.software.epss.score`.
   - Writes the Argus fields above.
   - Skips silently (no exception) if any of the upstream fields are missing — the
     absence of inputs is itself a data-quality event, written to
     `.soc-audit-trail` with `event_type: argus_exploit_probability_missing_inputs`.
2. Retro-fill: a single-shot script `scripts/argus/m2-3-retrofill.ts` reindexes alerts
   older than the processor deployment, using the same processor.

## 5. Compatibility

- Adding new contributor fields is non-breaking; adding new terms to
  `asset_criticality` **is** breaking.
- Removing contributors is breaking.
- Weight rebalancing within ±0.05 per weight is non-breaking (same version),
  provided the total sum stays ≤ 1.0.

## 6. Regression

- 30-day backfill on a staged cluster produces 0 null `exploit_probability` on
  alerts that have all required inputs.
- A/B check: for 1000 historic alerts, the rank correlation between
  `argus.exploit_probability` and the manual SOC prioritization label is ≥ 0.65
  (Spearman).

## 7. Minimum reviewable deliverable

- ECS-style mapping snippet for `.kibana-alerts-security-solution-*` (or the new
  vuln-checker alert index, whichever `#258041` settles on).
- Ingest processor definition JSON.
- Retro-fill script.
- Unit tests covering: all contributors, missing contributors, bounds clamping.
- Rank-correlation regression harness that runs in CI against a committed fixture.
