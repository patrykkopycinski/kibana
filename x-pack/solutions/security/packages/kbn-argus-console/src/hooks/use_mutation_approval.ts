/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useState } from 'react';

import {
  MUTATION_VERDICT_ROUTE,
  type ArgusMutationVerdictAction,
  type ArgusMutationVerdictRequest,
  type ArgusMutationVerdictResponse,
} from '@kbn/argus-console-common';

import type { ArgusHttp } from './types';

export interface UseMutationApprovalArgs {
  readonly http: ArgusHttp;
}

export interface UseMutationApprovalResult {
  /** `true` while any verdict request is in flight. */
  readonly submitting: boolean;
  /** Submit an approve/reject verdict. Resolves on success, rejects on error. */
  readonly submit: (
    action: ArgusMutationVerdictAction,
    args: { readonly mutationIntentId: string; readonly reason?: string }
  ) => Promise<ArgusMutationVerdictResponse>;
}

export const useMutationApproval = ({ http }: UseMutationApprovalArgs): UseMutationApprovalResult => {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (
      action: ArgusMutationVerdictAction,
      { mutationIntentId, reason }: { readonly mutationIntentId: string; readonly reason?: string }
    ) => {
      setSubmitting(true);
      try {
        const body: ArgusMutationVerdictRequest = {
          mutation_intent_id: mutationIntentId,
          action,
          reason,
        };
        const data = await http.fetch<ArgusMutationVerdictResponse>(MUTATION_VERDICT_ROUTE, {
          method: 'POST',
          version: '1',
          body: JSON.stringify(body),
        });
        return data;
      } finally {
        setSubmitting(false);
      }
    },
    [http]
  );

  return { submitting, submit };
};
