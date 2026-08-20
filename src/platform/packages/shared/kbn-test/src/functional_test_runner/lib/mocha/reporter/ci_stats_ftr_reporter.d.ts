/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CiStatsReporter } from '@kbn/ci-stats-reporter';
import type { Config } from '../../config';
import type { Runner } from '../../../fake_mocha_types';
import type { Lifecycle } from '../../lifecycle';
export declare function setupCiStatsFtrTestGroupReporter({
  config,
  lifecycle,
  runner,
  reporter,
}: {
  config: Config;
  lifecycle: Lifecycle;
  runner: Runner;
  reporter: CiStatsReporter;
}): void;
