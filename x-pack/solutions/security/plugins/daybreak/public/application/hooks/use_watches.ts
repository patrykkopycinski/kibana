/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import React from 'react';
import { useKibana } from './use_kibana';

export const useWatches = () => {
  const {
    services: { watchesService },
  } = useKibana();

  const query = useQuery({
    queryKey: ['daybreak', 'watches'],
    queryFn: () => watchesService.list(),
    refetchInterval: 5000,
  });

  const uniqueWatches = React.useMemo(() => {
    const map = new Map<string, DaybreakWatch>();
    for (const watch of query.data ?? []) {
      if (!map.has(watch.id)) {
        map.set(watch.id, watch);
      }
    }
    return [...map.values()];
  }, [query.data]);
  return { watches: uniqueWatches, isLoading: query.isLoading };
};
