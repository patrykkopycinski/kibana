# SOC Command Center — dashboard source

`soc-command-center.ndjson` is the generated artifact imported by `setup.sh`
(step 7, `deploy_saved_objects "Dashboards"`).

**Do not hand-edit the NDJSON.** It is a single minified line. Change the
dashboard by editing `build.mjs` and regenerating:

```bash
node soc-simulation/setup/dashboards/build.mjs
```

## Layout

The dashboard is organised top-to-bottom by operational urgency. Each row has
a clear job:

| Row | Purpose | Indices used |
|----|----|----|
| 0 | Context banner (what this dashboard is, what autonomy state means) | — (markdown) |
| 1 | **At-a-glance tiles** — autonomy, heartbeat, difficulty, pending recs, mutations applied/blocked today | `.soc-kill-switch`, `.soc-metrics`, `.soc-difficulty-state`, `.soc-recommendations`, `.soc-evolution-log` |
| 2 | **Alert → Case flow** — triage volume over time, classification mix, disposition mix | `.soc-triage-results`, `.soc-outcomes` |
| 3 | **Detection quality** — time-to-detect p50/p95, triage accuracy, coverage gaps | `.soc-detection-metrics`, `.soc-coverage-gaps` |
| 4 | **Autonomous self-governance** — mutation attempts stacked by result; rejection-reason mix | `.soc-evolution-log` |
| 5 | **Governance detail** — daily-budget utilisation, loop-threshold hot spots, mutations by artifact type | `.soc-evolution-log` |
| 6 | **Recent applier activity** — tamper-evident audit trail, newest first | `.soc-evolution-log` |
| 7 | **Recommendations backlog** — pending proposals waiting for review or next applier run | `.soc-recommendations` |
| 8 | **System health** — agent status/latency/error rate; connector status/failures | `.soc-agent-health`, `.soc-connector-health` |
| 9 | **Attack simulation** — Caldera operations by status, difficulty spread, recent operations | `.soc-attack-commands` |
| 10 | **Learning & evolution** — last regression gate, regression delta, trust-score table | `.soc-regression-runs`, `.soc-trust-scores` |
| 11 | **Infra plumbing** — dead letters, audit events, pipeline cycle p95 | `.soc-dead-letter`, `.soc-audit-trail`, `.soc-metrics` |

Auto-refresh: 15 s. Default time window: `now-24h → now`.

## Adding or editing a panel

`build.mjs` exposes five factories:

- `metricPanel(...)` — big number with optional subtitle/colour.
- `tablePanel(...)` — Lens datatable with configurable columns.
- `donutPanel(...)` — donut/pie broken down by a keyword field.
- `barPanel(...)` — vertical/horizontal/stacked bar chart.
- `linePanel(...)` — time-bucketed line chart.
- `markdownPanel(...)` — static markdown banner.

Each factory takes a `grid` of `{ x, y, w, h }` on the 48-column Kibana grid.
A running `y` counter is maintained at the bottom of the file so panels stack
predictably — bump it after each row.

ES|QL queries are passed as plain strings. Every ES|QL panel automatically gets
its own ad-hoc data view keyed off the index name, so adding a new index just
means writing `FROM .soc-my-new-index | ...` — no data-view wiring required.

## Why Node and not Python?

The runtime SOC is Elastic-native by design — no Python in the side-effect
path. `build.mjs` is a **build-time** tool that only produces the NDJSON
committed alongside it; it is never invoked by setup.sh, workflows, or agents.
Node is chosen because it is the native language of the Kibana ecosystem and
has no external dependencies for JSON generation.
