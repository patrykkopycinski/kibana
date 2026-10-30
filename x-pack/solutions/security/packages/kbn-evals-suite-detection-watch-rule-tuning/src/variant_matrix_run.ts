/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeType } from './constants';
import { selectFixtures } from './fixture_selection';
import { buildTuningVariantMatrix, type TuningVariantSpec } from './tuning_variants';

/** Opt-in switch for the 30-case variant matrix. Anything but `1` leaves the run unchanged. */
export const VARIANT_MATRIX_ENV = 'AZ_TUNING_VARIANTS';

export const isVariantMatrixEnabled = (value: string | undefined): boolean => value === '1';

/** The variant cases for this run; `EVAL_EXAMPLES` caps them like it caps the base fixtures. */
export const selectVariantCases = (limit: string | undefined): TuningVariantSpec[] =>
  selectFixtures(buildTuningVariantMatrix(), limit);

/** A variant runs on its base rule's fixture; a missing base is matrix/spec drift, not a skip. */
export const baseFixtureFor = <T extends { id: string }>(
  spec: TuningVariantSpec,
  fixtures: readonly T[]
): T => {
  const fixture = fixtures.find((f) => f.id === spec.baseId);
  if (!fixture) {
    throw new Error(`Variant ${spec.caseId} has no base tuning fixture "${spec.baseId}"`);
  }
  return fixture;
};

interface BaseFixture {
  id: string;
  ruleType: string;
  description: string;
}

/**
 * One example per variant case. The example id is the case id (`<base>-v<n>`); `fixtureId`
 * stays the BASE id so the contested/defensible label lists, keyed by base fixture id, still
 * apply to its variants.
 */
export const buildVariantExamples = (
  cases: readonly TuningVariantSpec[],
  fixtures: readonly BaseFixture[]
) =>
  cases.map((spec) => {
    const base = baseFixtureFor(spec, fixtures);
    return {
      id: spec.caseId,
      input: { fixtureId: base.id, caseId: spec.caseId },
      output: { change_type: spec.expected as ChangeType },
      metadata: {
        fixtureId: base.id,
        caseId: spec.caseId,
        variant: spec.variant,
        ruleType: base.ruleType,
        expected: spec.expected as ChangeType,
        description: base.description,
      },
    };
  });
