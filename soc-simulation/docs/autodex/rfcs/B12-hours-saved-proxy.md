# RFC B12 — "Hours of analyst time saved" proxy metric

> **Status:** Implemented (2026-05-05).
> **Owner:** AutoDEX productionisation track.
> **Closes:** vision-doc success metric **4.3** ("Hours of analyst time saved").
> **Tracked by:** B12 in [`conformance-matrix.md`](../conformance-matrix.md) §7.

---

## 1. Why this metric needs a proxy

The vision doc names "Hours of analyst time saved" as one of four success
metrics. Unlike MTTD (4.4 — directly observable from `.soc-outcomes.time_to_detect`),
ATT&CK coverage (4.2 — directly observable from `.soc-coverage-gaps`), and
trigger-to-rule latency (4.1 — directly observable from advisory-applied
deltas), "hours saved" has **no direct observable** — there is no analyst
clock that AutoDEX can read.

Two ways to fix that:

1. **Instrument the analysts** (track hours per task in JIRA/Tempo/etc., diff
   against AutoDEX-on-vs-off windows). High-fidelity, slow, requires
   organisational buy-in.
2. **Compute a proxy** from work that AutoDEX measurably did, with
   calibratable per-action minute constants. Lower fidelity, ships today,
   provides a directional signal that improves with calibration.

This RFC takes path (2). The metric is **deliberately a proxy** and the doc
makes that explicit so leadership reads it as "estimated hours saved given
these assumptions" rather than "hours saved" full stop.

## 2. The model

```
hours_saved(window) =
  (rules_authored × MIN_PER_AUTHORING / 60) +
  (auto_triaged_outcomes × MIN_PER_TRIAGE / 60) +
  (auto_recovered_rollbacks × MIN_PER_ROLLBACK_RECOVERY / 60) -
  (human_rollbacks × MIN_PER_HUMAN_ROLLBACK / 60)
```

Each term is observable; the constants are operator-tunable.

### Source counts

| Term | Source | Definition |
|---|---|---|
| `rules_authored` | `.soc-outcomes.outcomes_total - rolled_back_count` *intersected with* mutation-intents whose `argus.origin ∈ {exploit_to_detection, coverage_gap}` and `applied_at` falls in the window | Each AutoDEX-authored rule that reached production and stayed there represents a rule the analyst did not have to write themselves. |
| `auto_triaged_outcomes` | `.soc-outcomes` rows with `pipeline_complete=true` and `disposition ∈ {auto_resolved, auto_escalated}` | Each outcome the autonomous pipeline closed without analyst intervention represents a triage cycle the analyst skipped. |
| `auto_recovered_rollbacks` | `.soc-outcomes` rows with `rolled_back=true`, `rollback_source='auto'`, and `rollback_mttr_ms < AUTO_ROLLBACK_THRESHOLD_MS` | Rollbacks AutoDEX handled itself — no analyst paged. |
| `human_rollbacks` | `.soc-outcomes` rows with `rolled_back=true` and `rollback_source ≠ 'auto'` | Rollbacks that required human triage — these *cost* analyst time, so they are subtracted. |

### Default minute constants

| Constant | Default | Why |
|---|---:|---|
| `MIN_PER_AUTHORING` | 90 min | Mid-range estimate of analyst time to author + validate + deploy a single new detection rule. Conservative — real measurements range 30 min (simple) to 4 h (complex). |
| `MIN_PER_TRIAGE` | 5 min | Median time to triage one alert, per published SOC benchmarks (Gartner 2024, Tines 2025). |
| `MIN_PER_ROLLBACK_RECOVERY` | 15 min | Time to investigate why a rule misfired, formulate a rollback plan, and execute. |
| `MIN_PER_HUMAN_ROLLBACK` | 30 min | Same as recovery + paging overhead + post-mortem write-up. Operator-supervised rollbacks consistently take longer than auto-recoveries. |

These are **defaults**, not laws. Every tenant SHOULD override them after one
quarter of operation, using their own task-tracking data. The Pulse route
accepts override constants via query parameters so a tenant-specific override
file (or the operator UI) can re-cast the metric without a code change.

### What the proxy is NOT

- **Not an SLA**. Leadership reads it as a directional signal, not a
  contractual hours-saved figure.
- **Not double-counted**. The terms are disjoint — a rule that AutoDEX
  authored and that auto-resolved 100 alerts contributes to *both*
  `rules_authored` (the authoring saving) AND `auto_triaged_outcomes` (per-
  alert triage saving). That's correct: the analyst saved both the authoring
  cycle and every triage cycle the rule subsumed.
- **Not negative-floored**. If `human_rollbacks` outweighs the other terms,
  the proxy can go negative. That is intentional — the metric must reflect
  real lost time, including the case where a misbehaving autonomous loop
  *costs* the SOC time. Zero-flooring would mask exactly the failure mode
  AutoDEX governance exists to prevent. The Pulse tile renders negative
  values in `danger` tone.

## 3. Surface

### 3.1 Type contract

`GovernancePulseHoursSaved` lives in `kbn-argus-console-common/src/types/governance_pulse.ts`:

```ts
interface GovernancePulseHoursSaved {
  readonly total_hours: number;
  readonly breakdown: {
    readonly authoring_hours: number;
    readonly triage_hours: number;
    readonly recovery_hours: number;
    readonly human_rollback_hours: number; // negative contribution
  };
  readonly source_counts: {
    readonly rules_authored: number;
    readonly auto_triaged_outcomes: number;
    readonly auto_recovered_rollbacks: number;
    readonly human_rollbacks: number;
  };
  readonly applied_constants: HoursSavedConstants;
}
```

`null` only when **no** input counts are populated for the window (cold start
or no `.soc-outcomes` activity). When at least one source count is non-zero
the section populates and the breakdown surfaces every contribution — even
those with zero hours, so the UI can show "0 h triaged" instead of hiding
the row.

### 3.2 Builder

`buildHoursSaved` is a pure function in
`kbn-argus-console-common/src/builders/governance_pulse_builder.ts`. It takes:

- The `.soc-outcomes` aggregation block (extended with the new filter aggs).
- Optional `HoursSavedConstants` overrides; falls back to
  `DEFAULT_HOURS_SAVED_CONSTANTS` defined alongside.

It returns the typed payload above or `null` when every source count is zero.

### 3.3 Route

`GET /internal/security_solution/argus/pulse` adds four filter aggregations
to the existing outcomes search:

```ts
aggs: {
  rules_authored: { filter: { /* applied_at in window, not rolled_back, origin ∈ Path A */ } },
  auto_triaged_outcomes: { filter: { /* pipeline_complete=true, disposition matches */ } },
  auto_recovered_rollbacks: { filter: { /* rolled_back=true, rollback_source='auto' */ } },
  human_rollbacks: { filter: { /* rolled_back=true, rollback_source != 'auto' */ } },
}
```

Aggregations stay scoped to the same `@timestamp` window the rest of the
route uses — no cross-window contamination.

### 3.4 UI

The ARGUS Pulse panel renders a new tile row right under "Detection
responsiveness" (B11):

> **Estimated analyst hours saved**
> *proxy from `.soc-outcomes` × tunable minute constants*
>
> | total | authoring | triage | auto-recovery | human rollback |
> |---|---|---|---|---|
> | 12.5 h | 6 h | 5.5 h | 1 h | -0 h |

The total is the headline; the breakdown is the description. Tone is
`success` when total ≥ 4 h, `warning` when 0–4 h, `danger` when negative,
`subdued` when section is `null`.

## 4. Calibration plan (post-ship)

1. **Quarter 1 (default constants).** Ship the four defaults above; capture
   one quarter of windowed data.
2. **Quarter 2 (organisational override).** Each tenant runs a one-off
   measurement on a sample of analyst tickets (~200) across the four
   categories, computes their actual per-action median, and overrides via
   the route's `?constants=` query param (or a future operator-UI knob).
3. **Quarter 3+ (audit cycle).** Re-measure once a year, or after a major
   workflow change (new tooling, new ticketing system, headcount change).

The defaults remain shipped values for tenants that haven't calibrated yet
— a directional signal is better than no signal.

## 5. Trust boundary

The proxy is computed at `GET` time from data the tenant already has —
no PII leaves the cluster, no external calls. The `applied_constants` field
on the returned payload makes the assumption set fully visible to consumers
so dashboards / leadership reports can footnote the math.

When the operator overrides constants, the override travels through the
route's query params and is included verbatim in the response — making the
audit trail one-stop ("show me the constants used to produce this number").

## 6. Out of scope for v1

- **Per-actor breakdown** ("how many hours did the trusted-tier agents
  save vs probationary"). The Pulse tile collapses across actors. A future
  Trust Console panel could pivot the same data per-actor; that work is
  tracked separately.
- **Time-series trend** ("hours saved per week, last 12 weeks"). The tile
  is a single windowed snapshot; trend lines belong in the dashboards that
  consume the route, not in this builder.
- **Cost translation** ("$X saved at $Y/hour"). Leadership reports often
  want this — it's a one-line client-side multiplier and intentionally
  kept out of the AutoDEX surface to avoid embedding a salary assumption
  in the platform.

## 7. References

- vision-doc 4.3 — security-team#16978
- conformance-matrix §4 (success-metric measurability)
- B11 RFC pattern (this RFC mirrors the surface shape of B11 to keep the
  Pulse panel internally consistent)
- Gartner SOC analyst time studies (2024 — public summary)
- Tines 2025 SOC survey (public summary)
