/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InvestigationProperties } from '../common/schemas/investigation';
import type { InvestigationGoldenExample } from './investigation_golden_dataset';

export interface InvestigationShapeScore {
  score: number;
  total: number;
  matches: { field: string; actual: unknown; expected: unknown; match: boolean }[];
}

/** Score an investigation shape against the golden example. */
export const scoreInvestigationShape = (
  actual: InvestigationProperties,
  expected: Partial<InvestigationProperties>
): InvestigationShapeScore => {
  const checks: { field: string; actual: unknown; expected: unknown; match: boolean }[] = [];

  const check = (field: string, actualValue: unknown, expectedValue: unknown) => {
    checks.push({
      field,
      actual: actualValue,
      expected: expectedValue,
      match: actualValue === expectedValue,
    });
  };

  check('title', actual.title, expected.title);
  check('status', actual.status, expected.status);
  check('capability', actual.capability, expected.capability);
  check(
    'openQuestions',
    JSON.stringify(actual.openQuestions),
    JSON.stringify(expected.openQuestions)
  );
  check('sourceProposalId', actual.sourceProposalId, expected.sourceProposalId ?? actual.sourceProposalId);

  const score = checks.filter((c) => c.match).length / checks.length;
  return { score, total: checks.length, matches: checks };
};

export const scoreInvestigationAgainstGolden = (
  actual: InvestigationProperties,
  example: InvestigationGoldenExample
): { score: number; total: number } => {
  const result = scoreInvestigationShape(actual, example.expected);
  return { score: result.score, total: result.total };
};
