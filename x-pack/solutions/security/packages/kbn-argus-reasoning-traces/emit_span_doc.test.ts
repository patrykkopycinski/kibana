/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ARGUS_TRACE_ATTR } from './trace_attributes';
import { ARGUS_REASONING_TRACE_INDEX, emitArgusSpanDoc } from './emit_span_doc';

const fixedNow = () => new Date('2026-04-17T12:00:00.000Z');

describe('emitArgusSpanDoc', () => {
  it('builds a document with both flat `argus.*` and dotted `attributes` views', () => {
    const doc = emitArgusSpanDoc({
      runId: 'run-abc',
      stepIndex: 0,
      stepType: 'thought',
      content: 'Considering a rule patch because variant coverage dropped',
      argus: {
        agentId: 'argus-deteng',
        agentVersion: '0.1.0',
        decisionKind: 'rule_patch',
        decisionId: 'dec-42',
        confidence: 0.81,
        trustTier: 'scoped',
      },
      now: fixedNow,
    });

    expect(doc['@timestamp']).toBe('2026-04-17T12:00:00.000Z');
    expect(doc.run_id).toBe('run-abc');
    expect(doc.agent_id).toBe('argus-deteng');
    expect(doc.step_index).toBe(0);
    expect(doc.step_type).toBe('thought');
    expect(doc.content).toBe('Considering a rule patch because variant coverage dropped');

    expect(doc.argus.agent).toEqual({ id: 'argus-deteng', version: '0.1.0' });
    expect(doc.argus.decision).toEqual({ kind: 'rule_patch', id: 'dec-42', confidence: 0.81 });
    expect(doc.argus.actor).toEqual({ trust_tier: 'scoped' });
    expect(doc.argus.injection).toBeUndefined();
    expect(doc.argus.tool).toBeUndefined();

    expect(doc.attributes[ARGUS_TRACE_ATTR.agentId]).toBe('argus-deteng');
    expect(doc.attributes[ARGUS_TRACE_ATTR.decisionKind]).toBe('rule_patch');
    expect(doc.attributes[ARGUS_TRACE_ATTR.confidence]).toBe(0.81);
    expect(doc.attributes[ARGUS_TRACE_ATTR.trustTier]).toBe('scoped');
  });

  it('populates the tool block when toolId or toolInputHash is set', () => {
    const doc = emitArgusSpanDoc({
      runId: 'run-xyz',
      stepIndex: 1,
      stepType: 'tool_call',
      argus: {
        agentId: 'argus-triage',
        decisionKind: 'triage_verdict',
        toolId: 'elasticsearch.search',
        toolInputHash: 'sha256:abc',
      },
      now: fixedNow,
    });
    expect(doc.argus.tool).toEqual({
      id: 'elasticsearch.search',
      input_hash: 'sha256:abc',
    });
    expect(doc.attributes[ARGUS_TRACE_ATTR.toolId]).toBe('elasticsearch.search');
  });

  it('omits optional fields when they are undefined', () => {
    const doc = emitArgusSpanDoc({
      runId: 'run-min',
      stepIndex: 0,
      stepType: 'thought',
      argus: { agentId: 'a', decisionKind: 'triage_verdict' },
      now: fixedNow,
    });
    expect(doc.content).toBeUndefined();
    expect(doc.tool_name).toBeUndefined();
    expect(doc.argus.actor).toBeUndefined();
    expect(doc.argus.injection).toBeUndefined();
    expect(doc.argus.tool).toBeUndefined();
    expect(doc.argus.correlation).toBeUndefined();
    expect(Object.keys(doc.attributes)).toEqual([
      ARGUS_TRACE_ATTR.agentId,
      ARGUS_TRACE_ATTR.decisionKind,
    ]);
  });

  it('rejects missing runId / stepType / agentId / decisionKind', () => {
    expect(() =>
      emitArgusSpanDoc({
        runId: '',
        stepIndex: 0,
        stepType: 'thought',
        argus: { agentId: 'a', decisionKind: 'triage_verdict' },
      })
    ).toThrow(/runId is required/);

    expect(() =>
      emitArgusSpanDoc({
        runId: 'r',
        stepIndex: 0,
        stepType: '',
        argus: { agentId: 'a', decisionKind: 'triage_verdict' },
      })
    ).toThrow(/stepType is required/);

    expect(() =>
      emitArgusSpanDoc({
        runId: 'r',
        stepIndex: 0,
        stepType: 'thought',
        argus: { agentId: '', decisionKind: 'triage_verdict' },
      })
    ).toThrow(/argus.agentId is required/);

    expect(() =>
      emitArgusSpanDoc({
        runId: 'r',
        stepIndex: 0,
        stepType: 'thought',
        // @ts-expect-error - decisionKind is required
        argus: { agentId: 'a' },
      })
    ).toThrow(/argus.decisionKind is required/);
  });

  it('rejects out-of-range confidence values', () => {
    expect(() =>
      emitArgusSpanDoc({
        runId: 'r',
        stepIndex: 0,
        stepType: 'thought',
        argus: { agentId: 'a', decisionKind: 'triage_verdict', confidence: 1.5 },
      })
    ).toThrow(/confidence must be a finite number in \[-1, 1\]/);
  });

  it('rejects negative step indexes', () => {
    expect(() =>
      emitArgusSpanDoc({
        runId: 'r',
        stepIndex: -1,
        stepType: 'thought',
        argus: { agentId: 'a', decisionKind: 'triage_verdict' },
      })
    ).toThrow(/stepIndex must be a non-negative integer/);
  });

  it('carries terminal step totals onto the final span', () => {
    const doc = emitArgusSpanDoc({
      runId: 'r',
      stepIndex: 7,
      stepType: 'final',
      totalSteps: 8,
      toolCallCount: 3,
      totalDurationMs: 1234,
      finalStatus: 'success',
      finalOutputRef: 'so:rule-create:abc',
      argus: {
        agentId: 'argus-deteng',
        decisionKind: 'rule_create',
        decisionId: 'dec-final',
      },
      now: fixedNow,
    });
    expect(doc.total_steps).toBe(8);
    expect(doc.tool_call_count).toBe(3);
    expect(doc.total_duration_ms).toBe(1234);
    expect(doc.final_status).toBe('success');
    expect(doc.final_output_ref).toBe('so:rule-create:abc');
  });
});

describe('ARGUS_REASONING_TRACE_INDEX', () => {
  it('points at .soc-reasoning-trace', () => {
    expect(ARGUS_REASONING_TRACE_INDEX).toBe('.soc-reasoning-trace');
  });
});
