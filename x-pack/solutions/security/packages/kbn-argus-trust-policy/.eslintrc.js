/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  overrides: [
    // This package is server-only: the spec-alignment test reads the
    // trust-gate YAML from disk to check for drift against the TS spec.
    // Node.js builtins (fs/promises, path) are intentional.
    {
      files: ['**/*.{js,mjs,ts,tsx}'],
      rules: {
        'import/no-nodejs-modules': 'off',
      },
    },
  ],
};
