/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import {
  MUTATION_LINEAGE_ROUTE,
  type MutationLineageBuildResult,
  type MutationLineageSubject,
} from '@kbn/argus-console-common';
import type { ArgusHttp, FetchState } from './types';

interface UseMutationLineageArgs {
  readonly http: ArgusHttp;
  readonly subject: MutationLineageSubject | undefined;
}

export const useMutationLineage = ({
  http,
  subject,
}: UseMutationLineageArgs): FetchState<MutationLineageBuildResult> => {
  const [state, setState] = useState<FetchState<MutationLineageBuildResult>>({
    status: subject ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;

    if (!subject) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }

    setState({ status: 'loading' });

    http
      .fetch<MutationLineageBuildResult>(MUTATION_LINEAGE_ROUTE, {
        method: 'GET',
        version: '1',
        query: { subject_kind: subject.kind, subject_id: subject.id },
      })
      .then((data) => {
        if (!aborted.current) setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (!aborted.current) {
          const error = err instanceof Error ? err : new Error(String(err));
          setState({ status: 'error', error });
        }
      });

    return () => {
      aborted.current = true;
    };
  }, [http, subject]);

  return state;
};
