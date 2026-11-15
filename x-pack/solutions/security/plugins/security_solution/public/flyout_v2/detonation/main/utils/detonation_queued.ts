/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonateTask } from '../../../../../common/detonate_prototype';
import { DETONATE_WORKERS, isDetonationComplete } from '../../../../../common/detonate_prototype';

/**
 * True while no VM work has begun: no worker has reported yet, or the first
 * worker (task preparation) is still running. The service has no "queued"
 * status of its own, so this is derived from the last worker update.
 */
export const isDetonationQueued = (task: DetonateTask): boolean =>
  !isDetonationComplete(task) &&
  (!task.last_worker_name ||
    (task.last_worker_name === DETONATE_WORKERS[0] && task.last_worker_status === 'started'));
