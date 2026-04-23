/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';

import { E2D_RECENT_CVES_ROUTE, type ArgusE2dRecentCvesResponse } from '@kbn/argus-console-common';

import { mapArgusQueryToFetchState, useArgusQuery } from './use_argus_query';
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
  const params = useMemo(
    () => ({
      kev_only: kevOnly,
      ...(typeof limit === 'number' ? { limit } : {}),
    }),
    [kevOnly, limit]
  );

  const query = useArgusQuery<
    { kev_only: boolean; limit?: number },
    ArgusE2dRecentCvesResponse
  >({
    http,
    enabled,
    route: E2D_RECENT_CVES_ROUTE,
    method: 'GET',
    params,
    pollIntervalMs: refreshIntervalMs,
    silentPolling: Boolean(refreshIntervalMs && refreshIntervalMs > 0),
    transform: (raw) => raw as ArgusE2dRecentCvesResponse,
  });

  return mapArgusQueryToFetchState(query);
};
