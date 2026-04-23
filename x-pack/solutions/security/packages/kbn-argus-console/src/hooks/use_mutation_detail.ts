/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import { MUTATION_DETAIL_ROUTE, type ArgusMutationDetailResponse } from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UseMutationDetailArgs {
  readonly http: ArgusHttp;
  /**
   * Id of the mutation intent to load. When undefined / empty the hook
   * stays idle — useful for conditional rendering where the flyout is
   * mounted with `isOpen` but no selection yet.
   */
  readonly mutationIntentId: string | undefined;
  readonly enabled?: boolean;
}

/**
 * Loads the rich detail payload for a single mutation. One-shot fetch —
 * no polling — because the flyout is short-lived and the underlying
 * indices don't mutate after the outcome is written.
 */
export const useMutationDetail = ({
  http,
  mutationIntentId,
  enabled = true,
}: UseMutationDetailArgs): FetchState<ArgusMutationDetailResponse> => {
  const shouldFetch =
    enabled && typeof mutationIntentId === 'string' && mutationIntentId.length > 0;
  const [state, setState] = useState<FetchState<ArgusMutationDetailResponse>>({
    status: shouldFetch ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;

    if (!shouldFetch || !mutationIntentId) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }

    setState({ status: 'loading' });

    http
      .fetch<ArgusMutationDetailResponse>(MUTATION_DETAIL_ROUTE, {
        method: 'GET',
        version: '1',
        query: { mutation_intent_id: mutationIntentId },
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
  }, [http, mutationIntentId, shouldFetch]);

  return state;
};
