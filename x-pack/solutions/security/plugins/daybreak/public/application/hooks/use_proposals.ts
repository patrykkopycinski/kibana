/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import React from 'react';
import { useKibana } from './use_kibana';
import type { DaybreakProposal } from '../../services/proposals_service';

/**
 * Fetches real Proposal documents from the Daybreak HTTP API (FR-011). Exposes
 * `isLoading`/`data` so components can render explicit, assertable
 * loading/populated states rather than relying on fixed timeouts in E2E tests.
 */
export const useProposals = () => {
  const { services } = useKibana();

  const {
    data: proposals,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['daybreak', 'proposals'],
    queryFn: () => services.proposalsService.list(),
    refetchInterval: 5000,
  });

  const uniqueProposals = React.useMemo(() => {
    const map = new Map<string, DaybreakProposal>();
    for (const proposal of proposals ?? []) {
      if (!map.has(proposal.id)) {
        map.set(proposal.id, proposal);
      }
    }
    return [...map.values()];
  }, [proposals]);
  return {
    proposals: uniqueProposals,
    isLoading,
    refresh: refetch,
  };
};
