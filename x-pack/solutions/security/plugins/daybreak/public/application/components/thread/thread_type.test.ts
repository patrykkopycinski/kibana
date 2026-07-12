/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { daybreakTheme } from '../../theme';
import { THREAD_TYPES, THREAD_TYPE_META, isThreadType } from './thread_type';

describe('THREAD_TYPES (FR-013)', () => {
  it('exposes exactly the five prototype thread kinds, in the prototype order', () => {
    expect(THREAD_TYPES).toEqual(['case', 'investigation', 'hunt', 'incident', 'chat', 'custom']);
  });

  it('has metadata for every thread type', () => {
    for (const type of THREAD_TYPES) {
      expect(THREAD_TYPE_META[type]).toBeDefined();
      expect(THREAD_TYPE_META[type].icon).toEqual(expect.any(String));
      expect(THREAD_TYPE_META[type].label()).toEqual(expect.any(String));
    }
  });

  it('resolves every themeToken to a real daybreakTheme.threadType key (FR-006)', () => {
    for (const type of THREAD_TYPES) {
      const { themeToken } = THREAD_TYPE_META[type];
      expect(daybreakTheme.modes.dark.threadType[themeToken]).toEqual(expect.any(String));
      expect(daybreakTheme.modes.light.threadType[themeToken]).toEqual(expect.any(String));
    }
  });
});

describe('isThreadType', () => {
  it('returns true for every known thread type', () => {
    for (const type of THREAD_TYPES) {
      expect(isThreadType(type)).toBe(true);
    }
  });

  it('returns false for an unknown string', () => {
    expect(isThreadType('not-a-thread-type')).toBe(false);
  });
});
