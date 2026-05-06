# AutoDEX demo evidence

End-to-end proofs that AutoDEX is operational on a real Elastic 9.5.0 cluster
with no stubs. Each artifact is a snapshot of live state captured during the
2026-05-06 validation pass.

## Cluster under validation

| Property | Value |
| --- | --- |
| Branch | `autonomous-soc-simulation` |
| Captured | 2026-05-06 (UTC+02:00) |
| Elasticsearch | 9.5.0-SNAPSHOT (Docker, `localhost:19200`) |
| Kibana | 9.5.0 (`yarn start --no-base-path`, `localhost:15601`) |
| AutoDEX score | **95/100 — Autonomous tier** |

## Files

| File | What it proves | How to read it |
| --- | --- | --- |
| `benchmark-20260506T013826Z.json` | Full ARGUS benchmark scorecard (20 dimensions × 5 sections). 95/100, Autonomous tier — the highest tier the benchmark defines. | Each `criteria.<id>` records earned vs max points and a one-line live reason. Total at `total_earned`. |
| `pulse-payload.json` | The raw `/internal/security_solution/argus/governance_pulse` response that powers the Pulse panel. Includes the three vision-doc KPIs (4.1 trigger-to-rule, 4.2 coverage trend, 1.6.8 signal-to-noise) plus MTTD, hours-saved (B12), throughput, drift, tier mix. | All numeric fields are real cluster aggregates over `now-24h`. `null` sections degrade gracefully (no synthetic backfill). |
| `pulse-panel-live-final.png` | Browser screenshot of the rendered Pulse panel showing all KPI tiles populated with real numbers. Captured after fix to `useArgusQuery` removed an infinite render→abort loop (commit message tagged `fix(argus-console): stabilise transform/body in useArgusQuery`). | Look at the badge — "live" means the React hook reached `success`. The three new tiles (Signal-to-noise / Trigger-to-rule / ATT&CK coverage) read 50% / 30% / 100.00% with breakdowns. |
| `coverage-route.json` | Live response from `/internal/security_solution/argus/coverage` — the ATT&CK technique coverage rollup that backs the coverage trend tile. | `total_techniques`, `covered_techniques`, `coverage_pct` plus per-tactic and per-technique drill-down. |
| `coverage-snapshots-history.json` | The `.soc-coverage-snapshots` index sorted by `@timestamp` desc — the trend backing dataset that the Pulse panel correlates oldest vs latest to compute `delta_pp`. | Producer: `soc-argus-coverage-snapshotter` (1h cadence). Confirm two distinct snapshot timestamps to verify the trend signal. |
| `sample-mutation-intents.json` | Three real `.soc-mutation-intents` documents with the `synthesis_lag_ms` field populated. | These are the rows that drive vision-doc 4.1 trigger-to-rule. `synthesis_lag_ms` is computed as `mutation_intent.@timestamp - advisory.ingested_at`. |
| `sample-advisories.json` | Three real `.soc-cve-advisories` documents — the upstream CVE rows that the synthesis driver picked up and turned into mutation intents. | The `ingested_at` field is the lower bound for the `synthesis_lag_ms` calculation. |
| `sample-outcomes.json` | Three real `.soc-outcomes` documents with `verdict: true_positive` and `verdict: false_positive` labels — the rows the signal-to-noise tile aggregates. | Filter aggs in `governance_pulse.ts` count `verdict: true_positive` (TP) and `verdict: false_positive` (FP); 5 each in this snapshot. |
| `workflow-registry.json` | The `.soc-workflow-registry` index — Kibana saved-object IDs resolved from the canonical workflow slugs in `workflows/_registry.json`. Confirms 65 workflows are registered and discoverable. | Each row carries `workflow_id` (slug) → `kibana_workflow_id` (UUID), `automation_level`, `connectors`, `summary`. |
| `reasoning-trace-count.json` | Count of rows in `.soc-reasoning-trace` for the last 30 minutes. >100 means the OTLP reasoning-trace spine is alive and producing audit material. | `count` field. The benchmark dimension D5.1 reads this. |

## Reproducing live

```bash
# Cluster + Kibana up?
docker ps | rg soc-elasticsearch
curl -s -u elastic:changeme http://localhost:15601/api/status -o /dev/null -w '%{http_code}\n'

# Refresh the live pulse payload
curl -sS -u elastic:changeme \
  -H "kbn-xsrf:true" -H "Elastic-Api-Version: 1" \
  http://localhost:15601/internal/security_solution/argus/governance_pulse \
  -o pulse-payload.json

# Refresh the benchmark scorecard
soc-simulation/scripts/run_argus_benchmark.sh --score-only > benchmark-$(date -u +%Y%m%dT%H%M%SZ).json

# Refresh the workflow registry snapshot
curl -sS -u elastic:changeme \
  http://localhost:19200/.soc-workflow-registry/_search?size=200 -o workflow-registry.json
```

## Vision-doc KPI provenance map

Each KPI tile in the Pulse panel maps to one vision-doc requirement plus a
producer + a contract:

| Vision § | Pulse tile | Producer | Source index | Field(s) |
| --- | --- | --- | --- | --- |
| 1.6.8 | Signal-to-noise | analyst labels + `soc-recovery` | `.soc-outcomes` | `verdict ∈ {true_positive, false_positive}` |
| 4.1 | Trigger-to-rule | `soc-argus-synthesis-driver` | `.soc-mutation-intents` | `synthesis_lag_ms`, `@timestamp` |
| 4.2 | ATT&CK coverage trend | `soc-argus-coverage-snapshotter` | `.soc-coverage-snapshots` | `total_techniques`, `covered_techniques`, `coverage_pct` |
| 4.3 | Hours-saved (B12) | `.soc-outcomes` aggregator + tunable minute constants | `.soc-outcomes` | `pipeline_complete`, `rolled_back`, `rollback_source` |
| 4.4 | Detection MTTD | `.soc-outcomes.time_to_detect` aggregator | `.soc-outcomes` | `time_to_detect` |

## Verifying nothing is stubbed

- All numeric fields in `pulse-payload.json` are positive integers or finite
  decimals derived from real ES aggregations (no defaults, no fallback
  placeholders).
- Each `sample-*.json` document carries a real Elasticsearch `_id` and an
  `@timestamp` within the last 24h (cluster wall-clock).
- The benchmark scorecard `reason` strings count actual documents in
  specific indices (e.g. "55 outcomes carry rollback_mttr_ms").
- The Pulse screenshot was taken with the `live` badge — that badge only
  appears when the React `useArgusQuery` hook reaches `status === 'success'`
  on a real network response (not the demo-mode placeholder set).
