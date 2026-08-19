/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

module.exports = {
  rootDir: '../../..',
  roots: [
    '<rootDir>/x-pack/solutions/security/packages/kbn-evals-suite-security-deep-watch-raw-log-corroboration',
  ],
  testMatch: [
    '<rootDir>/x-pack/solutions/security/packages/kbn-evals-suite-security-deep-watch-raw-log-corroboration/**/*.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': require.resolve('ts-jest'),
  },
  moduleNameMapper: {
    '@kbn/evals-suite-security-deep-watch-raw-log-corroboration/(.*)':
      '<rootDir>/x-pack/solutions/security/packages/kbn-evals-suite-security-deep-watch-raw-log-corroboration/src/$1',
  },
};
