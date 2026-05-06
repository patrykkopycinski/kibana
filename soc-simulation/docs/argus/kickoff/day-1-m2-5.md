# M2.5 — Day 1 Checklist

**Milestone:** Reasoning-trace governance  
**Spec:** [`../issues/m2-5-reasoning-trace-governance.md`](../issues/m2-5-reasoning-trace-governance.md) · [`../scaffolds/m2-5-trace-schema.md`](../scaffolds/m2-5-trace-schema.md)  
**Pair owner:** Governance (Pair C) — starts Day 0, fully parallel.  
**Target Day-1 outcome:** OTLP trace exporter shim is in place, one agent emits a single reasoning span to `.soc-reasoning-traces-<date>`.

## Before you touch code

- [ ] Read the trace schema in the scaffold and the attribute contract.
- [ ] Identify the one ARGUS skill you'll instrument first — recommended:
      `soc-mutation-planning` / deteng-aligned path (smallest reasoning graph, easiest to verify).
- [ ] Confirm the staged Elasticsearch supports OTLP ingest — if not, ingest via
      Elastic Agent's OTLP receiver into the ES output.

## Files to create

```
x-pack/solutions/security/plugins/security_solution/server/lib/argus/
  reasoning_traces/
    otlp_exporter.ts                  # thin wrapper around @opentelemetry/sdk-trace
    trace_attributes.ts               # constants matching scaffold §3
    trace_attributes.test.ts
    index.ts
soc-simulation/docs/argus/
  reasoning-trace-onboarding.md       # how to instrument a new agent (stub on day 1)
```

Touch (minimally):

- `soc-simulation/skills/soc-mutation-planning.json` (or the first skill you instrument) — add an `argus.tracing: { enabled: true, exporter: 'otlp' }` metadata block. Do **not** change the skill's behaviour; just declare intent.

## First-commit skeleton (copy-paste)

`trace_attributes.ts`:

```ts
export const ARGUS_TRACE_ATTR = {
  agentId: 'argus.agent.id',
  agentVersion: 'argus.agent.version',
  decisionId: 'argus.decision.id',
  decisionKind: 'argus.decision.kind',
  confidence: 'argus.decision.confidence',
  confidenceDelta: 'argus.decision.confidence_delta',
  trustTier: 'argus.actor.trust_tier',
  injectionSurface: 'argus.injection.surface',
  toolId: 'argus.tool.id',
  toolInputHash: 'argus.tool.input_hash',
  correlatedAlertId: 'argus.correlation.alert_id',
} as const;

export type ARGUSTraceAttr = keyof typeof ARGUS_TRACE_ATTR;
```

`otlp_exporter.ts`:

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export function buildARGUSTraceSdk(endpoint: string): NodeSDK {
  return new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    serviceName: 'argus-security-solution',
  });
}
```

## Validate before pushing

```bash
node scripts/eslint --fix $(git diff --name-only HEAD)
node_modules/typescript/bin/tsc -b x-pack/solutions/security/plugins/security_solution/tsconfig.type_check.json --pretty
node scripts/jest x-pack/solutions/security/plugins/security_solution/server/lib/argus/reasoning_traces/
```

## Smoke test

```bash
# In the staged cluster, after one deteng-agent invocation:
curl -s "$ES_URL/.soc-reasoning-traces-*/_search?size=1" | jq '.hits.hits[0]._source'
```

Expected: at least one span document, with `argus.agent.id = "soc_deteng-agent"`
and a non-empty `argus.decision.id`.

## You are not stuck if…

- OTLP HTTP isn't available on your ES cluster — fall back to the Elastic APM
  Server's OTLP endpoint; either way the data lands in
  `traces-apm-*` and a pipeline reroutes to `.soc-reasoning-traces-<date>`.
- The agent config doesn't support custom metadata — declare the intent in a
  sidecar file (`argus/tracing/<agent-id>.json`) and pick it up at register time.
- You can't correlate back to an alert yet — that's the goal of the second
  commit; Day 1 only needs a single span.

## Day-2 next steps

1. Wire correlation: every alert-triage decision span carries
   `argus.correlation.alert_id`.
2. Instrument the remaining agents listed in the issue body's scope.
3. Add the retention policy (`.soc-reasoning-traces-*` ILM).
4. Add the governance dashboard panel that surfaces spans with
   `argus.injection.surface != 'none'`.
