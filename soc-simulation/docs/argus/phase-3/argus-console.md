# Phase 3 Design — ARGUS Console

Status: **Draft**

## Problem

The five ARGUS layers produce rich, cross-referenced telemetry, but today it's
spread across: a Workflows UI, raw data views on `.soc-*` indices, Discover, the
Security Solution alert flyout, the APM trace UI, and a handful of dashboards.
Demo operators and real SOC users both need a single landing surface that answers
two questions fast:

1. **"Is ARGUS working right now?"** — live signals across the five layers.
2. **"Why did ARGUS do X?"** — drill-down from any alert / mutation / action to
   the reasoning chain and the governance state at the time.

## Decision

Build `argus-console`, a new Security Solution app route
(`/app/security/argus`) composed of four panels. It is a thin presentation layer
over existing indices; no new data pipelines.

### Panel 1 — Pulse (live health)

Top-of-page summary. Real-time Lens visualisations powered by shared filters:

- **Pressure absorbers**: per-pressure (P1–P4) a sparkline of the primary metric
  (MTTD for P1, variant coverage for P2, prompt-injection detection rate for P3,
  shadow-AI asset coverage for P4).
- **Tier mix**: count of actors in each trust tier, live.
- **Mutation throughput**: count of mutations applied / rolled back / blocked
  per 24h rolling window.
- **Drift signals open**: count of unresolved drift-detected mutation_intents.

### Panel 2 — Activity feed

Chronological stream of ARGUS events across all five layers. Filterable by
layer, by pressure, by actor, by trust tier. Each row links to:

- The underlying `.soc-*` document (via Discover deep-link).
- The associated reasoning trace (if M2.5 is live).
- The originating alert or incident in Security Solution.

### Panel 3 — Mutation Lineage

Given a rule id or an alert id, render a graph of its lifecycle:

```
source → exploit-probability → synthesis → eval → backtest → apply → observe → outcome
                                                                 ↘ rollback ↙
                                                     ↘ drift-detected → eval (re-score) → …
```

Each node is clickable; clicking opens the underlying ARGUS document.

### Panel 4 — Reasoning drill-down

From any alert, a "Show ARGUS reasoning" button opens a side panel with:

- The reasoning-trace chain (M2.5) that produced the triage verdict.
- Per-step confidence and confidence-delta.
- Any injection-surface flags raised during the chain.
- The trust tier of each actor at the moment of decision.

## Implementation shape

- Route: `/app/security/argus` (existing Security Solution app).
- Stack: `@kbn/security-solution-plugin` React surface, reusing the existing
  Security Solution data view + time-range context.
- Data access: client-side ES|QL queries against `.soc-*` indices + internal
  Kibana routes for reasoning-trace lookup. No new server-side APIs beyond what
  M2.5 already ships.
- Authorization: `requiredPrivileges: [{ allRequired: ['security_solution:read', 'argus:read'] }]`.
  `argus:read` is a new privilege under the Security Solution feature.

## Agent-native parity

An Agent Builder skill `security.argus.explain_decision` shadows Panel 4: given
an alert id, returns the same reasoning chain + annotations as JSON. Every UI
affordance in the console is reachable via the agent surface — maintains the
agent-native parity rule.

## Dependencies

- M2.1, M2.3, M2.5 data contracts are live.
- Phase 3 drift-detection and playbook-learning-loop workflows are running (so
  the Pulse numbers aren't zero).

## Non-goals

- Replacing any existing Security Solution view.
- Editing mutations from the console (read-only; approval flows still go through
  recommendation-applier).
- Custom visualisation framework — all charts are Lens.

## Open questions

1. **Pulse refresh interval** — Lens auto-refresh at 30s may be too chatty for
   large clusters. Proposed: default 60s, user-configurable.
2. **Alert → console deep-link** — do we embed in the existing Alert flyout or
   ship a separate flyout? Proposed: "Show ARGUS reasoning" button in the flyout,
   opens the drill-down inline without leaving the alert.
3. **Demo mode** — for the storyboard demo, we want a scripted subset of the
   console. Proposed: a saved "ARGUS demo" view that bookmarks the three
   scenario contexts.
