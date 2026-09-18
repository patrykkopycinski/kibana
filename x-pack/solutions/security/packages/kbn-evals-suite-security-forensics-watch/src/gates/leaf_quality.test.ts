/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  LEAF_QUALITY_DIMENSIONS,
  evaluateLeafQualityGate,
  hasExplicitConfidenceLevel,
  iocsMatchExpected,
  type LeafQualityDimensions,
} from './leaf_quality';

const allDimensionsPassing = (): LeafQualityDimensions =>
  LEAF_QUALITY_DIMENSIONS.reduce((acc, dimension) => {
    acc[dimension] = true;
    return acc;
  }, {} as LeafQualityDimensions);

describe('L3 leaf-quality gate', () => {
  it('gates success on every dimension the scorecard reports', () => {
    for (const dimension of LEAF_QUALITY_DIMENSIONS) {
      const dimensions = { ...allDimensionsPassing(), [dimension]: false };
      const gate = evaluateLeafQualityGate(dimensions);

      expect(gate.success).toBe(false);
      expect(gate.failing).toEqual([dimension]);
      expect(gate.scorecard[dimension]).toBe(0);
      expect(Object.keys(gate.scorecard)).toEqual([...LEAF_QUALITY_DIMENSIONS]);
    }
  });

  it('passes only when every dimension passes', () => {
    const gate = evaluateLeafQualityGate(allDimensionsPassing());

    expect(gate.success).toBe(true);
    expect(gate.failing).toEqual([]);
    expect(Object.values(gate.scorecard).every((score) => score === 1)).toBe(true);
  });

  it('fails the run that only calls the tools, labels a draft and asks a question', () => {
    const gate = evaluateLeafQualityGate({
      ...allDimensionsPassing(),
      timelineDepth: false,
      iocValidation: false,
      confidenceLevels: false,
      esqlUsed: false,
      draftPersisted: false,
    });

    expect(gate.success).toBe(false);
    expect(gate.failing).toEqual([
      'timelineDepth',
      'iocValidation',
      'confidenceLevels',
      'esqlUsed',
      'draftPersisted',
    ]);
  });

  describe('iocsMatchExpected', () => {
    const expected = [
      { type: 'network_destination', value: '185.220.101.42', status: 'confirmed' },
      { type: 'file_hash', value: 'abc', status: 'not_found' },
    ];

    it('passes only when every golden label is reported with the expected status', () => {
      expect(
        iocsMatchExpected(expected, [
          { type: 'network_destination', value: '185.220.101.42', status: 'confirmed' },
          { type: 'file_hash', value: 'abc', status: 'not_found' },
        ])
      ).toBe(true);
    });

    it('fails on a wrong status for any golden label', () => {
      expect(
        iocsMatchExpected(expected, [
          { type: 'network_destination', value: '185.220.101.42', status: 'not_found' },
          { type: 'file_hash', value: 'abc', status: 'not_found' },
        ])
      ).toBe(false);
    });

    it('fails on a missing golden label', () => {
      expect(
        iocsMatchExpected(expected, [
          { type: 'network_destination', value: '185.220.101.42', status: 'confirmed' },
        ])
      ).toBe(false);
    });

    it('fails when there is no golden label to validate against', () => {
      expect(iocsMatchExpected([], [])).toBe(false);
    });
  });

  describe('hasExplicitConfidenceLevel', () => {
    it('accepts the declared confidence levels', () => {
      expect(hasExplicitConfidenceLevel('high')).toBe(true);
      expect(hasExplicitConfidenceLevel(' Medium ')).toBe(true);
      expect(hasExplicitConfidenceLevel('insufficient')).toBe(true);
    });

    it('rejects free-form prose or a missing level', () => {
      expect(hasExplicitConfidenceLevel('probably fine')).toBe(false);
      expect(hasExplicitConfidenceLevel(undefined)).toBe(false);
    });
  });
});
