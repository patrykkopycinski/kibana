/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KbnClient, ScoutLogger } from '../../../../../../common';
export interface CoreApiService {
  /** * When running in test environments, the Config overrides can be updated without restarting Kibana
   * @param configOverrides - The configuration overrides to apply.
   * @example
   * ```ts
   * await coreApi.settings({
   *   'feature_flags.overrides': {
   *     'my-feature-flag': 'my-forced-value',
   *   }
   * });
   * ```
   */
  settings: (configOverrides: Record<string, any>) => Promise<void>;
}
export declare const getCoreApiHelper: (log: ScoutLogger, kbnClient: KbnClient) => CoreApiService;
