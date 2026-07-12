/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation, useQueryClient } from '@kbn/react-query';
import { isHttpFetchError } from '@kbn/core-http-browser';
import { useKibana } from './use_kibana';
import type {
  DaybreakProposal,
  DecisionTaxonomy,
  MissingRequirement,
  TransitionGateFailureBody,
} from '../../services/proposals_service';

interface TransitionVariables {
  id: string;
  targetStatus: DaybreakProposal['status'];
  reason?: string;
  decisionType?: DecisionTaxonomy;
  decisionReason?: string;
}

/**
 * Extracts the `missingRequirements` list from a 422 readiness-gate failure
 * response (FR-018). Returns `undefined` for any other error shape so
 * callers can distinguish "gate failed with a specific reason" from a
 * generic/unexpected error.
 */
const getMissingRequirements = (error: unknown): MissingRequirement[] | undefined => {
  if (!isHttpFetchError(error) || error.response?.status !== 422) {
    return undefined;
  }

  const body = error.body as TransitionGateFailureBody | undefined;
  return body?.attributes?.failure?.missingRequirements;
};

/**
 * Drives the Proposal gate-approval transition flow (FR-016, FR-017,
 * FR-018). Accepting a Proposal gate in the UI invokes the server's
 * `POST /proposals/{id}/transition` route, which fails closed (422) unless
 * `evidenceRefs`, `recommendation`, and `requiredApproverCount` are all
 * satisfied. On failure, this hook surfaces the specific
 * `missingRequirements` returned by the gate rather than a generic error,
 * so the UI can render exactly what is missing.
 */
export const useProposalTransition = () => {
  const { services } = useKibana();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, targetStatus, reason, decisionType, decisionReason }: TransitionVariables) =>
      services.proposalsService.transitionStatus(
        id,
        targetStatus,
        undefined,
        reason,
        decisionType,
        decisionReason
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['daybreak', 'proposals'] });
    },
  });

  return {
    transition: mutation.mutateAsync,
    isLoading: mutation.isLoading,
    missingRequirements: getMissingRequirements(mutation.error),
  };
};
