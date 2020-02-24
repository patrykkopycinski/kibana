/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { useEffect, useState } from 'react';
import { HttpFetchOptions } from 'kibana/public';
import { useKibana } from '../lib/kibana';

export const useFetch = (url: string, options?: HttpFetchOptions) => {
  const {
    services: {
      http: { fetch },
      ...rest
    },
  } = useKibana();
  console.error('res', rest);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(url, options);
        setResponse(res);
        setLoading(false);
      } catch (newError) {
        setError(newError);
      }
    };
    fetchData();
  }, []);

  return { response, error, loading };
};
