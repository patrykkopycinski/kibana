/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import {
  MUTATIONS_ROUTE,
  type ArgusMutationFilter,
  type ArgusMutationWindow,
  type ArgusMutationsResponse,
} from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UseMutationsArgs {
  readonly http: ArgusHttp;
  readonly filter: ArgusMutationFilter;
  readonly window: ArgusMutationWindow;
  readonly enabled?: boolean;
  /**
   * When set to a positive number, the hook silently re-fetches on an
   * interval. Like the pulse hook, refreshes do NOT flip back to `loading`
   * so the table doesn't flash during a demo.
   */
  readonly refreshIntervalMs?: number;
}

export const useMutations = ({
  http,
  filter,
  window,
  enabled = true,
  refreshIntervalMs,
}: UseMutationsArgs): FetchState<ArgusMutationsResponse> => {
  const [state, setState] = useState<FetchState<ArgusMutationsResponse>>({
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
        .fetch<ArgusMutationsResponse>(MUTATIONS_ROUTE, {
          method: 'GET',
          version: '1',
          query: { filter, window },
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
  }, [http, enabled, filter, window, refreshIntervalMs]);

  return state;
};
