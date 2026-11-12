/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { diffCategoryCounts, detonateRunDiffPath } from '.';

describe('diffCategoryCounts', () => {
  it('orders by absolute delta, ties by category name', () => {
    expect(
      diffCategoryCounts({ process: 12, malware: 2, file: 3 }, { process: 3, malware: 2, file: 9 })
    ).toEqual([
      { category: 'process', current: 12, prior: 3, delta: 9 },
      { category: 'file', current: 3, prior: 9, delta: -6 },
      { category: 'malware', current: 2, prior: 2, delta: 0 },
    ]);
  });

  it('diffs a category present on one side only by its whole count', () => {
    expect(diffCategoryCounts({ process: 9, uncategorized: 3 }, { file: 2 })).toEqual([
      { category: 'process', current: 9, prior: 0, delta: 9 },
      { category: 'uncategorized', current: 3, prior: 0, delta: 3 },
      { category: 'file', current: 0, prior: 2, delta: -2 },
    ]);
  });

  it('answers an empty diff for two empty runs', () => {
    expect(diffCategoryCounts({}, {})).toEqual([]);
  });

  it('answers an empty diff when both runs measured the same', () => {
    expect(diffCategoryCounts({ process: 4 }, { process: 4 })).toEqual([
      { category: 'process', current: 4, prior: 4, delta: 0 },
    ]);
  });
});

describe('detonateRunDiffPath', () => {
  it('encodes the run id', () => {
    expect(detonateRunDiffPath('a/b')).toBe('/internal/detonate_prototype/runs/a%2Fb/diff');
  });
});
