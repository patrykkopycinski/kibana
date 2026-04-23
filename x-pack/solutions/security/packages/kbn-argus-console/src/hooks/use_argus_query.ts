/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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

export const mapArgusQueryToFetchState = <T,>(result: UseArgusQueryResult<T>): FetchState<T> => {
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

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const showLoading = !silentPolling || !silentHadSuccessRef.current;
    if (showLoading) {
      setStatus('loading');
    }

    try {
      const fetchOptions: Record<string, unknown> = {
        method,
        version,
        signal: controller.signal,
      };
      if (method === 'GET' && params !== undefined) {
        fetchOptions.query = params;
      }
      if (method === 'POST' && body !== undefined) {
        fetchOptions.body = JSON.stringify(body);
      }

      const raw = await http.fetch(route, fetchOptions);
      const result = transform ? transform(raw) : (raw as TData);
      setData(result);
      setStatus('success');
      setError(undefined);
      silentHadSuccessRef.current = true;
      setHasFirstResult(true);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      const nextError = err instanceof Error ? err : new Error(String(err));
      if (!silentPolling || !silentHadSuccessRef.current) {
        setError(nextError);
        setStatus('error');
      }
    }
  }, [http, enabled, route, method, params, body, transform, version, silentPolling]);

  useEffect(() => {
    silentHadSuccessRef.current = false;
    setHasFirstResult(false);
    if (!enabled) {
      setStatus('idle');
      setData(undefined);
      setError(undefined);
      return () => {
        abortRef.current?.abort();
      };
    }

    void fetchData();

    if (!pollIntervalMs || pollIntervalMs <= 0) {
      return () => {
        abortRef.current?.abort();
      };
    }

    const id = setInterval(() => {
      void fetchData();
    }, pollIntervalMs);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
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
