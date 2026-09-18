/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Pure gate logic for the L3 leaf-quality spec.
 *
 * The gate exists to catch forensic-quality regressions, so every dimension
 * the scorecard reports must also gate `success`: a run that calls the two
 * tools, labels a draft and names a question while recovering zero timeline
 * events and validating no IoC has not demonstrated forensic quality.
 */

export const LEAF_QUALITY_DIMENSIONS = [
  'skillInvoked',
  'correctToolCalled',
  'timelineDepth',
  'iocValidation',
  'guardrailCompliance',
  'unresolvedQuestions',
  'confidenceLevels',
  'esqlUsed',
  'draftPersisted',
] as const;

export type LeafQualityDimension = (typeof LEAF_QUALITY_DIMENSIONS)[number];

export type LeafQualityDimensions = Record<LeafQualityDimension, boolean>;

export interface LeafQualityGateResult {
  success: boolean;
  failing: LeafQualityDimension[];
  scorecard: Record<LeafQualityDimension, number>;
}

/**
 * Derives both `success` and the scorecard from one dimension list, so a
 * reported dimension cannot drift out of the pass condition.
 */
export const evaluateLeafQualityGate = (
  dimensions: LeafQualityDimensions
): LeafQualityGateResult => {
  const failing = LEAF_QUALITY_DIMENSIONS.filter((dimension) => !dimensions[dimension]);

  return {
    success: failing.length === 0,
    failing,
    scorecard: LEAF_QUALITY_DIMENSIONS.reduce((acc, dimension) => {
      acc[dimension] = dimensions[dimension] ? 1 : 0;
      return acc;
    }, {} as Record<LeafQualityDimension, number>),
  };
};

export interface ExpectedIoc {
  type: string;
  value: string;
  status: string;
}

export interface ReportedIoc {
  type?: string;
  value?: string;
  status?: string;
}

/**
 * Dataset-backed IoC gate: every golden label for the case must appear in the
 * report with the same status. A partially-correct report is a quality
 * regression, not a pass.
 */
export const iocsMatchExpected = (
  expected: ReadonlyArray<ExpectedIoc>,
  actual: ReadonlyArray<ReportedIoc>
): boolean =>
  expected.length > 0 &&
  expected.every((exp) => {
    const match = actual.find((a) => a.type === exp.type && a.value === exp.value);
    return match?.status === exp.status;
  });

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low', 'insufficient'] as const;

/**
 * FR-141 requires an explicit confidence level; free-form prose is not a
 * scoreable confidence assessment.
 */
export const hasExplicitConfidenceLevel = (overall: string | undefined): boolean =>
  typeof overall === 'string' &&
  (CONFIDENCE_LEVELS as readonly string[]).includes(overall.trim().toLowerCase());
