/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — react-query hooks.
 *
 * The polling rule lives here, once. A detonation has no `status: "done"`
 * field, so every surface that watches a run has to derive completion from the
 * worker pair; `useDetonationTask` does that and stops its own interval, so no
 * caller can invent an elapsed-time rule and report completion at the wrong
 * moment — or poll forever on a run that failed.
 */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@kbn/react-query';

import { useKibana } from '../../common/lib/kibana';
import { isDetonationComplete } from '../../../common/detonate_prototype';
import type {
  DetonateHashRequest,
  DetonateTask,
  DetonateTaskSearchResponse,
  DetonateTaskUpdate,
} from '../../../common/detonate_prototype';
import { detonateApi } from '../api/client';
import type { SubmitFileParams } from '../api/client';

/**
 * A detonation runs for minutes, so polling faster than this only adds load.
 * Slow enough not to hammer the service, fast enough that the page feels live.
 */
const POLL_INTERVAL_MS = 5_000;

export const DETONATE_QUERY_KEY = 'detonate_prototype' as const;

export interface DetonateListQuery {
  query_string?: string;
  offset?: number;
  size?: number;
}

const taskKey = (taskId: string) => [DETONATE_QUERY_KEY, 'task', taskId] as const;
const updatesKey = (taskId: string) => [DETONATE_QUERY_KEY, 'updates', taskId] as const;
const listKey = (query: DetonateListQuery) => [DETONATE_QUERY_KEY, 'tasks', query] as const;

/** Is the detonation service reachable and configured? */
export const useDetonateHealthcheck = () => {
  const { http } = useKibana().services;

  return useQuery({
    queryKey: [DETONATE_QUERY_KEY, 'healthcheck'],
    queryFn: ({ signal }) => detonateApi.healthcheck(http, signal),
    // A misconfigured service should say so immediately rather than after
    // three silent retries.
    retry: false,
    staleTime: 30_000,
  });
};

/**
 * One task, polled until it completes.
 *
 * `refetchInterval` returns `false` once {@link isDetonationComplete} holds,
 * which is the only correct stop condition: a failed run is complete too, and
 * a poller that waits for the terminal worker alone never stops on failure.
 */
export const useDetonationTask = (taskId: string | undefined) => {
  const { http } = useKibana().services;

  return useQuery<DetonateTask>({
    queryKey: taskKey(taskId ?? ''),
    enabled: Boolean(taskId),
    queryFn: ({ signal }) => detonateApi.getTask(http, taskId as string, signal),
    refetchInterval: (task) =>
      task && isDetonationComplete(task) ? false : (POLL_INTERVAL_MS as number | false),
  });
};

/**
 * The worker timeline for one task. Polled on the same rule as the task
 * itself so the two never disagree about whether the run is still moving.
 */
export const useDetonationTaskUpdates = (taskId: string | undefined, isComplete: boolean) => {
  const { http } = useKibana().services;

  return useQuery<DetonateTaskUpdate[]>({
    queryKey: updatesKey(taskId ?? ''),
    enabled: Boolean(taskId),
    queryFn: ({ signal }) => detonateApi.getTaskUpdates(http, taskId as string, signal),
    refetchInterval: isComplete ? false : POLL_INTERVAL_MS,
  });
};

/** A page of past runs. */
export const useDetonationTasks = (query: DetonateListQuery) => {
  const { http } = useKibana().services;

  return useQuery<DetonateTaskSearchResponse>({
    queryKey: listKey(query),
    queryFn: ({ signal }) => detonateApi.listTasks(http, query, signal),
    // Keeps the table populated while the next page loads, instead of
    // flashing an empty state between pages.
    keepPreviousData: true,
  });
};

/**
 * Submitting invalidates the list so a new run shows up without a manual
 * refresh. It deliberately does not invalidate on error: a failed submit may
 * still have reached the service, and refetching would not tell us either way.
 */
const useInvalidateTaskList = () => {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: [DETONATE_QUERY_KEY, 'tasks'] }),
    [queryClient]
  );
};

export const useSubmitHash = () => {
  const { http } = useKibana().services;
  const invalidate = useInvalidateTaskList();

  return useMutation<DetonateTask, Error, DetonateHashRequest>({
    mutationFn: (request) => detonateApi.submitHash(http, request),
    onSuccess: invalidate,
  });
};

export const useSubmitFile = () => {
  const { http } = useKibana().services;
  const invalidate = useInvalidateTaskList();

  return useMutation<DetonateTask, Error, SubmitFileParams>({
    mutationFn: (params) => detonateApi.submitFile(http, params),
    onSuccess: invalidate,
  });
};
