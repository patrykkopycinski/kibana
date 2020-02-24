/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { filter } from 'lodash/fp';
import { useMemo } from 'react';
import { useFetch } from '../../hooks/use_fetch';
import { FindResult } from './types';

const SUPPORTED_ACTION_TYPES = ['.email', '.pagerduty', '.slack'];

export const useActionConnectorsQuery = () => {
  const { response, loading }: { response: FindResult; loading: boolean } = useFetch(
    '/api/action/_find'
  );
  const connectors = useMemo(() => {
    if (!response) {
      return null;
    }
    return filter(
      connector => SUPPORTED_ACTION_TYPES.includes(connector.actionTypeId),
      response?.data
    );
  }, [response]);

  console.error('data', response, loading, connectors);

  return {};
};
