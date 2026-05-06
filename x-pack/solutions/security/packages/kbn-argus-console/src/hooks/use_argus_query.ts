/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ArgusHttp, FetchState } from './types';

export type ArgusQueryStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseArgusQueryOptions<TParams, TData> {
  readonly http: ArgusHttp;
  readonly enabled?: boolean;
  readonly route: string;
  readonly method?: 'GET' | 'POST';
  readonly params?: TParams;
  readonly body?: TParams;
  readonly pollIntervalMs?: number;
  readonly transform?: (raw: unknown) => TData;
  /**
   * Versioned route header for Kibana `http.fetch`.
   */
  readonly version?: string;
  /**
   * When true, only the first in-flight request sets `loading`. After the first
   * successful response, later poll cycles update `data` without flashing
   * `loading`, and errors are ignored (first-fetch errors still surface).
   */
  readonly silentPolling?: boolean;
}

export interface UseArgusQueryResult<TData> {
  readonly data: TData | undefined;
  readonly status: ArgusQueryStatus;
  readonly error: Error | undefined;
  readonly hasFirstResult: boolean;
  readonly refetch: () => void;
}

export const mapArgusQueryToFetchState = <T>(result: UseArgusQueryResult<T>): FetchState<T> => {
  switch (result.status) {
    case 'idle':
      return { status: 'idle' };
    case 'loading':
      return { status: 'loading' };
    case 'success':
      return { status: 'success', data: result.data as T };
    case 'error':
      return { status: 'error', error: result.error ?? new Error('Request failed') };
  }
};

export const useArgusQuery = <TParams = unknown, TData = unknown>(
  options: UseArgusQueryOptions<TParams, TData>
): UseArgusQueryResult<TData> => {
  const {
    http,
    enabled = true,
    route,
    method = 'GET',
    params,
    body,
    pollIntervalMs,
    transform,
    version = '1',
    silentPolling = false,
  } = options;

  const [data, setData] = useState<TData | undefined>();
  const [status, setStatus] = useState<ArgusQueryStatus>(enabled ? 'loading' : 'idle');
  const [error, setError] = useState<Error | undefined>();
  const [hasFirstResult, setHasFirstResult] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const silentHadSuccessRef = useRef(false);
  // Tracks whether a request kicked off by *this* fetchData reference is
  // still in flight. We use this to skip overlapping poll cycles instead of
  // aborting them — aborting a slow request only to start a new one
  // produces a self-DoS pattern where every poll kills the request that
  // was about to resolve, leaving status stuck on `loading`.
  const inFlightRef = useRef(false);
  // Stabilise the `transform` callback that callers commonly pass inline
  // (`transform: (raw) => raw as Foo`). Putting it in the useCallback dep
  // array directly would make fetchData a new reference on every parent
  // render and re-trigger the effect, leading to an abort/restart loop.
  // Holding it in a ref keeps the dep array stable while still picking up
  // the latest function on the next fetch.
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  });

  // `params` and `body` are JSON-stringified once per render and threaded
  // directly through the dep array. Structurally-identical inline object
  // literals therefore produce a stable key, so fetchData does not get
  // rebuilt unless the request payload actually changed. We also read the
  // serialized form *inside* fetchData (parsing for GET query params,
  // forwarding as-is for POST bodies) so the linter sees the keys as real
  // dependencies rather than dead identifiers.
  const paramsKey = useMemo(() => {
    if (params === undefined) return undefined;
    try {
      return JSON.stringify(params);
    } catch {
      return undefined;
    }
  }, [params]);
  const bodyKey = useMemo(() => {
    if (body === undefined) return undefined;
    try {
      return JSON.stringify(body);
    } catch {
      return undefined;
    }
  }, [body]);

  // We deliberately use a Promise chain rather than async/await here.
  // The success / error / finally handlers all mutate refs that are also
  // read at the top of the function (`inFlightRef`, `silentHadSuccessRef`).
  // Under async/await, ESLint's `require-atomic-updates` rule treats the
  // ref-write-after-await pattern as a potential race even when, by
  // construction, no concurrent writer can run between the read and the
  // write (we early-exit if `inFlightRef.current` is already true). The
  // promise-chain form has identical semantics and steers clear of the
  // false positive.
  const fetchData = useCallback((): Promise<void> => {
    if (!enabled) return Promise.resolve();
    // Overlap protection: if a previous fetch is still in flight, let it
    // finish. A subsequent poll tick or `refetch()` call will pick up
    // fresh data on the next cycle. This is intentional — for routes
    // whose ES queries can exceed the poll interval (e.g. governance
    // pulse fanning out across 4 indices), aborting and restarting on
    // every tick would prevent the request from ever resolving.
    if (inFlightRef.current) return Promise.resolve();
    inFlightRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    const shouldShowLoading = !silentPolling || !silentHadSuccessRef.current;
    if (shouldShowLoading) {
      setStatus('loading');
    }

    const fetchOptions: Record<string, unknown> = {
      method,
      version,
      signal: controller.signal,
    };
    if (method === 'GET' && paramsKey !== undefined) {
      try {
        fetchOptions.query = JSON.parse(paramsKey) as TParams;
      } catch {
        // paramsKey is produced via JSON.stringify above; if it ever
        // fails to parse we simply omit the query rather than throwing.
      }
    }
    if (method === 'POST' && bodyKey !== undefined) {
      fetchOptions.body = bodyKey;
    }

    return Promise.resolve(http.fetch(route, fetchOptions))
      .then(
        (raw) => {
          const transformFn = transformRef.current;
          const result = transformFn ? transformFn(raw) : (raw as TData);
          setData(result);
          setStatus('success');
          setError(undefined);
          silentHadSuccessRef.current = true;
          setHasFirstResult(true);
        },
        (err) => {
          if ((err as Error | undefined)?.name === 'AbortError') return;
          const nextError = err instanceof Error ? err : new Error(String(err));
          if (!silentPolling || !silentHadSuccessRef.current) {
            setError(nextError);
            setStatus('error');
          }
        }
      )
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [http, enabled, route, method, paramsKey, bodyKey, version, silentPolling]);

  useEffect(() => {
    silentHadSuccessRef.current = false;
    setHasFirstResult(false);
    if (!enabled) {
      setStatus('idle');
      setData(undefined);
      setError(undefined);
      inFlightRef.current = false;
      return () => {
        abortRef.current?.abort();
        inFlightRef.current = false;
      };
    }

    // A dependency change (params, route, enabled→true) makes any prior
    // in-flight request stale. The cleanup of the previous effect aborted
    // it; reset the in-flight flag synchronously so the new fetch can
    // proceed without waiting for the abort microtask to settle.
    inFlightRef.current = false;

    void fetchData();

    if (!pollIntervalMs || pollIntervalMs <= 0) {
      return () => {
        abortRef.current?.abort();
        inFlightRef.current = false;
      };
    }

    const id = setInterval(() => {
      void fetchData();
    }, pollIntervalMs);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
      inFlightRef.current = false;
    };
  }, [enabled, fetchData, pollIntervalMs]);

  return {
    data,
    status,
    error,
    hasFirstResult,
    refetch: fetchData,
  };
};
