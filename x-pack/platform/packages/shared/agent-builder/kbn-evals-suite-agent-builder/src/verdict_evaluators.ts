/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getFinalAssistantMessage, getStringMeta } from '@kbn/evals';
import type { Evaluator, TaskOutput } from '@kbn/evals';

/** Every verdict the `detection-coverage` skill may return; "exactly one" needs the whole set. */
export const ALL_VERDICTS = [
  'covered_enabled',
  'covered_disabled',
  'prebuilt_available',
  'no_coverage',
] as const;

export type Verdict = (typeof ALL_VERDICTS)[number];

/**
 * The verdicts an answer mentions.
 *
 * The skill is told to lead with one verdict token. Mentioning several would make the
 * recommendation ambiguous for a human and unusable for the workflow, so a multi-verdict
 * answer is a failure, not a pass with noise.
 */
export const verdictsMentioned = (answer: string): Verdict[] =>
  ALL_VERDICTS.filter((verdict) => answer.includes(verdict));

const isVerdict = (value: string): value is Verdict =>
  (ALL_VERDICTS as readonly string[]).includes(value);

const ANSWER_PREVIEW_LENGTH = 300;

/**
 * `prebuilt_available` vs `no_coverage` depends on the live prebuilt catalog, not on the
 * seeded rules, so a dataset derived from the seed alone cannot tell them apart.
 */
const collapse = (verdict: Verdict): string =>
  verdict === 'prebuilt_available' || verdict === 'no_coverage'
    ? 'prebuilt_available_or_no_coverage'
    : verdict;

const createVerdictEvaluator = ({
  name,
  normalize,
}: {
  name: string;
  normalize: (verdict: Verdict) => string;
}): Evaluator => ({
  name,
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, metadata }) => {
    const expected = getStringMeta(metadata, 'expectedVerdict');
    // Opt-in by metadata. Absent metadata is "not applicable", never a pass: a score of 1
    // here would inflate this evaluator's mean for every dataset that has no verdict.
    if (!expected) {
      return {
        score: null,
        label: 'unavailable',
        explanation: `No expectedVerdict metadata for ${name}`,
      };
    }
    if (!isVerdict(expected)) {
      return { score: null, label: 'error', explanation: `Invalid expectedVerdict: ${expected}` };
    }

    const answer = getFinalAssistantMessage(output as TaskOutput);
    const mentioned = verdictsMentioned(answer);
    const matched = mentioned.length === 1 && normalize(mentioned[0]) === normalize(expected);

    return {
      score: matched ? 1 : 0,
      metadata: {
        expectedVerdict: expected,
        mentionedVerdicts: mentioned,
        answerPreview: answer.slice(0, ANSWER_PREVIEW_LENGTH),
      },
    };
  },
});

/** Exactly one verdict token in the answer, and it is the expected one. */
export const createVerdictMatchEvaluator = (): Evaluator =>
  createVerdictEvaluator({ name: 'VerdictMatch', normalize: (verdict) => verdict });

/** As `VerdictMatch`, with `prebuilt_available` and `no_coverage` counted as one class. */
export const createVerdictMatchCollapsedEvaluator = (): Evaluator =>
  createVerdictEvaluator({ name: 'VerdictMatchCollapsed', normalize: collapse });
