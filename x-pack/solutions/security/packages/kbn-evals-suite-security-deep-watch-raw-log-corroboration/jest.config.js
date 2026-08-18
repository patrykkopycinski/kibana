module.exports = {
  rootDir: '../../..',
  roots: ['<rootDir>/x-pack/solutions/security/packages/kbn-evals-suite-security-deep-watch-raw-log-corroboration'],
  testMatch: ['<rootDir>/x-pack/solutions/security/packages/kbn-evals-suite-security-deep-watch-raw-log-corroboration/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': require.resolve('ts-jest'),
  },
  moduleNameMapper: {
    '@kbn/evals-suite-security-deep-watch-raw-log-corroboration/(.*)': '<rootDir>/x-pack/solutions/security/packages/kbn-evals-suite-security-deep-watch-raw-log-corroboration/src/$1',
  },
};
