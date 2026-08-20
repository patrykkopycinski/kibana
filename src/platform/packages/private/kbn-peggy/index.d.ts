/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

declare const _exports: {
  findConfigFile: typeof findConfigFile;
  getJsSource: typeof getJsSource;
  getJsSourceSync: typeof getJsSourceSync;
  requireHook: typeof requireHook;
  version: string;
};
export = _exports;
/**
 * @param {string} grammarPath
 * @returns {import('./types').Config | undefined}
 */
declare function findConfigFile(grammarPath: string): import('./types').Config | undefined;
/**
 *
 * @param {import('./types').Options} options
 * @returns {Promise<import('./types').Result>}
 */
declare function getJsSource(options: import('./types').Options): Promise<import('./types').Result>;
/**
 * @param {import('./types').SyncOptions} options
 * @returns
 */
declare function getJsSourceSync(options: import('./types').SyncOptions): {
  /**
   * The source code of the module which parses expressions in the format
   * defined by the peggy grammar file
   */
  source: string;
  /**
   * The loaded config if it was found
   */
  config: import('./types').Config | null;
};
/**
 * Registers a Node require hook for `.peggy` files.
 * Compiles grammars on-the-fly to CommonJS using `getJsSourceSync` and caches per file path.
 *
 * This is the runtime equivalent of:
 * - @kbn/peggy-loader (webpack)
 * - @kbn/test/transforms/peggy.js (jest)
 *
 * @param {{ force?: boolean }} [options]
 * When `force` is true the hook is (re)registered even if a `.peggy` handler is already
 * present. This is required under Playwright, where `@kbn/swc-register` installs a
 * `pirates`-based `.peggy` handler that reads the grammar file through Node's default `.js`
 * loader. On Node >=23.5, Playwright registers a synchronous `module.registerHooks` load hook,
 * so that default loader Babel-parses the raw grammar and throws "Missing semicolon". This
 * standalone handler compiles the grammar itself and calls `module._compile` directly, which
 * bypasses the load hook, so it must win over `@kbn/swc-register`'s chaining handler.
 */
declare function requireHook(options?: { force?: boolean }): void;
