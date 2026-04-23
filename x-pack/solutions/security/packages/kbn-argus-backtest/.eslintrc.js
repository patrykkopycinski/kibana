/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  overrides: [
    // Server-only package: spec-alignment test reads the backtester YAML
    // from disk. Node.js builtins (fs/promises, path) are intentional.
    {
      files: ['**/*.{js,mjs,ts,tsx}'],
      rules: {
        'import/no-nodejs-modules': 'off',
      },
    },
  ],
};
