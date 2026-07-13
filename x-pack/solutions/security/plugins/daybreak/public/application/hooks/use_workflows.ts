/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import React from 'react';
import { useKibana } from './use_kibana';
import type { DaybreakWorkflow } from '../../services/workflows_service';

export const useWorkflows = () => {
  const {
    services: { workflowsService },
  } = useKibana();

  const query = useQuery({
    queryKey: ['daybreak', 'workflows'],
    queryFn: () => workflowsService.list(),
    refetchInterval: 5000,
  });

  const uniqueWorkflows = React.useMemo(() => {
    const map = new Map<string, DaybreakWorkflow>();
    for (const workflow of query.data ?? []) {
      if (!map.has(workflow.id)) {
        map.set(workflow.id, workflow);
      }
    }
    return [...map.values()];
  }, [query.data]);
  return { workflows: uniqueWorkflows, isLoading: query.isLoading };
};
