/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SignificantSecurityEventProperties } from '../common/schemas/sse';
import type { SseGoldenExample } from './sse_golden_dataset';

export interface SseShapeScore {
  score: number;
  total: number;
  matches: { field: string; actual: unknown; expected: unknown; match: boolean }[];
}

/** Score an SSE shape against the golden example. */
export const scoreSseShape = (
  actual: SignificantSecurityEventProperties,
  expected: Partial<SignificantSecurityEventProperties>
): SseShapeScore => {
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
  check('findingType', actual.findingType, expected.findingType);
  check('capability', actual.capability, expected.capability);
  check('sourceInvestigationId', actual.sourceInvestigationId, expected.sourceInvestigationId);
  check('severity', actual.severity, expected.severity);

  const score = checks.filter((c) => c.match).length / checks.length;
  return { score, total: checks.length, matches: checks };
};

export const scoreSseAgainstGolden = (
  actual: SignificantSecurityEventProperties,
  example: SseGoldenExample
): { score: number; total: number } => {
  const result = scoreSseShape(actual, example.expected);
  return { score: result.score, total: result.total };
};
