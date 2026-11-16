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

import { useCallback, useEffect, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@kbn/react-query';

import { useKibana } from '../../common/lib/kibana';
import {
  DETONATION_RUN_MAX_AGE_MS,
  DETONATION_RUNS_DEFAULT_PAGE_SIZE,
  DETONATION_RUNS_MAX_RESULT_WINDOW,
  isDetonationComplete,
  isDetonationFailed,
  quoteQueryValue,
} from '../../../common/detonate_prototype';
import type {
  DetonateRunDiffEmpty,
  DetonateRunDiffResult,
  DetonateRunSessionResult,
  DetonateTask,
  DetonateTaskSearchResponse,
  DetonateTaskUpdate,
  DetonateUsage,
  DetonationRecord,
  DetonationRunsQuery,
  DetonationRunsResponse,
} from '../../../common/detonate_prototype';
import { detonateApi } from '../api/client';
import type { SubmitFileParams, SubmitHashParams } from '../api/client';
import { useTrackDetonation } from '../components/detonation_notifier';

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
const recordKey = (taskId: string) => [DETONATE_QUERY_KEY, 'record', taskId] as const;
const sessionKey = (taskId: string) => [DETONATE_QUERY_KEY, 'session', taskId] as const;
const diffKey = (taskId: string) => [DETONATE_QUERY_KEY, 'diff', taskId] as const;
const usageKey = [DETONATE_QUERY_KEY, 'usage'] as const;

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

/**
 * The run as one flat record, read once the run is over. The route re-reads
 * the run's alerts and upserts the stored record on every call, so it is not
 * polled: indicators come from alerts, which are final only when the run is.
 */
export const useDetonationRecord = (taskId: string | undefined, isComplete: boolean) => {
  const { http } = useKibana().services;

  return useQuery<DetonationRecord>({
    queryKey: recordKey(taskId ?? ''),
    enabled: Boolean(taskId) && isComplete,
    queryFn: ({ signal }) => detonateApi.getRunRecord(http, taskId as string, signal),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
};

/**
 * Month-to-date usage against the space's allowance. Cached for a minute:
 * the modal reads it on open, and a stale-by-seconds count is fine. Kibana
 * does not enforce the allowance on submit; the modal only reads this to block
 * the button, and the external service's own quota (429) is the only
 * server-side refusal.
 */
export const useDetonateUsage = () => {
  const { http } = useKibana().services;

  return useQuery<DetonateUsage>({
    queryKey: usageKey,
    queryFn: ({ signal }) => detonateApi.getUsage(http, signal),
    staleTime: 60_000,
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
 * A run on a VM; the table keeps polling while it sees one. Deliberate difference from the epic
 * ("queued or running"): `DetonationRunStatus` has no queued state yet, so only running counts.
 */
const isRunInFlight = (run: DetonationRecord): boolean =>
  run['detonate.state'] === 'running' &&
  Date.now() - Date.parse(run['@timestamp']) < DETONATION_RUN_MAX_AGE_MS;

/**
 * Runs for the Detonations table, loaded a page at a time as the table asks for more. Polls only
 * while a loaded row is running, so an idle table makes no requests. The key sits under
 * `[DETONATE_QUERY_KEY, 'tasks']`, so a submit invalidates it with the task lists.
 */
export const useDetonationRuns = (query: Omit<DetonationRunsQuery, 'from'>) => {
  const { http } = useKibana().services;

  const result = useInfiniteQuery<DetonationRunsResponse, Error>({
    queryKey: [DETONATE_QUERY_KEY, 'tasks', 'runs', query],
    queryFn: ({ signal, pageParam = 0 }: { signal?: AbortSignal; pageParam?: number }) =>
      detonateApi.searchRuns(http, { ...query, from: pageParam }, signal),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.hits.length, 0);
      // Elasticsearch refuses `from + size` past the result window; the route rejects it too.
      const size = query.size ?? DETONATION_RUNS_DEFAULT_PAGE_SIZE;
      if (loaded + size > DETONATION_RUNS_MAX_RESULT_WINDOW) return undefined;
      return lastPage.hits.length > 0 && loaded < lastPage.total ? loaded : undefined;
    },
    keepPreviousData: true,
  });

  const { data, refetch } = result;
  const shouldPoll = Boolean(data?.pages.some((page) => page.hits.some(isRunInFlight)));
  useEffect(() => {
    if (!shouldPoll) return;
    // Re-reads only the pages that hold a running row, not every page scrolled. Offsets can drift
    // between pages (a new run shifts rows down) until the next full load; accepted.
    // `refetchPage` is accepted by `refetch`, not by the query options, hence the manual interval.
    const timer = setInterval(() => {
      refetch({ refetchPage: (page: DetonationRunsResponse) => page.hits.some(isRunInFlight) });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [shouldPoll, refetch]);

  return result;
};

/**
 * Session View config for a run (N1). One fetch per run: the route's copy of
 * the run's events into the sandbox stream is idempotent, so re-mounting the
 * tab re-copies nothing new and never mutates beyond the first call.
 */
export const useRunSession = (taskId: string | undefined) => {
  const { http } = useKibana().services;

  return useQuery<DetonateRunSessionResult>({
    queryKey: sessionKey(taskId ?? ''),
    enabled: Boolean(taskId),
    queryFn: ({ signal }) => detonateApi.getRunSession(http, taskId as string, signal),
    staleTime: 60_000,
  });
};

/**
 * Behavior diff against the previous run of the same sample (N2). Like the
 * session fetch: one per run, idempotent server-side (the route copies both
 * runs' telemetry before diffing), so re-mounting re-answers, it does not
 * re-mutate. The result is null-shaped when this is the sample's first run.
 */
export const useRunDiff = (taskId: string | undefined) => {
  const { http } = useKibana().services;

  return useQuery<DetonateRunDiffResult | DetonateRunDiffEmpty>({
    queryKey: diffKey(taskId ?? ''),
    enabled: Boolean(taskId),
    queryFn: ({ signal }) => detonateApi.getRunDiff(http, taskId as string, undefined, signal),
    staleTime: 60_000,
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
    queryFn: ({ signal }) =>
      detonateApi.listTasks(
        http,
        { query_string: `sample_hash:${quoteQueryValue(hash ?? '')}` },
        signal
      ),
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
 * F7: every completed run for one sample hash, newest first — the run history
 * the learning tier reads. Three benign runs in a row is the evidence an
 * exception/trusted-app proposal cites, so the shape is exactly "the runs that
 * count toward that decision", pre-filtered the same way
 * `useCompletedDetonationByHash` filters.
 */
export const useCompletedDetonationHistoryByHash = (hash: string | undefined) => {
  const { http } = useKibana().services;

  const query = useQuery<DetonateTaskSearchResponse>({
    queryKey: [DETONATE_QUERY_KEY, 'tasks', 'history-by-hash', hash ?? ''] as const,
    enabled: Boolean(hash),
    queryFn: ({ signal }) =>
      detonateApi.listTasks(
        http,
        { query_string: `sample_hash:${quoteQueryValue(hash ?? '')}` },
        signal
      ),
    staleTime: 60_000,
  });

  return useMemo(() => {
    const completed = (query.data?.tasks ?? [])
      .filter((t) => t.sample_hash === hash && isDetonationComplete(t) && !isDetonationFailed(t))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { ...query, completedRuns: completed };
  }, [hash, query]);
};

/**
 * Submitting invalidates the list so a new run shows up without a manual
 * refresh, and the usage query so the allowance line counts the new run. It
 * deliberately does not invalidate on error: a failed submit may still have
 * reached the service, and refetching would not tell us either way.
 */
const useInvalidateAfterSubmit = () => {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [DETONATE_QUERY_KEY, 'tasks'] }),
        queryClient.invalidateQueries({ queryKey: usageKey }),
      ]),
    [queryClient]
  );
};

export const useSubmitHash = () => {
  const { http } = useKibana().services;
  const invalidate = useInvalidateAfterSubmit();
  const track = useTrackDetonation();

  return useMutation<DetonateTask, Error, SubmitHashParams>({
    mutationFn: (request) => detonateApi.submitHash(http, request),
    onSuccess: (result) => {
      invalidate();
      track(result.id);
    },
  });
};

export const useSubmitFile = () => {
  const { http } = useKibana().services;
  const invalidate = useInvalidateAfterSubmit();
  const track = useTrackDetonation();

  return useMutation<DetonateTask, Error, SubmitFileParams>({
    mutationFn: (params) => detonateApi.submitFile(http, params),
    onSuccess: (result) => {
      invalidate();
      track(result.id);
    },
  });
};
