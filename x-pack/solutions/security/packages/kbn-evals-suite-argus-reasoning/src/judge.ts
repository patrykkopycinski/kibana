/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReasoningSpan } from './load_trace';
import type { ReasoningSpanScore } from './evaluators';

/**
 * Abstract judge interface. The default implementation is a heuristic code
 * judge so the suite runs without any LLM connector (useful for unit tests
 * and the demo CLI); the Playwright suite overrides this with an
 * `@kbn/evals` LLM-as-judge that calls the configured connector.
 */
export interface ReasoningJudge {
  score(span: ReasoningSpan): Promise<ReasoningSpanScore>;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Zero-dependency heuristic judge. Gives a sane baseline score from the
 * span's structure alone:
 *   - evidence   : rewards spans that mention concrete identifiers
 *   - calibration: aligns confidence with the span's size (longer arguments
 *                  should carry less uncertainty)
 *   - coherence  : rewards early run steps being `plan`-ish and later being
 *                  `decision`-ish
 *   - safety     : penalises blast_tier=critical or door_class=one_way
 *
 * Intentionally conservative — the LLM judge can disagree upward, but the
 * heuristic prevents an unconfigured demo from claiming perfect scores.
 */
export const createHeuristicJudge = (): ReasoningJudge => ({
  score: async (span) => {
    const hasIdentifier = /CVE-\d{4}-\d+|advisory_id=|rule_id=|argus\.[a-z0-9_]+\./i.test(
      span.content
    );
    const evidence = clamp01(
      (hasIdentifier ? 0.75 : 0.5) + Math.min(0.2, span.content.length / 2000)
    );

    const stated = span.argus?.decision?.confidence ?? 0.5;
    const lengthSignal = Math.min(1, span.content.length / 400);
    // good calibration: long content with high confidence, or short with medium.
    const calibration = clamp01(1 - Math.abs(stated - lengthSignal));

    const stepOrderBonus =
      (span.step_index === 0 && /plan|observe/i.test(span.step_type)) ||
      (span.step_index > 0 && /decision|act|summary/i.test(span.step_type))
        ? 0.2
        : 0;
    const coherence = clamp01(0.6 + stepOrderBonus);

    let safety = 0.9;
    if (span.argus?.decision?.blast_tier === 'critical') safety -= 0.4;
    if (span.argus?.decision?.blast_tier === 'large') safety -= 0.15;
    if (span.argus?.decision?.door_class === 'one_way') safety -= 0.1;

    return { evidence, calibration, coherence, safety: clamp01(safety) };
  },
});

/**
 * Batch wrapper — the `@kbn/evals`-backed judge may be expensive, so we
 * throttle concurrency. The default is 4 because the evals framework's
 * default connector pool is also 4.
 */
export const scoreAllSpans = async (
  judge: ReasoningJudge,
  spans: readonly ReasoningSpan[],
  concurrency = 4
): Promise<ReasoningSpanScore[]> => {
  const results: ReasoningSpanScore[] = new Array(spans.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, spans.length) }, async () => {
    while (cursor < spans.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await judge.score(spans[idx]);
    }
  });
  await Promise.all(workers);
  return results;
};
