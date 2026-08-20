/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SomeDevLog } from '@kbn/some-dev-log';
/**
 * Information about how CiStatsReporter should talk to the ci-stats service. Normally
 * it is read from a JSON environment variable using the `parseConfig()` function
 * exported by this module.
 */
export interface Config {
  /** ApiToken necessary for writing build data to ci-stats service */
  apiToken: string;
  /**
   * uuid which should be obtained by first creating a build with the
   * ci-stats service and then passing it to all subsequent steps
   */
  buildId: string;
}
export declare function parseConfig(log: SomeDevLog): Config | undefined;
