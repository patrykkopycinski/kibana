/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { describeArgusOtlpExporter } from './otlp_exporter';

describe('describeArgusOtlpExporter', () => {
  it('normalises endpoint + defaults service name to argus-security-solution', () => {
    const descriptor = describeArgusOtlpExporter({
      endpoint: '  https://apm:8200/v1/traces  ',
    });

    expect(descriptor.endpoint).toBe('https://apm:8200/v1/traces');
    expect(descriptor.serviceName).toBe('argus-security-solution');
    expect(descriptor.resourceAttributes['service.namespace']).toBe('argus');
    expect(descriptor.resourceAttributes['service.name']).toBe('argus-security-solution');
  });

  it('honours a custom service name and extra resource attributes', () => {
    const descriptor = describeArgusOtlpExporter({
      endpoint: 'http://otel-collector:4318/v1/traces',
      serviceName: 'argus-triage-agent',
      resourceAttributes: {
        'deployment.environment': 'eval-staging',
        'argus.layer': 'governance',
      },
    });

    expect(descriptor.serviceName).toBe('argus-triage-agent');
    expect(descriptor.resourceAttributes['service.name']).toBe('argus-triage-agent');
    expect(descriptor.resourceAttributes['deployment.environment']).toBe('eval-staging');
    expect(descriptor.resourceAttributes['argus.layer']).toBe('governance');
  });

  it('rejects missing or empty endpoints', () => {
    expect(() => describeArgusOtlpExporter({ endpoint: '' })).toThrow(/endpoint.*required/i);
    expect(() => describeArgusOtlpExporter({ endpoint: '   ' })).toThrow(/endpoint.*required/i);
  });

  it('rejects non-http(s) endpoints so misconfig surfaces at plugin start', () => {
    expect(() => describeArgusOtlpExporter({ endpoint: 'grpc://apm:4317' })).toThrow(/http\(s\)/i);
  });
});
