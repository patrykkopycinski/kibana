/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildSseFromInvestigation } from './sse_builder';
import { SSE_GOLDEN_EXAMPLES } from '../../evals/sse_golden_dataset';
import { scoreSseShape } from '../../evals/sse_dataset_gate';

describe('buildSseFromInvestigation', () => {
  it('builds an SSE from the golden example', () => {
    const example = SSE_GOLDEN_EXAMPLES[0];
    const sse = buildSseFromInvestigation({
      sseId: 'daybreak-golden-sse-from-investigation',
      investigation: example.input,
    });

    const { score, total } = scoreSseShape(sse, example.expected);

    expect(score).toBe(1);
    expect(total).toBeGreaterThan(0);
    expect(sse.sourceInvestigationId).toBe(example.input.id);
    expect(sse.recommendedActions).toHaveLength(2);
    expect(sse.entities).toContain('demo-watch-floor');
  });
});
