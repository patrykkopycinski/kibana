/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import {
  AUTONOMY_DECISIONS_ROUTE,
  type ArgusAutonomyResponse,
  type ArgusAutonomyWindow,
} from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UseAutonomyDecisionsArgs {
  readonly http: ArgusHttp;
  readonly window: ArgusAutonomyWindow;
  readonly limit?: number;
  readonly enabled?: boolean;
  /**
   * When set, the hook silently re-fetches on an interval. Refreshes do NOT
   * flip the state back to `loading`, so the panel does not flash during a
   * demo.
   */
  readonly refreshIntervalMs?: number;
}

export const useAutonomyDecisions = ({
  http,
  window,
  limit,
  enabled = true,
  refreshIntervalMs,
}: UseAutonomyDecisionsArgs): FetchState<ArgusAutonomyResponse> => {
  const [state, setState] = useState<FetchState<ArgusAutonomyResponse>>({
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

    const query: Record<string, string | number> = { window };
    if (limit !== undefined) query.limit = limit;

    const runFetch = () => {
      http
        .fetch<ArgusAutonomyResponse>(AUTONOMY_DECISIONS_ROUTE, {
          method: 'GET',
          version: '1',
          query,
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
  }, [http, enabled, window, limit, refreshIntervalMs]);

  return state;
};
