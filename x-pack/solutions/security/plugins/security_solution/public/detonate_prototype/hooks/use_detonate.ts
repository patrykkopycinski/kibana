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

import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@kbn/react-query';

import { useKibana } from '../../common/lib/kibana';
import {
  isDetonationComplete,
  isDetonationFailed,
} from '../../../common/detonate_prototype';
import type {
  DetonateHashRequest,
  DetonateTask,
  DetonateTaskSearchResponse,
  DetonateTaskUpdate,
} from '../../../common/detonate_prototype';
import { detonateApi } from '../api/client';
import type { DetonateSubmitResult, SubmitFileParams } from '../api/client';
import { useTrackDetonation } from '../components/detonation_notifier';

/**
 * A detonation runs for minutes, so polling faster than this only adds load.
 * Slow enough not to hammer the service, fast enough that the page feels live.
 */
const POLL_INTERVAL_MS = 5_000;

export const DETONATE_QUERY_KEY = 'detonate_prototype' as const;

export interface DetonateListQuery {
  query_string?: string;
  alert_id?: string;
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
 * Runs→alerts reverse index: every run started from one alert. The `alert:<id>`
 * tag written by the alert action is resolved server-side, so this hook (and
 * anything built on it) never needs to know the tag convention.
 */
export const useDetonationTasksForAlert = (alertId: string | undefined) => {
  const { http } = useKibana().services;

  return useQuery<DetonateTaskSearchResponse>({
    queryKey: [DETONATE_QUERY_KEY, 'tasks', 'alert', alertId ?? ''] as const,
    enabled: Boolean(alertId),
    queryFn: ({ signal }) => detonateApi.listTasksForAlert(http, alertId as string, signal),
  });
};

/**
 * Rung 1 of the sourcing ladder: the most recent completed run for a sample
 * hash, if one exists. When this resolves, the alert action offers "View
 * detonation report" instead of spending a new VM — and the analyst is one
 * click from the answer that already exists.
 */
export const useCompletedDetonationByHash = (hash: string | undefined) => {
  const { http } = useKibana().services;

  const query = useQuery<DetonateTaskSearchResponse>({
    queryKey: [DETONATE_QUERY_KEY, 'tasks', 'by-hash', hash ?? ''] as const,
    enabled: Boolean(hash),
    queryFn: ({ signal }) => detonateApi.listTasks(http, { query_string: hash }, signal),
    staleTime: 60_000,
  });

  return useMemo(() => {
    const completed = (query.data?.tasks ?? [])
      .filter((t) => t.sample_hash === hash && isDetonationComplete(t) && !isDetonationFailed(t))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { ...query, completedRun: completed[0] };
  }, [hash, query]);
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
  const track = useTrackDetonation();

  return useMutation<DetonateSubmitResult, Error, DetonateHashRequest>({
    mutationFn: (request) => detonateApi.submitHash(http, request),
    onSuccess: (result) => {
      invalidate();
      // A deduplicated answer is a completed report, not a new run — nothing
      // to track. A new run is in flight and owns a completion notification.
      if (!result.deduplicated) track(result.id);
    },
  });
};

export const useSubmitFile = () => {
  const { http } = useKibana().services;
  const invalidate = useInvalidateTaskList();
  const track = useTrackDetonation();

  return useMutation<DetonateSubmitResult, Error, SubmitFileParams>({
    mutationFn: (params) => detonateApi.submitFile(http, params),
    onSuccess: (result) => {
      invalidate();
      if (!result.deduplicated) track(result.id);
    },
  });
};
