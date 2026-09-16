/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildPairs } from './scrub_demo_identity';

describe('scrub_demo_identity', () => {
  describe('buildPairs', () => {
    it('returns just the base pair when token is short', () => {
      expect(buildPairs('abc', 'svc')).toEqual([{ from: 'abc', to: 'svc' }]);
    });

    it('returns base + 8.3 short name when token >6 chars', () => {
      expect(buildPairs('patrykkopycinski', 'svc-install')).toEqual([
        { from: 'patrykkopycinski', to: 'svc-install' },
        { from: 'PATRYK~1', to: 'SVC-IN~1' },
      ]);
    });

    it('omits short-name pair when replacement is short', () => {
      expect(buildPairs('patrykkopycinski', 'svc')).toEqual([
        { from: 'patrykkopycinski', to: 'svc' },
      ]);
    });
  });
});
