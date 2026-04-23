/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import { E2D_RECENT_CVES_ROUTE, type ArgusE2dRecentCvesResponse } from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UseRecentCvesArgs {
  readonly http: ArgusHttp;
  readonly kevOnly?: boolean;
  readonly limit?: number;
  readonly enabled?: boolean;
  readonly refreshIntervalMs?: number;
}

/**
 * Hook backing the CVE picker. Returns a list of recently-ingested CVE
 * advisories (newest first), optionally filtered to CISA KEV entries.
 */
export const useRecentCves = ({
  http,
  kevOnly = false,
  limit,
  enabled = true,
  refreshIntervalMs,
}: UseRecentCvesArgs): FetchState<ArgusE2dRecentCvesResponse> => {
  const [state, setState] = useState<FetchState<ArgusE2dRecentCvesResponse>>({
    status: enabled ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;

    if (!enabled) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }

    let hasFirstResult = false;
    setState({ status: 'loading' });

    const runFetch = () => {
      http
        .fetch<ArgusE2dRecentCvesResponse>(E2D_RECENT_CVES_ROUTE, {
          method: 'GET',
          version: '1',
          query: {
            kev_only: kevOnly,
            ...(typeof limit === 'number' ? { limit } : {}),
          },
        })
        .then((data) => {
          if (aborted.current) return;
          hasFirstResult = true;
          setState({ status: 'success', data });
        })
        .catch((err: unknown) => {
          if (aborted.current) return;
          const error = err instanceof Error ? err : new Error(String(err));
          if (!hasFirstResult) {
            setState({ status: 'error', error });
          }
        });
    };

    runFetch();

    if (!refreshIntervalMs || refreshIntervalMs <= 0) {
      return () => {
        aborted.current = true;
      };
    }

    const handle = setInterval(runFetch, refreshIntervalMs);
    return () => {
      aborted.current = true;
      clearInterval(handle);
    };
  }, [http, kevOnly, limit, enabled, refreshIntervalMs]);

  return state;
};
