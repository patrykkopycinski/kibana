/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { useKibana } from './use_kibana';

export const useEvidence = () => {
  const { services } = useKibana();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['daybreak', 'evidence'],
    queryFn: () => services.evidenceService.list(),
  });

  return { evidence: data ?? [], isLoading, refresh: refetch };
};
