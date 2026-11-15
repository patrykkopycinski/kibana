/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonateTask, DetonateTaskUpdate } from '../../../../../common/detonate_prototype';
import { isDetonationComplete } from '../../../../../common/detonate_prototype';

/**
 * Milliseconds from submission to the run's last worker update. The task
 * carries only `created_at`, so the completion time is the newest entry of the
 * update history. Undefined while the run is queued or running, or when the
 * history has not loaded.
 */
export const getDetonationDurationMs = (
  task: DetonateTask,
  updates: DetonateTaskUpdate[] | undefined
): number | undefined => {
  if (!isDetonationComplete(task) || !updates?.length) return undefined;
  // One unparseable timestamp would make Math.max return NaN and hide the duration.
  const times = updates.map(({ timestamp }) => Date.parse(timestamp)).filter(Number.isFinite);
  if (!times.length) return undefined;
  const finishedAt = Math.max(...times);
  const duration = finishedAt - Date.parse(task.created_at);
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
};

/** Compact duration, e.g. "2m 05s" or "45s". */
export const formatDetonationDuration = (durationMs: number): string => {
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
};
