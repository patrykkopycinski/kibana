/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IBasePath } from '@kbn/core-http-browser';
export declare class BasePath implements IBasePath {
  private readonly basePath;
  readonly serverBasePath: string;
  readonly assetsHrefBase: string;
  readonly publicBaseUrl?: string;
  constructor({
    basePath,
    serverBasePath,
    assetsHrefBase,
    publicBaseUrl,
  }: {
    basePath: string;
    serverBasePath?: string;
    assetsHrefBase?: string;
    publicBaseUrl?: string;
  });
  get: () => string;
  prepend: (path: string) => string;
  remove: (path: string) => string;
}
