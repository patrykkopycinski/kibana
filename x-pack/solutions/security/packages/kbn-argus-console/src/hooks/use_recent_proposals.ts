/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';

import {
  RECENT_PROPOSALS_ROUTE,
  type ArgusSynthesisRecentResponse,
  type ArgusSynthesisWindow,
} from '@kbn/argus-console-common';

import { mapArgusQueryToFetchState, useArgusQuery } from './use_argus_query';
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
  const params = useMemo(() => {
    return {
      window,
      ...(typeof limit === 'number' ? { limit } : {}),
    };
  }, [window, limit]);

  const query = useArgusQuery<
    { window: ArgusSynthesisWindow; limit?: number },
    ArgusSynthesisRecentResponse
  >({
    http,
    enabled,
    route: RECENT_PROPOSALS_ROUTE,
    method: 'GET',
    params,
    pollIntervalMs: refreshIntervalMs,
    silentPolling: Boolean(refreshIntervalMs && refreshIntervalMs > 0),
    transform: (raw) => raw as ArgusSynthesisRecentResponse,
  });

  return mapArgusQueryToFetchState(query);
};
