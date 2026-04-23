/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import {
  DECISION_GRAPH_ROUTE,
  type DecisionGraphNodeKind,
  type DecisionGraphResponse,
} from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UseDecisionGraphArgs {
  readonly http: ArgusHttp;
  readonly rootKind: DecisionGraphNodeKind | undefined;
  readonly rootId: string | undefined;
  readonly depth?: number;
  readonly enabled?: boolean;
}

/**
 * Fetches a decision-graph neighborhood from
 * `GET /internal/security_solution/argus/decision_graph`. The hook stays
 * `idle` until both `rootKind` and `rootId` are set so a picker can be
 * rendered empty without racing a real request.
 */
export const useDecisionGraph = ({
  http,
  rootKind,
  rootId,
  depth = 2,
  enabled = true,
}: UseDecisionGraphArgs): FetchState<DecisionGraphResponse> => {
  const hasRoot = Boolean(rootKind && rootId);
  const [state, setState] = useState<FetchState<DecisionGraphResponse>>({
    status: enabled && hasRoot ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;

    if (!enabled || !rootKind || !rootId) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }

    setState({ status: 'loading' });

    http
      .fetch<DecisionGraphResponse>(DECISION_GRAPH_ROUTE, {
        method: 'GET',
        version: '1',
        query: {
          root_kind: rootKind,
          root_id: rootId,
          depth,
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
  }, [http, enabled, rootKind, rootId, depth]);

  return state;
};
