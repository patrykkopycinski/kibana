/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import { E2D_FLOW_ROUTE, type ArgusE2dFlowResponse } from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export type E2dFlowWindow = '24h' | '7d';

export interface UseE2dFlowArgs {
  readonly http: ArgusHttp;
  readonly cve: string | undefined;
  readonly window: E2dFlowWindow;
  readonly enabled?: boolean;
  /**
   * Optional silent refresh. Like the other ARGUS hooks, refreshes keep the
   * previous data on-screen instead of flashing back to a loading state.
   */
  readonly refreshIntervalMs?: number;
}

/**
 * Hook for the "Exploit -> Detection" timeline panel. Fetches the narrative
 * flow for a single CVE, with optional silent polling so the `running` stage
 * flips to live as new alert hits arrive.
 */
export const useE2dFlow = ({
  http,
  cve,
  window,
  enabled = true,
  refreshIntervalMs,
}: UseE2dFlowArgs): FetchState<ArgusE2dFlowResponse> => {
  const [state, setState] = useState<FetchState<ArgusE2dFlowResponse>>({
    status: enabled && cve ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;

    if (!enabled || !cve) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }

    let hasFirstResult = false;
    setState({ status: 'loading' });

    const runFetch = () => {
      http
        .fetch<ArgusE2dFlowResponse>(E2D_FLOW_ROUTE, {
          method: 'GET',
          version: '1',
          query: { cve, window },
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
  }, [http, cve, window, enabled, refreshIntervalMs]);

  return state;
};
