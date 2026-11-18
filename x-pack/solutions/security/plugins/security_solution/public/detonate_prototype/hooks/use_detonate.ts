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

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@kbn/react-query';

import { useKibana } from '../../common/lib/kibana';
import { useSpaceId } from '../../common/hooks/use_space_id';
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
  DetonationRunGroupsQuery,
  DetonationRunGroupsResponse,
  DetonationRunsQuery,
  DetonationRunsResponse,
  DetonationRunStatsQuery,
  DetonationRunStatsResponse,
} from '../../../common/detonate_prototype';
import { detonateApi } from '../api/client';
import { shouldRetry } from './is_client_error';
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
export const useDetonationRuns = (
  query: Omit<DetonationRunsQuery, 'from'>,
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const { http } = useKibana().services;
  const queryClient = useQueryClient();

  const result = useInfiniteQuery<DetonationRunsResponse, Error>({
    queryKey: [DETONATE_QUERY_KEY, 'tasks', 'runs', query],
    enabled,
    queryFn: ({ signal, pageParam = 0 }: { signal?: AbortSignal; pageParam?: number }) =>
      detonateApi.searchRuns(http, { ...query, from: pageParam }, signal),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.hits.length, 0);
      // Elasticsearch refuses `from + size` past the result window; the route rejects it too.
      const size = query.size ?? DETONATION_RUNS_DEFAULT_PAGE_SIZE;
      if (loaded + size > DETONATION_RUNS_MAX_RESULT_WINDOW) return undefined;
      // Only an empty page stops. A selective refetch rebuilds each page's offset through this
      // function, so neither a refetched page's shrunken `total` nor a short page that precedes a
      // page loaded through Load more may return undefined here: react-query drops that page.
      // The cost is one empty fetch when the rows end exactly on a page boundary.
      return lastPage.hits.length > 0 ? loaded : undefined;
    },
    keepPreviousData: true,
    retry: shouldRetry,
  });

  const { data, refetch, isPreviousData } = result;
  const shouldPoll = Boolean(data?.pages.some((page) => page.hits.some(isRunInFlight)));
  // `cancelRefetch: false`: a stats search slower than the poll interval would otherwise be
  // cancelled and restarted on every tick, and never finish.
  const refreshStats = useCallback(
    () =>
      queryClient.invalidateQueries(
        { queryKey: [DETONATE_QUERY_KEY, 'tasks', 'stats'] },
        { cancelRefetch: false }
      ),
    [queryClient]
  );
  useEffect(() => {
    if (!shouldPoll) return;
    // Re-reads only the pages that hold a running row, not every page scrolled. Offsets can drift
    // between pages (a new run shifts rows down) until the next full load; accepted.
    // `refetchPage` is accepted by `refetch`, not by the query options, hence the manual interval.
    // `cancelRefetch: false`: the default cancels an in-flight Load more, whose rows would never append.
    const timer = setInterval(() => {
      // A running row may have finished and the dashboard's counts move with it. The runs response
      // is what writes the finished state to the results index, so the stats search waits for it.
      refetch({
        refetchPage: (page: DetonationRunsResponse) => page.hits.some(isRunInFlight),
        cancelRefetch: false,
      }).then(refreshStats);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [shouldPoll, refetch, refreshStats]);

  // The last running row finishing stops the polling, so no later tick would refresh the stats.
  // While a new key loads, `keepPreviousData` still shows the old key's rows: that is not polling,
  // or the new key's first result with no running row would read as a finish and refetch the stats
  // the new key has just fetched.
  const wasPolling = useRef(false);
  const isPolling = shouldPoll && !isPreviousData;
  useEffect(() => {
    if (wasPolling.current && !shouldPoll && !isPreviousData) refreshStats();
    wasPolling.current = isPolling;
  }, [shouldPoll, isPreviousData, isPolling, refreshStats]);

  return result;
};

/**
 * The dashboard's aggregates. Takes the same time + kql + search as `useDetonationRuns`, so the
 * panels and the table always describe the same runs. Under `[DETONATE_QUERY_KEY, 'tasks']`, so a
 * submit invalidates it with the lists. It does not poll itself: `useDetonationRuns` invalidates it
 * on each of its poll ticks, so a finishing run moves the counts.
 */
export const useDetonationRunStats = (query: DetonationRunStatsQuery) => {
  const { http } = useKibana().services;

  return useQuery<DetonationRunStatsResponse, Error>({
    queryKey: [DETONATE_QUERY_KEY, 'tasks', 'stats', query],
    queryFn: ({ signal }) => detonateApi.getRunStats(http, query, signal),
    keepPreviousData: true,
    retry: shouldRetry,
  });
};

/**
 * One page of run groups for the Detonations table's Group by. Under `[DETONATE_QUERY_KEY,
 * 'tasks']`, so a submit refreshes it with the lists; `useDetonationRuns` polls in-flight runs and
 * invalidates the stats, so a flat table is the one that keeps moving.
 */
export const useDetonationRunGroups = (
  query: DetonationRunGroupsQuery,
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const { http } = useKibana().services;

  return useQuery<DetonationRunGroupsResponse, Error>({
    queryKey: [DETONATE_QUERY_KEY, 'tasks', 'groups', query],
    queryFn: ({ signal }) => detonateApi.getRunGroups(http, query, signal),
    enabled,
    keepPreviousData: true,
    retry: shouldRetry,
  });
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CARD_ALERT_RUNS_SIZE = 10;

/**
 * The production alerts a run was submitted from (`detonate.origin.alert_ids`). The task route does
 * not carry them, so they come from the run's stored record; unlike {@link useDetonationRecord}
 * this only reads, and works before the run is over.
 */
export const useDetonationOriginAlertIds = (taskId: string | undefined) => {
  const { http } = useKibana().services;
  const spaceId = useSpaceId();

  return useQuery<DetonationRunsResponse, Error, string[]>({
    queryKey: [DETONATE_QUERY_KEY, 'tasks', 'origin-alert-ids', spaceId ?? '', taskId ?? ''],
    enabled: Boolean(taskId) && Boolean(spaceId),
    queryFn: ({ signal }) =>
      detonateApi.searchRuns(
        http,
        { kql: `detonate.task_id: ${quoteQueryValue(taskId ?? '')}`, size: 1 },
        signal
      ),
    select: (response) => response.hits[0]?.['detonate.origin.alert_ids'] ?? [],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: shouldRetry,
  });
};

/**
 * The alert flyout card's two runs reads: this alert's runs, and the newest run of the same file
 * from any alert. Keys sit under `[DETONATE_QUERY_KEY, 'tasks']` so a submit refreshes them.
 * The cross-alert query matches `file.hash.sha256`, so it only runs for a SHA-256.
 */
export const useDetonationCardRuns = ({
  alertId,
  hash,
}: {
  alertId: string | undefined;
  hash: string | undefined;
}) => {
  const { http } = useKibana().services;
  const sha256 = hash?.toLowerCase();
  const hasSha256 = sha256 !== undefined && SHA256_PATTERN.test(sha256);

  const poll = (data: DetonationRunsResponse | undefined) =>
    data?.hits.some(isRunInFlight) ? POLL_INTERVAL_MS : (false as const);

  const alertRuns = useQuery<DetonationRunsResponse, Error>({
    queryKey: [DETONATE_QUERY_KEY, 'tasks', 'card-alert', alertId ?? ''],
    enabled: Boolean(alertId),
    queryFn: ({ signal }) =>
      detonateApi.searchRuns(
        http,
        {
          kql: `detonate.origin.alert_ids: ${quoteQueryValue(alertId ?? '')}`,
          size: CARD_ALERT_RUNS_SIZE,
        },
        signal
      ),
    refetchInterval: poll,
    retry: shouldRetry,
  });

  const hashRuns = useQuery<DetonationRunsResponse, Error>({
    queryKey: [DETONATE_QUERY_KEY, 'tasks', 'card-hash', sha256 ?? '', alertId ?? ''],
    enabled: hasSha256 && Boolean(alertId),
    queryFn: ({ signal }) =>
      detonateApi.searchRuns(
        http,
        {
          kql:
            `file.hash.sha256: ${quoteQueryValue(sha256 ?? '')}` +
            ` and not detonate.origin.alert_ids: ${quoteQueryValue(alertId ?? '')}`,
          size: 1,
        },
        signal
      ),
    refetchInterval: poll,
    retry: shouldRetry,
  });

  return { alertRuns, hashRuns };
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
