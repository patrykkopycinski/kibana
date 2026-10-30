/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import {
  createVerdictMatchCollapsedEvaluator,
  createVerdictMatchEvaluator,
  verdictsMentioned,
} from './verdict_evaluators';

const run = (
  evaluator: Evaluator,
  answer: string | undefined,
  metadata?: Record<string, unknown>
) =>
  evaluator.evaluate({
    input: { question: 'gap' },
    expected: {},
    output: { errors: [], steps: [], messages: answer === undefined ? [] : [{ message: answer }] },
    metadata,
  });

describe('verdictsMentioned', () => {
  it('returns every distinct verdict token in canonical order', () => {
    expect(verdictsMentioned('no_coverage, not covered_enabled')).toEqual([
      'covered_enabled',
      'no_coverage',
    ]);
  });
});

describe('VerdictMatch', () => {
  const evaluator = createVerdictMatchEvaluator();

  it('scores 1 for a single verdict equal to the expected one', async () => {
    const result = await run(evaluator, 'Verdict: covered_enabled. Rule X covers it.', {
      expectedVerdict: 'covered_enabled',
    });
    expect(result.score).toBe(1);
    expect(result.metadata).toEqual({
      expectedVerdict: 'covered_enabled',
      mentionedVerdicts: ['covered_enabled'],
      answerPreview: 'Verdict: covered_enabled. Rule X covers it.',
    });
  });

  it('scores 0 for a single wrong verdict', async () => {
    const result = await run(evaluator, 'covered_disabled: enable the rule', {
      expectedVerdict: 'covered_enabled',
    });
    expect(result.score).toBe(0);
    expect(result.metadata).toEqual(
      expect.objectContaining({ mentionedVerdicts: ['covered_disabled'] })
    );
  });

  it('scores 0 when no verdict is mentioned, including an empty transcript', async () => {
    const expectedVerdict = 'no_coverage';
    expect((await run(evaluator, 'The gap is not covered.', { expectedVerdict })).score).toBe(0);
    const empty = await run(evaluator, undefined, { expectedVerdict });
    expect(empty.score).toBe(0);
    expect(empty.metadata).toEqual(expect.objectContaining({ mentionedVerdicts: [] }));
  });

  it('scores 0 when several verdicts are mentioned, even if the expected one is among them', async () => {
    const result = await run(evaluator, 'no_coverage, although prebuilt_available was considered', {
      expectedVerdict: 'no_coverage',
    });
    expect(result.score).toBe(0);
    expect(result.metadata).toEqual(
      expect.objectContaining({ mentionedVerdicts: ['prebuilt_available', 'no_coverage'] })
    );
  });

  it('scores 0 for several verdicts when the expected one is listed first in canonical order', async () => {
    const result = await run(evaluator, 'covered_enabled, but maybe no_coverage', {
      expectedVerdict: 'covered_enabled',
    });
    expect(result.score).toBe(0);
  });

  it('does not treat prebuilt_available as no_coverage', async () => {
    const result = await run(evaluator, 'prebuilt_available', { expectedVerdict: 'no_coverage' });
    expect(result.score).toBe(0);
  });

  it('truncates the answer preview', async () => {
    const result = await run(evaluator, `covered_enabled ${'x'.repeat(1000)}`, {
      expectedVerdict: 'covered_enabled',
    });
    expect((result.metadata?.answerPreview as string).length).toBe(300);
  });

  it.each([undefined, {}, { expectedVerdict: '' }])(
    'reports no score, not a pass, when the opt-in metadata is absent (%p)',
    async (metadata) => {
      const result = await run(evaluator, 'covered_enabled', metadata);
      expect(result.score).toBeNull();
      expect(result.label).toBe('unavailable');
    }
  );

  it('reports an error label for an unknown expectedVerdict', async () => {
    const result = await run(evaluator, 'covered_enabled', { expectedVerdict: 'covered' });
    expect(result.score).toBeNull();
    expect(result.label).toBe('error');
  });
});

describe('VerdictMatchCollapsed', () => {
  const strict = createVerdictMatchEvaluator();
  const collapsed = createVerdictMatchCollapsedEvaluator();

  it('treats prebuilt_available and no_coverage as one class, while strict does not', async () => {
    const metadata = { expectedVerdict: 'no_coverage' };
    expect((await run(collapsed, 'prebuilt_available', metadata)).score).toBe(1);
    expect((await run(strict, 'prebuilt_available', metadata)).score).toBe(0);

    const reverse = { expectedVerdict: 'prebuilt_available' };
    expect((await run(collapsed, 'no_coverage', reverse)).score).toBe(1);
    expect((await run(strict, 'no_coverage', reverse)).score).toBe(0);
  });

  it('still separates the covered verdicts from the collapsed class and from each other', async () => {
    expect(
      (await run(collapsed, 'covered_enabled', { expectedVerdict: 'covered_disabled' })).score
    ).toBe(0);
    expect(
      (await run(collapsed, 'no_coverage', { expectedVerdict: 'covered_enabled' })).score
    ).toBe(0);
    expect(
      (await run(collapsed, 'covered_disabled', { expectedVerdict: 'prebuilt_available' })).score
    ).toBe(0);
    expect(
      (await run(collapsed, 'covered_disabled', { expectedVerdict: 'covered_disabled' })).score
    ).toBe(1);
  });

  it('still fails zero or several verdicts, even when both fall in the collapsed class', async () => {
    const metadata = { expectedVerdict: 'no_coverage' };
    expect((await run(collapsed, 'unsure', metadata)).score).toBe(0);
    expect((await run(collapsed, 'prebuilt_available or no_coverage', metadata)).score).toBe(0);
  });

  it('reports no score when the opt-in metadata is absent', async () => {
    const result = await run(collapsed, 'no_coverage', {});
    expect(result.score).toBeNull();
    expect(result.label).toBe('unavailable');
  });
});
