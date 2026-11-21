/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonateTask } from '../../../../../common/detonate_prototype';
import { DETONATE_PIPELINE_WORKERS } from '../../../../../common/detonate_prototype';

/**
 * True once the VM has been asked for: the run got past its first worker (task
 * preparation). Fields that come from the VM mean nothing before that.
 */
export const isDetonationVmStarted = (task: DetonateTask): boolean =>
  (DETONATE_PIPELINE_WORKERS as readonly string[]).indexOf(task.last_worker_name) >= 1;
