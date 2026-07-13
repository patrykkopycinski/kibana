/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery, useMutation, useQueryClient } from '@kbn/react-query';
import React from 'react';
import { useKibana } from './use_kibana';
import type { DaybreakInvestigation } from '../../services/investigations_service';

export const useInvestigations = () => {
  const { services } = useKibana();
  const queryClient = useQueryClient();

  const { data: investigations, isLoading } = useQuery({
    queryKey: ['daybreak', 'investigations'],
    queryFn: () => services.investigationsService.list(),
    refetchInterval: 5000,
  });

  const uniqueInvestigations = React.useMemo(() => {
    const map = new Map<string, DaybreakInvestigation>();
    for (const investigation of investigations ?? []) {
      if (!map.has(investigation.id)) {
        map.set(investigation.id, investigation);
      }
    }
    return [...map.values()];
  }, [investigations]);

  const createFromProposal = useMutation({
    mutationFn: (proposalId: string) =>
      services.investigationsService.createFromProposal(proposalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daybreak', 'investigations'] });
    },
  });

  const enrich = useMutation({
    mutationFn: (id: string) => services.investigationsService.enrich(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daybreak', 'investigations'] });
    },
  });


  const runForensic = useMutation({
    mutationFn: (id: string) => services.investigationsService.runForensic(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daybreak', 'investigations'] });
    },
  });

  const runWorker = useMutation({
    mutationFn: (id: string) => services.investigationsService.runEnrichmentWorker(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daybreak', 'investigations'] });
    },
  });

  return {
    investigations: uniqueInvestigations,
    isLoading,
    createFromProposal,
    enrich,
    runWorker,
    runForensic,
  };
};
