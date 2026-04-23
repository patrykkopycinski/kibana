/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import {
  DECISION_GRAPH_RECENT_ROOTS_ROUTE,
  type DecisionGraphRecentRootsResponse,
} from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UseDecisionGraphRecentRootsArgs {
  readonly http: ArgusHttp;
  readonly limit?: number;
  readonly enabled?: boolean;
}

/**
 * Fetches the most-recent outgoing subjects in `.soc-decision-graph` so the
 * Decision graph panel can auto-select a populated root on mount and render
 * quick-pick chips above the subject picker. Stays `idle` when disabled so a
 * caller behind a feature flag can mount the hook unconditionally.
 */
export const useDecisionGraphRecentRoots = ({
  http,
  limit,
  enabled = true,
}: UseDecisionGraphRecentRootsArgs): FetchState<DecisionGraphRecentRootsResponse> => {
  const [state, setState] = useState<FetchState<DecisionGraphRecentRootsResponse>>({
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

    setState({ status: 'loading' });

    http
      .fetch<DecisionGraphRecentRootsResponse>(DECISION_GRAPH_RECENT_ROOTS_ROUTE, {
        method: 'GET',
        version: '1',
        query: {
          ...(typeof limit === 'number' ? { limit } : {}),
        },
      })
      .then((data) => {
        if (aborted.current) return;
        setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (aborted.current) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'error', error });
      });

    return () => {
      aborted.current = true;
    };
  }, [http, enabled, limit]);

  return state;
};
