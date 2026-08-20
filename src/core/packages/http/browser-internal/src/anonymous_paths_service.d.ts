/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreService } from '@kbn/core-base-browser-internal';
import type { IAnonymousPaths, IBasePath } from '@kbn/core-http-browser';
interface Deps {
  basePath: IBasePath;
}
export declare class AnonymousPathsService
  implements CoreService<IAnonymousPaths, IAnonymousPaths>
{
  private readonly paths;
  setup({ basePath }: Deps): {
    isAnonymous: (path: string) => boolean;
    register: (path: string) => void;
    normalizePath: typeof normalizePath;
  };
  start(deps: Deps): {
    isAnonymous: (path: string) => boolean;
    register: (path: string) => void;
    normalizePath: typeof normalizePath;
  };
  stop(): void;
}
declare const normalizePath: (path: string) => string;
export {};
