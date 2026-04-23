/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import {
  RECENT_PROPOSALS_ROUTE,
  type ArgusSynthesisRecentResponse,
  type ArgusSynthesisWindow,
} from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UseRecentProposalsArgs {
  readonly http: ArgusHttp;
  readonly window?: ArgusSynthesisWindow;
  readonly limit?: number;
  readonly enabled?: boolean;
  readonly refreshIntervalMs?: number;
}

/**
 * Hook backing the global "Proposals" tab. Returns recent synthesis
 * decisions across CVEs for the requested time window.
 */
export const useRecentProposals = ({
  http,
  window = '24h',
  limit,
  enabled = true,
  refreshIntervalMs,
}: UseRecentProposalsArgs): FetchState<ArgusSynthesisRecentResponse> => {
  const [state, setState] = useState<FetchState<ArgusSynthesisRecentResponse>>({
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
        .fetch<ArgusSynthesisRecentResponse>(RECENT_PROPOSALS_ROUTE, {
          method: 'GET',
          version: '1',
          query: {
            window,
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
  }, [http, window, limit, enabled, refreshIntervalMs]);

  return state;
};
