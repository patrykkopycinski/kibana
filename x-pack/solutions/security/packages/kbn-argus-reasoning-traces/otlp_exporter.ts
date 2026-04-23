/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * ARGUS M2.5 — OTLP exporter shim.
 *
 * Day-1 intent: expose a thin, dependency-free factory that higher layers
 * (the Security Solution server plugin or a standalone ARGUS governance
 * service) can wire into their existing OpenTelemetry SDK. We deliberately
 * keep @opentelemetry/* out of this package's `dependsOn` so it can be
 * imported from any ARGUS layer without dragging the full SDK into the
 * browser bundle graph.
 *
 * The consumer passes in a `spanExporter` instance (e.g. a
 * `OTLPTraceExporter` from `@opentelemetry/exporter-trace-otlp-http`) and
 * this module returns a `SpanProcessorConfig` the consumer registers with
 * its own `NodeTracerProvider` / `NodeSDK`. No global side-effects.
 *
 * Phase 2 of m2-5 replaces this shim with:
 *   - a real span-processor factory that also tags spans with
 *     `service.namespace = "argus"`,
 *   - an ILM-backed rollover pipeline that routes OTLP spans into
 *     `.soc-reasoning-traces-<date>` on the cluster.
 */

export interface ArgusOtlpExporterConfig {
  /**
   * OTLP HTTP endpoint, e.g. `https://apm:8200/v1/traces` when going through
   * Elastic APM Server, or `http://otel-collector:4318/v1/traces` when
   * speaking directly to an OTEL collector.
   */
  endpoint: string;

  /**
   * Logical service name emitted as `service.name` on every span. Defaults
   * to `argus-security-solution`. Consumers can override for sub-services
   * (e.g. `argus-triage-agent`).
   */
  serviceName?: string;

  /**
   * Optional static resource attributes merged into every span (e.g.
   * `deployment.environment`, `argus.layer`). Kept as an unknown-valued
   * record so callers don't need to pull @opentelemetry types just to set
   * a few strings.
   */
  resourceAttributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface ArgusOtlpExporterDescriptor {
  endpoint: string;
  serviceName: string;
  resourceAttributes: Readonly<Record<string, string | number | boolean>>;
}

const DEFAULT_SERVICE_NAME = 'argus-security-solution';

/**
 * Normalises and validates an OTLP exporter configuration. Does NOT
 * instantiate an SDK — that lives in the consumer so ARGUS can be enabled
 * per-deployment without this package pinning an @opentelemetry version.
 *
 * Throws when the endpoint is missing or not an http(s) URL; callers should
 * surface that as a configuration error at plugin start.
 */
export function describeArgusOtlpExporter(
  config: ArgusOtlpExporterConfig
): ArgusOtlpExporterDescriptor {
  const endpoint = config.endpoint?.trim();
  if (!endpoint) {
    throw new Error(
      'ArgusOtlpExporter: `endpoint` is required (expected e.g. https://apm:8200/v1/traces)'
    );
  }
  if (!/^https?:\/\//i.test(endpoint)) {
    throw new Error(`ArgusOtlpExporter: \`endpoint\` must be an http(s) URL (got: ${endpoint})`);
  }

  const serviceName = config.serviceName?.trim() || DEFAULT_SERVICE_NAME;

  return {
    endpoint,
    serviceName,
    resourceAttributes: {
      'service.namespace': 'argus',
      'service.name': serviceName,
      ...(config.resourceAttributes ?? {}),
    },
  };
}
