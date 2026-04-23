/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildReasoningChainFromSpanDocs } from './reasoning_chain_builder';
import {
  HAPPY_PATH_SPANS,
  INJECTION_FLAGGED_SPANS,
  EMPTY_SPANS,
} from './__fixtures__/reasoning_chain.fixtures';

describe('buildReasoningChainFromSpanDocs', () => {
  const subject = { kind: 'alert', id: 'alert-abc' } as const;

  it('returns reason_code=no_trace when docs are empty', () => {
    const result = buildReasoningChainFromSpanDocs(EMPTY_SPANS, subject);
    expect(result.reason_code).toBe('no_trace');
    expect(result.chain).toBeUndefined();
  });

  it('builds a monotonic-by-step_index chain on the happy path', () => {
    const result = buildReasoningChainFromSpanDocs(HAPPY_PATH_SPANS, subject);
    expect(result.reason_code).toBe('ok');
    expect(result.chain).toBeDefined();
    const steps = result.chain!.steps;
    expect(steps.map((step) => step.step_index)).toEqual([0, 1, 2, 3]);
    expect(result.chain!.run_id).toBe('run-7a3');
    expect(result.chain!.final_status).toBe('success');
  });

  it('preserves confidence_delta and actor trust tier at decision time', () => {
    const { chain } = buildReasoningChainFromSpanDocs(HAPPY_PATH_SPANS, subject);
    const toolResult = chain!.steps.find((step) => step.step_type === 'tool_result');
    expect(toolResult?.confidence).toBe(0.83);
    expect(toolResult?.confidence_delta).toBe(0.21);
    expect(toolResult?.actor_trust_tier_at_decision).toBe('system');
  });

  it('surfaces injection-surface flags on flagged steps', () => {
    const { chain } = buildReasoningChainFromSpanDocs(INJECTION_FLAGGED_SPANS, {
      kind: 'run',
      id: 'run-9c1',
    });
    const ingestStep = chain!.steps[0];
    expect(ingestStep.injection_surface_flags).toHaveLength(1);
    expect(ingestStep.injection_surface_flags?.[0].code).toBe('suspicious_prompt_token');
    expect(ingestStep.injection_surface_flags?.[0].severity).toBe('warn');
  });

  it('skips docs that are missing run_id (cannot anchor a step to a chain)', () => {
    const result = buildReasoningChainFromSpanDocs(
      [{ step_index: 0 }, ...HAPPY_PATH_SPANS],
      subject
    );
    expect(result.chain!.steps.length).toBe(HAPPY_PATH_SPANS.length);
  });

  it('defaults unknown step_type values to "thought" instead of dropping the step', () => {
    const result = buildReasoningChainFromSpanDocs(
      [{ ...HAPPY_PATH_SPANS[0], step_type: 'mystery-type' }],
      subject
    );
    expect(result.chain!.steps[0].step_type).toBe('thought');
  });
});
