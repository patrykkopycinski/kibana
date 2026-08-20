/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

declare const _exports: {
  REPO_ROOT: string;
  PKG_JSON: import('./types').KibanaPackageJson;
  kibanaPackageJson: import('./types').KibanaPackageJson;
  isKibanaDistributable: () => boolean;
  UPSTREAM_BRANCH: string;
  fromRoot: typeof fromRoot;
};
export = _exports;
export type KibanaPackageJson = import('./types').KibanaPackageJson;
/**
 * @param {string[]} paths
 */
declare const fromRoot: (...paths: string[]) => string;
