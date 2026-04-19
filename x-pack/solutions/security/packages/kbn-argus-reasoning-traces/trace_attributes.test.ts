/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ARGUS_TRACE_ATTR, type ArgusSpanAttributes } from './trace_attributes';

describe('ARGUS_TRACE_ATTR', () => {
  it('uses the dotted argus.* namespace for every attribute', () => {
    for (const name of Object.values(ARGUS_TRACE_ATTR)) {
      expect(name.startsWith('argus.')).toBe(true);
    }
  });

  it('has unique attribute names across keys', () => {
    const values = Object.values(ARGUS_TRACE_ATTR);
    expect(new Set(values).size).toBe(values.length);
  });

  it('accepts a minimal ArgusSpanAttributes bag with only the required keys', () => {
    const minimal: ArgusSpanAttributes = {
      [ARGUS_TRACE_ATTR.agentId]: 'soc-deteng-agent',
      [ARGUS_TRACE_ATTR.decisionKind]: 'rule_create',
    };
    expect(minimal[ARGUS_TRACE_ATTR.agentId]).toBe('soc-deteng-agent');
    expect(minimal[ARGUS_TRACE_ATTR.decisionKind]).toBe('rule_create');
  });

  it('accepts optional confidence, trust tier, and correlation attributes', () => {
    const enriched: ArgusSpanAttributes = {
      [ARGUS_TRACE_ATTR.agentId]: 'soc-triage-agent',
      [ARGUS_TRACE_ATTR.decisionKind]: 'triage_verdict',
      [ARGUS_TRACE_ATTR.confidence]: 0.82,
      [ARGUS_TRACE_ATTR.confidenceDelta]: -0.05,
      [ARGUS_TRACE_ATTR.trustTier]: 'scoped',
      [ARGUS_TRACE_ATTR.correlatedAlertId]: 'alert-abc-123',
    };
    expect(enriched[ARGUS_TRACE_ATTR.confidence]).toBeCloseTo(0.82);
    expect(enriched[ARGUS_TRACE_ATTR.trustTier]).toBe('scoped');
  });
});
