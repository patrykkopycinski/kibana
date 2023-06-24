/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Navigate, To, NavigateProps, useLocation } from 'react-router-dom-v5-compat';

interface RedirectWithQueryParamsProps extends Omit<NavigateProps, 'to'> {
  to: string | To;
}

// This workaround preserves query parameters in the redirect
// https://github.com/ReactTraining/react-router/issues/5818#issuecomment-379212014
export const RedirectWithQueryParams: React.FunctionComponent<RedirectWithQueryParamsProps> = ({
  to,
  ...rest
}) => {
  const location = useLocation();

  if (location) {
    return (
      <Navigate
        {...rest}
        replace
        to={
          typeof to === 'string'
            ? {
                ...location,
                pathname: to,
              }
            : {
                ...location,
                ...to,
              }
        }
      />
    );
  }

  return null;
};
