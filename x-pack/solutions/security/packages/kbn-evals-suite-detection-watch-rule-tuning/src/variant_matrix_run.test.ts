/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TUNING_BASE_RULES, buildTuningVariantMatrix } from './tuning_variants';
import {
  VARIANT_MATRIX_ENV,
  baseFixtureFor,
  buildVariantExamples,
  isVariantMatrixEnabled,
  selectVariantCases,
} from './variant_matrix_run';

const fixtures = TUNING_BASE_RULES.map(({ id }) => ({
  id,
  ruleType: 'query',
  description: `description of ${id}`,
}));

describe('isVariantMatrixEnabled', () => {
  it('names the documented env var', () => {
    expect(VARIANT_MATRIX_ENV).toBe('AZ_TUNING_VARIANTS');
  });

  it('is on only for the exact value 1', () => {
    expect(isVariantMatrixEnabled('1')).toBe(true);
    expect(isVariantMatrixEnabled(undefined)).toBe(false);
    expect(isVariantMatrixEnabled('')).toBe(false);
    expect(isVariantMatrixEnabled('0')).toBe(false);
    expect(isVariantMatrixEnabled('true')).toBe(false);
  });
});

describe('selectVariantCases', () => {
  it('returns the full 30-case matrix when uncapped', () => {
    expect(selectVariantCases(undefined)).toHaveLength(30);
  });

  it('caps with EVAL_EXAMPLES', () => {
    expect(selectVariantCases('4').map((c) => c.caseId)).toEqual(
      buildTuningVariantMatrix()
        .slice(0, 4)
        .map((c) => c.caseId)
    );
  });
});

describe('baseFixtureFor', () => {
  it('throws on matrix/spec drift instead of skipping the case', () => {
    const [spec] = buildTuningVariantMatrix();
    expect(() => baseFixtureFor(spec, [])).toThrow(/no base tuning fixture/);
  });
});

describe('buildVariantExamples', () => {
  const examples = buildVariantExamples(selectVariantCases(undefined), fixtures);

  it('uses the variant case id as the example id', () => {
    expect(examples).toHaveLength(30);
    for (const example of examples) {
      expect(example.id).toMatch(/-v[012]$/);
      expect(example.id).toBe(example.metadata.caseId);
    }
  });

  it('keeps the BASE id as fixtureId so the contested/defensible lists still apply', () => {
    const example = examples.find((e) => e.id === 'fp-host-exception-v2');
    expect(example?.metadata.fixtureId).toBe('fp-host-exception');
    expect(example?.input.fixtureId).toBe('fp-host-exception');
    expect(example?.metadata.variant).toBe(2);
  });

  it('carries the golden label of the base rule', () => {
    for (const example of examples) {
      const base = TUNING_BASE_RULES.find((b) => b.id === example.metadata.fixtureId);
      expect(example.output.change_type).toBe(base?.expected);
    }
  });
});
