/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, memo } from 'react';
import { EuiFlyout } from '@elastic/eui';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useEndpointSelector } from '../hooks';
import { uiQueryParams } from '../../store/selectors';

import { getEndpointListPath } from '../../../../common/routing';
import { EndpointDetails } from './endpoint_details';

export const EndpointDetailsFlyout = memo(() => {
  const navigate = useNavigate();
  const queryParams = useEndpointSelector(uiQueryParams);
  const { selected_endpoint: selectedEndpoint, ...queryParamsWithoutSelectedEndpoint } =
    queryParams;

  const handleFlyoutClose = useCallback(() => {
    const { show: _show, ...urlSearchParams } = queryParamsWithoutSelectedEndpoint;
    navigate(
      getEndpointListPath({
        name: 'endpointList',
        ...urlSearchParams,
      })
    );
  }, [navigate, queryParamsWithoutSelectedEndpoint]);

  return (
    <EuiFlyout
      onClose={handleFlyoutClose}
      data-test-subj="endpointDetailsFlyout"
      size="m"
      paddingSize="l"
      ownFocus={false}
    >
      <EndpointDetails />
    </EuiFlyout>
  );
});

EndpointDetailsFlyout.displayName = 'EndpointDetailsFlyout';
