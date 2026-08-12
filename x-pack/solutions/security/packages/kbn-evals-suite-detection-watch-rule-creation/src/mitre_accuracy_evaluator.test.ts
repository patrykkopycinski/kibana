/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createMitreAccuracyEvaluator } from './evaluate_dataset';
import { calculateSetMetrics } from './helpers';
import { goldenDataset } from '../datasets/rule_creation_golden';
import { hardCases } from '../datasets/hard_cases';

const evaluateMitre = (
  generated: string[],
  expected: { mitreIds: string[]; optionalMitreIds?: string[] }
) => {
  const evaluator = createMitreAccuracyEvaluator();
  return evaluator.evaluate({
    output: {
      rule: {
        threat: [{ technique: generated.map((id) => ({ id })) }],
      },
    },
    expected,
  } as never) as Promise<{ score: number; metadata: Record<string, unknown> }>;
};

describe('MITRE Accuracy evaluator', () => {
  /**
   * The ceiling invariant. Scoring the answer key against itself is VACUOUS — F1(x, x) is 1.0 for
   * any non-empty set, so such a test passes no matter how the dataset is built and cannot detect
   * the defect below. The ceiling has to be computed from what the PROMPT makes knowable: the
   * agent sees only `input.technique`, so that is the most a perfect responder can derive.
   *
   * Measured 2026-08-12: MITRE Accuracy graded F1 against up to five techniques while the prompt
   * named one. `hard-t1609` asked for T1609 yet also required T1611, T1059 and T1053, capping a
   * perfectly precise answer at 0.40 (mean 0.71) — the metric was scoring dataset construction,
   * not agent quality.
   */
  it('a response derivable from the prompt alone can score 1.00', () => {
    const belowCeiling = [...goldenDataset, ...hardCases].flatMap((example) => {
      const askedRoot = example.input.technique.split('.')[0];
      const derivable = example.output.mitreIds.filter((id) => id.startsWith(askedRoot));
      const ceiling = calculateSetMetrics(new Set(derivable), new Set(example.output.mitreIds)).f1;
      return ceiling < 1 ? [`${example.id}: ceiling ${ceiling.toFixed(2)}`] : [];
    });

    expect(belowCeiling).toEqual([]);
  });

  /**
   * The defect this suite exists to prevent. Measured 2026-08-12: every example asks the agent to
   * close ONE gap (`input.technique`), but MITRE Accuracy graded F1 against up to five techniques,
   * several never named in the prompt. `hard-t1609` asked for T1609 while also grading T1611,
   * T1059 and T1053 — unguessable from the input, so a perfectly precise answer capped at 0.40 and
   * the metric measured dataset construction rather than agent quality.
   */
  it('does not penalise omitting an optional technique', async () => {
    const withOptional = await evaluateMitre(['T1609'], {
      mitreIds: ['T1609'],
      optionalMitreIds: ['T1611', 'T1059', 'T1053'],
    });
    const withoutOptional = await evaluateMitre(['T1609'], { mitreIds: ['T1609'] });

    expect(withOptional.score).toBe(withoutOptional.score);
  });

  it('does not penalise including an optional technique as a false positive', async () => {
    const minimal = await evaluateMitre(['T1609'], {
      mitreIds: ['T1609'],
      optionalMitreIds: ['T1611'],
    });
    const withExtra = await evaluateMitre(['T1609', 'T1611'], {
      mitreIds: ['T1609'],
      optionalMitreIds: ['T1611'],
    });

    expect(withExtra.score).toBe(minimal.score);
    expect(withExtra.metadata.optionalCredited).toEqual(['T1611']);
  });

  it('still penalises a genuinely wrong technique', async () => {
    const result = await evaluateMitre(['T1609', 'T9999'], {
      mitreIds: ['T1609'],
      optionalMitreIds: ['T1611'],
    });

    expect(result.score).toBeLessThan(1);
  });

  it('still penalises missing a required technique', async () => {
    const result = await evaluateMitre(['T1078'], {
      mitreIds: ['T1078', 'T1078.004'],
    });

    expect(result.score).toBeLessThan(1);
  });

  /**
   * Guards the dataset itself: `mitreIds` is the REQUIRED set, so it must stay answerable from the
   * prompt. Anything the input does not name belongs in `optionalMitreIds`.
   */
  it('requires only techniques derivable from the requested technique', () => {
    const offenders = [...goldenDataset, ...hardCases].flatMap((example) => {
      const askedRoot = example.input.technique.split('.')[0];
      const unrequested = example.output.mitreIds.filter((id) => !id.startsWith(askedRoot));
      return unrequested.length > 0 ? [`${example.id}: ${unrequested.join(', ')}`] : [];
    });

    expect(offenders).toEqual([]);
  });
});
