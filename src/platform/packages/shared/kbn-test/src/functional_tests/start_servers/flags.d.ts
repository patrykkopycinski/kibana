/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FlagsReader, FlagOptions } from '@kbn/dev-cli-runner';
import type { EsVersion } from '../../functional_test_runner';
export type StartServerOptions = ReturnType<typeof parseFlags>;
export declare const FLAG_OPTIONS: FlagOptions;
export declare function parseFlags(flags: FlagsReader): {
  config: string;
  esFrom: 'serverless' | 'snapshot' | 'source' | undefined;
  esVersion: EsVersion;
  installDir: string | undefined;
  logsDir: string | undefined;
};
