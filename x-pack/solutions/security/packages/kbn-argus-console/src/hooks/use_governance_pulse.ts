/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';

import { GOVERNANCE_PULSE_ROUTE, type GovernancePulseBuildResult } from '@kbn/argus-console-common';

import { mapArgusQueryToFetchState, useArgusQuery } from './use_argus_query';
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
  const params = useMemo(() => {
    const query: Record<string, string> = {};
    if (windowStart) query.window_start = windowStart;
    if (windowEnd) query.window_end = windowEnd;
    return query;
  }, [windowStart, windowEnd]);

  const query = useArgusQuery<Record<string, string>, GovernancePulseBuildResult>({
    http,
    enabled,
    route: GOVERNANCE_PULSE_ROUTE,
    method: 'GET',
    params,
    pollIntervalMs: refreshIntervalMs,
    silentPolling: Boolean(refreshIntervalMs && refreshIntervalMs > 0),
    transform: (raw) => raw as GovernancePulseBuildResult,
  });

  return mapArgusQueryToFetchState(query);
};
