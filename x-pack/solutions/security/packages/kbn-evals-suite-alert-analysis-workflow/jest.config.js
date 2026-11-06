/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// LOCAL PROBE ONLY (worktree copy, never committed): the shared node_modules
// symlink makes the bare '@kbn/test' preset resolve to the MAIN checkout's
// kbn-test, whose setupFiles point at src/setup_node_env/polyfill.ts -- a file
// this head tree no longer has. Point the preset at THIS tree's kbn-test.
module.exports = {
  preset: '<rootDir>/src/platform/packages/shared/kbn-test',
  rootDir: '../../../../..',
  roots: [
    '<rootDir>/x-pack/solutions/security/packages/kbn-evals-suite-alert-analysis-workflow/src',
  ],
};
