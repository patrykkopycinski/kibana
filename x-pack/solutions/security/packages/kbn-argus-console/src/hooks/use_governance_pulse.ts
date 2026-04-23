/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import { GOVERNANCE_PULSE_ROUTE, type GovernancePulseBuildResult } from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface GovernancePulseWindow {
  /**
   * ES date-math expression or ISO timestamp. Defaults to `now-24h` on the
   * server when omitted.
   */
  readonly windowStart?: string;
  /**
   * ES date-math expression or ISO timestamp. Defaults to `now` on the server
   * when omitted.
   */
  readonly windowEnd?: string;
}

export interface UseGovernancePulseArgs extends GovernancePulseWindow {
  readonly http: ArgusHttp;
  /**
   * When false the hook stays `idle` and does not fire a request. Use this to
   * keep the Pulse panel in its demo-grade offline mode until we're sure the
   * `argusConsoleEnabled` flag is on.
   */
  readonly enabled?: boolean;
  /**
   * When set to a positive number the hook re-fetches every N milliseconds.
   * Re-fetches do NOT flip state back to `loading` — they silently replace
   * `data` on success so widgets never flash a spinner during a demo.
   */
  readonly refreshIntervalMs?: number;
}

export const useGovernancePulse = ({
  http,
  enabled = true,
  windowStart,
  windowEnd,
  refreshIntervalMs,
}: UseGovernancePulseArgs): FetchState<GovernancePulseBuildResult> => {
  const [state, setState] = useState<FetchState<GovernancePulseBuildResult>>({
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

    const query: Record<string, string> = {};
    if (windowStart) query.window_start = windowStart;
    if (windowEnd) query.window_end = windowEnd;

    // Boolean latch so the first fetch shows the spinner but refreshes
    // afterwards keep the last rendered data on screen.
    let hasFirstResult = false;
    setState({ status: 'loading' });

    const runFetch = () => {
      http
        .fetch<GovernancePulseBuildResult>(GOVERNANCE_PULSE_ROUTE, {
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
          // Only surface errors on the first fetch; later polling errors
          // are kept silent so a transient ES blip doesn't reset the panel.
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
  }, [http, enabled, windowStart, windowEnd, refreshIntervalMs]);

  return state;
};
