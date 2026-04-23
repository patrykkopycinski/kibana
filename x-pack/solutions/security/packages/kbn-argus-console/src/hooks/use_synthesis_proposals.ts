/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import {
  SYNTHESIS_PROPOSALS_ROUTE,
  type ArgusSynthesisResponse,
} from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UseSynthesisProposalsArgs {
  readonly http: ArgusHttp;
  /** CVE id, advisory_id, or advisory document id. */
  readonly cveId: string | undefined;
  readonly enabled?: boolean;
  readonly refreshIntervalMs?: number;
}

/**
 * Hook backing the "Proposals" drill-in for a single CVE. Returns the
 * chosen / frontier / dominated candidate set for the advisory's
 * recommendation, along with dominance reasons for every dominated row.
 *
 * The hook follows the same silent-polling pattern as `useE2dFlow` and
 * `useRecentCves` — the first fetch surfaces loading/error states, but
 * subsequent polls only update `data` so a transient 500 does not flash
 * an error banner on top of a previously-good render.
 */
export const useSynthesisProposals = ({
  http,
  cveId,
  enabled = true,
  refreshIntervalMs,
}: UseSynthesisProposalsArgs): FetchState<ArgusSynthesisResponse> => {
  const shouldFetch = enabled && typeof cveId === 'string' && cveId.length > 0;
  const [state, setState] = useState<FetchState<ArgusSynthesisResponse>>({
    status: shouldFetch ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;

    if (!shouldFetch || !cveId) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }

    let hasFirstResult = false;
    setState({ status: 'loading' });

    const runFetch = () => {
      http
        .fetch<ArgusSynthesisResponse>(SYNTHESIS_PROPOSALS_ROUTE, {
          method: 'GET',
          version: '1',
          query: { cve: cveId },
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
  }, [http, cveId, shouldFetch, refreshIntervalMs]);

  return state;
};
