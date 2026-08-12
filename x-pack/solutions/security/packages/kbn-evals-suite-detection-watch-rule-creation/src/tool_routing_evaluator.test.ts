/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createToolRoutingEvaluator } from './evaluate_dataset';
import { RULE_CREATION_TOOL_ID } from './constants';
import type { RuleCreationResult } from './rule_creation_client';

/**
 * `Tool Routing` must distinguish three outcomes that all look alike if you only ask
 * "was the tool in the call list?":
 *
 *   1. never called            -> 0, 'missed'
 *   2. called, every call errored -> 0, 'called-but-failed'
 *   3. called and succeeded    -> 1, 'routed'
 *
 * Case 2 is the one measured live on 2026-08-11: 12 of 16 `security.create_detection_rule` calls
 * failed with "Could not discover a suitable index for the query", the agent retried 3x per
 * example, and membership-only scoring reported that as a clean routing pass.
 */
const evaluator = createToolRoutingEvaluator();

const run = (over: Partial<RuleCreationResult>) =>
  evaluator.evaluate({
    output: {
      toolCallIds: [],
      failedToolCallIds: [],
      toolCallsUnavailable: false,
      ...over,
    } as RuleCreationResult,
    input: {},
    expected: {},
    metadata: undefined,
  } as Parameters<typeof evaluator.evaluate>[0]);

describe('createToolRoutingEvaluator', () => {
  it('scores 1 when the rule-creation tool was called and did not error', async () => {
    const result = await run({ toolCallIds: ['load_skill', RULE_CREATION_TOOL_ID] });

    expect(result.score).toBe(1);
    expect(result.label).toBe('routed');
  });

  it('scores 0 when the tool was called but every call errored', async () => {
    // Without the status check this returns score 1 / 'routed' — the false green.
    const result = await run({
      toolCallIds: ['load_skill', RULE_CREATION_TOOL_ID],
      failedToolCallIds: [RULE_CREATION_TOOL_ID],
    });

    expect(result.score).toBe(0);
    expect(result.label).toBe('called-but-failed');
    expect(result.explanation).toContain('status.code=Error');
  });

  it('scores 0 when the tool was never called', async () => {
    const result = await run({ toolCallIds: ['load_skill', 'platform.core.list_indices'] });

    expect(result.score).toBe(0);
    expect(result.label).toBe('missed');
  });

  it('reports N/A (null score) when traces are unavailable, and never a pass', async () => {
    const result = await run({ toolCallsUnavailable: true });

    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });
});
