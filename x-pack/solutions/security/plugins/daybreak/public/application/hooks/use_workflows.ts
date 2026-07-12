/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { useKibana } from './use_kibana';

export const useWorkflows = () => {
  const {
    services: { workflowsService },
  } = useKibana();

  const query = useQuery({
    queryKey: ['daybreak', 'workflows'],
    queryFn: () => workflowsService.list(),
  });

  return { workflows: query.data ?? [], isLoading: query.isLoading };
};
