/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation, useQueryClient } from '@kbn/react-query';
import { useKibana } from './use_kibana';
import type { ResponseAction } from '../../services/proposals_service';

export const useProposalActions = () => {
  const { services } = useKibana();
  const queryClient = useQueryClient();

  const actResponse = useMutation({
    mutationFn: ({
      id,
      action,
      hostName,
    }: {
      id: string;
      action?: ResponseAction;
      hostName?: string;
    }) => services.proposalsService.actResponse(id, { action, hostName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daybreak', 'investigations'] });
    },
  });

  const runResponseActionWorker = useMutation({
    mutationFn: ({
      id,
      action,
      hostName,
    }: {
      id: string;
      action?: ResponseAction;
      hostName?: string;
    }) => services.proposalsService.runResponseActionWorker(id, { action, hostName }),
  });

  return { actResponse, runResponseActionWorker };
};
