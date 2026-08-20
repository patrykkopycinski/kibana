/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Evaluator } from '../../types';
export declare function createSkillInvocationEvaluator({
  traceEsClient,
  log,
  skillName,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
  skillName: string;
}): Evaluator;
