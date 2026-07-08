/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { configSchema } from './config';

describe('daybreak config schema', () => {
  test('enabled resolves to false by default (FR-007, NFR-2)', () => {
    expect(configSchema.validate({})).toEqual({ enabled: false });
  });

  test('accepts enabled: true when explicitly opted in', () => {
    expect(configSchema.validate({ enabled: true })).toEqual({ enabled: true });
  });

  test('accepts enabled: false when explicitly disabled', () => {
    expect(configSchema.validate({ enabled: false })).toEqual({ enabled: false });
  });

  test('rejects non-boolean enabled values', () => {
    expect(() => configSchema.validate({ enabled: 'yes' })).toThrow();
  });

  test('rejects unexpected properties', () => {
    expect(() => configSchema.validate({ enabled: false, extra: true })).toThrow(/extra/);
  });
});
