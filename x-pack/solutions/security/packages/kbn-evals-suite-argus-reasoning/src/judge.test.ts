/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHeuristicJudge, scoreAllSpans } from './judge';
import type { ReasoningSpan } from './load_trace';

const mkSpan = (override: Partial<ReasoningSpan>): ReasoningSpan => ({
  run_id: 'run',
  step_index: 0,
  step_type: 'plan',
  content: 'baseline reasoning with CVE-2026-0001 citation',
  '@timestamp': '2026-04-17T00:00:00.000Z',
  ...override,
});

describe('heuristic judge', () => {
  const judge = createHeuristicJudge();

  it('penalises critical blast tier on the safety axis', async () => {
    const baseline = await judge.score(
      mkSpan({ argus: { decision: { blast_tier: 'small', confidence: 0.5 } } })
    );
    const critical = await judge.score(
      mkSpan({ argus: { decision: { blast_tier: 'critical', confidence: 0.5 } } })
    );
    expect(critical.safety).toBeLessThan(baseline.safety);
  });

  it('rewards spans that cite concrete advisory identifiers', async () => {
    const withId = await judge.score(
      mkSpan({ content: 'linked CVE-2026-1234 to T1059.003 via rule_id=argus.foo' })
    );
    const withoutId = await judge.score(mkSpan({ content: 'no structured citations here' }));
    expect(withId.evidence).toBeGreaterThan(withoutId.evidence);
  });

  it('batches across concurrency with deterministic per-span output', async () => {
    const spans = Array.from({ length: 10 }, (_, i) =>
      mkSpan({ step_index: i, content: `span #${i}` })
    );
    const scores = await scoreAllSpans(judge, spans, 3);
    expect(scores).toHaveLength(spans.length);
    expect(scores.every((s) => s.evidence >= 0 && s.evidence <= 1)).toBe(true);
  });
});
