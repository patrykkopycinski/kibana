/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  KILL_SWITCH_ROUTE,
  type ArgusKillSwitchResponse,
  type ArgusKillSwitchToggleRequest,
  type ArgusKillSwitchToggleResponse,
} from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UseKillSwitchArgs {
  readonly http: ArgusHttp;
  readonly enabled?: boolean;
  readonly refreshIntervalMs?: number;
}

export interface UseKillSwitchResult {
  readonly state: FetchState<ArgusKillSwitchResponse>;
  /**
   * Posts a toggle request. Resolves with the server's updated response when
   * the write succeeds, and rejects with the raw error otherwise. The hook
   * applies an optimistic update before the round-trip and automatically
   * rolls back if the write fails.
   */
  readonly toggle: (request: ArgusKillSwitchToggleRequest) => Promise<ArgusKillSwitchToggleResponse>;
  /** `true` while a POST is in flight (used by the header chip spinner). */
  readonly toggling: boolean;
}

export const useKillSwitch = ({
  http,
  enabled = true,
  refreshIntervalMs,
}: UseKillSwitchArgs): UseKillSwitchResult => {
  const [state, setState] = useState<FetchState<ArgusKillSwitchResponse>>({
    status: enabled ? 'loading' : 'idle',
  });
  const [toggling, setToggling] = useState(false);
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
        .fetch<ArgusKillSwitchResponse>(KILL_SWITCH_ROUTE, { method: 'GET', version: '1' })
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
  }, [http, enabled, refreshIntervalMs]);

  const toggle = useCallback(
    async (request: ArgusKillSwitchToggleRequest): Promise<ArgusKillSwitchToggleResponse> => {
      setToggling(true);
      // Snapshot the last-known-good state so we can roll back on failure.
      const previous = state.status === 'success' ? state.data : undefined;
      // Optimistic update: flip the chip immediately so the UI feels snappy.
      if (previous) {
        setState({
          status: 'success',
          data: {
            state: { ...previous.state, autonomy_enabled: request.autonomy_enabled },
            bootstrap: false,
          },
        });
      }
      try {
        const data = await http.fetch<ArgusKillSwitchToggleResponse>(KILL_SWITCH_ROUTE, {
          method: 'POST',
          version: '1',
          body: JSON.stringify(request),
        });
        setState({
          status: 'success',
          data: { state: data.state, bootstrap: data.bootstrap ?? false },
        });
        return data;
      } catch (err) {
        // Roll back the optimistic update and rethrow so the UI can surface a
        // toast.
        if (previous) setState({ status: 'success', data: previous });
        throw err;
      } finally {
        setToggling(false);
      }
    },
    [http, state]
  );

  return { state, toggle, toggling };
};
