# @kbn/argus-reasoning-traces

Argus **M2.5 — Reasoning-trace governance** day-1 package.

Exports two dependency-free building blocks:

1. `ARGUS_TRACE_ATTR` + typed `ArgusSpanAttributes` — the attribute contract
   every Argus agent MUST set on its OpenTelemetry spans so the governance
   layer can correlate reasoning, decisions, tool calls, and the actor whose
   input triggered them. Attribute names come from the scaffold at
   `soc-simulation/docs/argus/scaffolds/m2-5-trace-schema.md`.
2. `describeArgusOtlpExporter` — validates and normalises an OTLP exporter
   configuration (endpoint, service name, resource attributes). The actual
   `@opentelemetry/*` SDK instantiation lives in the consumer so this package
   stays dep-free and Argus can be toggled per-deployment without pinning an
   SDK version at the package level.

## Usage (consumer-side, Phase 2)

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  ARGUS_TRACE_ATTR,
  describeArgusOtlpExporter,
} from '@kbn/argus-reasoning-traces';

const descriptor = describeArgusOtlpExporter({
  endpoint: process.env.ARGUS_OTLP_ENDPOINT!,
  serviceName: 'argus-deteng-agent',
});

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: descriptor.endpoint }),
  // attach descriptor.resourceAttributes via a Resource here
});

// later, inside an agent tool call:
span.setAttributes({
  [ARGUS_TRACE_ATTR.agentId]: 'soc-deteng-agent',
  [ARGUS_TRACE_ATTR.decisionKind]: 'rule_create',
  [ARGUS_TRACE_ATTR.confidence]: 0.82,
  [ARGUS_TRACE_ATTR.trustTier]: 'scoped',
});
```

## Scope

- Day-1 skeleton only: the attribute contract + an exporter config
  normaliser, with tests.
- No OTLP SDK coupling. Higher layers bring their own `@opentelemetry/*`
  SDK and wire `describeArgusOtlpExporter` into their existing tracer
  provider.
- No agent behaviour change. Instrumenting individual agents (adding spans
  inside the deteng/triage agents' tool call loops) is Phase 2 of
  [m2-5-reasoning-trace-governance](../../../../../../soc-simulation/docs/argus/issues/m2-5-reasoning-trace-governance.md).

## Related

- `soc-simulation/docs/argus/scaffolds/m2-5-trace-schema.md` — the ES-side
  schema the OTLP spans are projected into via a collector pipeline.
- `soc-simulation/schemas/reasoning_trace.schema.json` — the existing
  AutoSOC reasoning step schema; M2.5 spans land in the same index family
  under `.soc-reasoning-traces-<date>`.
