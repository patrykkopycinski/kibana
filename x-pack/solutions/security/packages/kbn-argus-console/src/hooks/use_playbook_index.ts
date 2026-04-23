/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import { PLAYBOOKS_INDEX_ROUTE, type ArgusPlaybookIndexResponse } from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UsePlaybookIndexArgs {
  readonly http: ArgusHttp;
  /**
   * When false the hook stays idle — used by the Playbooks tab to defer
   * fetching until the panel is actually visible.
   */
  readonly enabled?: boolean;
}

/**
 * Live Playbooks index. Reads the `.soc-workflow-registry` by tag on the
 * server and merges the hardcoded Argus skill list. Consumers should treat
 * an `error` state as "fall back to the static demo list" so a cold-start
 * cluster (no registry index yet) still renders the Playbooks tab.
 */
export const usePlaybookIndex = ({
  http,
  enabled = true,
}: UsePlaybookIndexArgs): FetchState<ArgusPlaybookIndexResponse> => {
  const [state, setState] = useState<FetchState<ArgusPlaybookIndexResponse>>({
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
      .fetch<ArgusPlaybookIndexResponse>(PLAYBOOKS_INDEX_ROUTE, {
        method: 'GET',
        version: '1',
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
  }, [http, enabled]);

  return state;
};
