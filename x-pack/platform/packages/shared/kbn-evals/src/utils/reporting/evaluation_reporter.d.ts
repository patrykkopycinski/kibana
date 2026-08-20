/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SomeDevLog } from '@kbn/some-dev-log';
import type { EvalsClient } from '../evals_client';
import type { ReportDisplayOptions } from '../../types';
export type EvaluationReporter = (
  evalsClient: EvalsClient,
  experimentId: string,
  log: SomeDevLog,
  options?: {
    taskModelId?: string;
    suiteId?: string;
    executionId?: string;
  }
) => Promise<void>;
export declare function createDefaultTerminalReporter(options?: {
  reportDisplayOptions?: ReportDisplayOptions;
}): EvaluationReporter;
