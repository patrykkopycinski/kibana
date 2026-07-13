/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery, useMutation, useQueryClient } from '@kbn/react-query';
import React from 'react';
import { useKibana } from './use_kibana';
import type { DaybreakSse } from '../../services/sse_service';

export const useSse = () => {
  const { services } = useKibana();
  const queryClient = useQueryClient();

  const { data: sseEvents, isLoading } = useQuery({
    queryKey: ['daybreak', 'sse'],
    queryFn: () => services.sseService.list(),
    refetchInterval: 5000,
  });

  const uniqueSseEvents = React.useMemo(() => {
    const map = new Map<string, DaybreakSse>();
    for (const sse of sseEvents ?? []) {
      if (!map.has(sse.id)) {
        map.set(sse.id, sse);
      }
    }
    return [...map.values()];
  }, [sseEvents]);

  const createFromProposal = useMutation({
    mutationFn: (proposalId: string) => services.sseService.createFromProposal(proposalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daybreak', 'sse'] });
    },
  });

  const createFromInvestigation = useMutation({
    mutationFn: (investigationId: string) =>
      services.sseService.createFromInvestigation(investigationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daybreak', 'sse'] });
    },
  });

  return {
    sseEvents: uniqueSseEvents,
    isLoading,
    createFromProposal,
    createFromInvestigation,
  };
};
