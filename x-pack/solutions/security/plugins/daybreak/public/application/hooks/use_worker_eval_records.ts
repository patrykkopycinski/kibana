/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { useKibana } from './use_kibana';

export const useWorkerEvalRecords = () => {
  const {
    services: { workerEvalRecordsService },
  } = useKibana();

  const { data, isLoading, error } = useQuery({
    queryKey: ['daybreak', 'worker-eval-records'],
    queryFn: () => workerEvalRecordsService.list(),
  });

  return { records: data ?? [], isLoading, error };
};
