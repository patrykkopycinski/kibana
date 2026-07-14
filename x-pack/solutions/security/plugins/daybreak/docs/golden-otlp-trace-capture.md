# Golden OTLP trace capture (Daybreak full MVP)

**Purpose:** Produce PR-grade OTLP evidence for AD integration + forensic worker paths on the daybreak-spike stack (`:5631` → ES `:15000` → EDOT `:4318`).

## Prerequisites

| Component | Endpoint |
|---|---|
| Kibana (daybreak-spike) | `http://localhost:5631` |
| Trace ES (`TRACING_ES_URL`) | `http://elastic:changeme@localhost:15000` |
| OTLP HTTP collector | `http://localhost:4318/v1/traces` (`kibana-edot-collector` docker) |
| Trace data stream | `traces-agent_builder.otel-default` |

`config/kibana.dev.eis.yml` must include:
- `telemetry.tracing.enabled: true` + OTLP exporter to `:4318`
- `agentBuilder:experimentalFeatures: true` (**required** — tracing is gated on this *and* `agentBuilder:tracing:enabled`)
- Agent Builder tracing uiSettings (weekly-evals parity)
- `elasticsearch.serviceAccountToken` only (do **not** set `elasticsearch.username: elastic`)
- EDOT collector ES endpoint `http://host.docker.internal:15000` (not `:9200`)

**Stop `weekly-evals-matrix` Kibana on `:15001` before capture** when both stacks share ES `:15000` — otherwise converse spans may attribute to the wrong process.

**Restart Kibana after config changes.**

## Capture

```bash
cd ~/Projects/kibana.worktrees/daybreak-spike

TRACING_ES_URL=http://elastic:changeme@localhost:15000 \
KIBANA_URL=http://localhost:5631 \
node x-pack/solutions/security/plugins/daybreak/scripts/capture_golden_otlp_traces.mjs
```

## What it exercises

1. **AD path** — `POST /api/daybreak/proposals/from-attack-discovery` (adapter) + Agent Builder converse with AD-shaped input (OTLP spans).
2. **Forensic path** — `POST /api/daybreak/investigations/{id}/run-forensic` (managed worker) + stub `/forensic` route.

## Artifact

`data/daybreak-golden-otlp-traces.json` — preflight checks, path results, `traceIds`, span summaries. Gate passes when `spanCount >= 1` and at least one LLM span after the watermark.

## Scope notes

- AD adapter alone is deterministic (no OTLP); converse provides the agentic OTLP evidence for the AD integration slice.
- Forensic stub mode records workflow execution; live skill OTLP requires `DAYBREAK_STUB_ENDPOINT_ACTIONS=0` + Fleet.
- Golden **cloud** cluster (`kbn-evals-serverless-ed035a`) is a separate target — re-point `TRACING_ES_URL` for weekly-matrix parity.
