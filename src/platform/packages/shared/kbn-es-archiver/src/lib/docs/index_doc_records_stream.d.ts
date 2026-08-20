/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Client } from '@elastic/elasticsearch';
import type { Writable } from 'stream';
import type { Stats } from '../stats';
import type { Progress } from '../progress';
export declare function createIndexDocRecordsStream(
  client: Client,
  stats: Stats,
  progress: Progress,
  useCreate?: boolean,
  performance?: LoadActionPerfOptions,
  targetsWithoutIdGeneration?: string[]
): Writable;
export interface LoadActionPerfOptions {
  batchSize?: number;
  concurrency?: number;
}
