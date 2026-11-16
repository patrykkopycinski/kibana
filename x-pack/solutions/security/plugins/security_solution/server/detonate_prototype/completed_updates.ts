/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import { isDetonationComplete } from '../../common/detonate_prototype';
import type { DetonateTask, DetonateTaskUpdate } from '../../common/detonate_prototype';
import type { DetonateClient } from './client';

/**
 * The run's updates, for the duration on its record, read only once the task has finished:
 * a running task has no end yet, so its poll ticks cost nothing extra. Best-effort, so a
 * failed read writes the record without a duration; a later write keeps one already stored.
 */
export const readCompletedUpdates = async (
  client: DetonateClient,
  task: DetonateTask,
  logger: Logger
): Promise<DetonateTaskUpdate[]> => {
  if (!isDetonationComplete(task)) return [];
  try {
    return await client.getTaskUpdates(task.id);
  } catch (error) {
    logger.debug(`Detonation ${task.id}: could not read updates: ${error}`);
    return [];
  }
};
