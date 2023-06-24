/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { useLocation, useParams, Navigate } from 'react-router-dom-v5-compat';
import { Routes, Route } from '@kbn/shared-ux-router';

import { useMlCapabilities } from '../../../common/components/ml/hooks/use_ml_capabilities';
import { hasMlUserPermissions } from '../../../../common/machine_learning/has_ml_user_permissions';

import { NetworkDetails } from './details';
import { Network } from './network';
import { getNetworkRoutePath } from './navigation';
import { NetworkRouteType } from './navigation/types';
import { MlNetworkConditionalContainer } from '../../../common/components/ml/conditional_links/ml_network_conditional_container';
import { NETWORK_PATH } from '../../../../common/constants';
import { FlowTargetSourceDest } from '../../../../common/search_strategy';
import {
  FLOW_TARGET_PARAM,
  NETWORK_DETAILS_PAGE_PATH,
  NETWORK_DETAILS_TAB_PATH,
} from './constants';

const getPathWithFlowType = (detailName: string, flowTarget?: FlowTargetSourceDest) =>
  `${NETWORK_PATH}/ip/${detailName}/${flowTarget || FlowTargetSourceDest.source}/${
    NetworkRouteType.flows
  }`;

const RedirectToDefaultNetworkPage = () => {
  const { search = '' } = useLocation();

  return <Navigate to={{ pathname: `${NETWORK_PATH}/${NetworkRouteType.flows}`, search }} />;
};

const RedirectToDefaultNetworkDetailsPage = () => {
  const { detailName, flowTarget } = useParams();
  const { search = '' } = useLocation();

  return (
    <Navigate
      to={{
        pathname: getPathWithFlowType(detailName, flowTarget as FlowTargetSourceDest),
        search,
      }}
    />
  );
};

const NetworkContainerComponent = () => {
  const capabilities = useMlCapabilities();
  const capabilitiesFetched = capabilities.capabilitiesFetched;
  const userHasMlUserPermissions = useMemo(
    () => hasMlUserPermissions(capabilities),
    [capabilities]
  );
  const networkRoutePath = useMemo(
    () => getNetworkRoutePath(capabilitiesFetched, userHasMlUserPermissions),
    [capabilitiesFetched, userHasMlUserPermissions]
  );

  return (
    <Routes legacySwitch={false}>
      <Route path={NETWORK_PATH} element={<RedirectToDefaultNetworkPage />} />
      <Route path={`${NETWORK_PATH}/ml-network`}>
        <MlNetworkConditionalContainer />
      </Route>
      <Route
        path={networkRoutePath}
        element={
          <Network
            capabilitiesFetched={capabilities.capabilitiesFetched}
            hasMlUserPermissions={userHasMlUserPermissions}
          />
        }
      />
      <Route path={NETWORK_DETAILS_TAB_PATH} element={<NetworkDetails />} />
      <Route
        path={`${NETWORK_DETAILS_PAGE_PATH}/:flowTarget(${FLOW_TARGET_PARAM})?`}
        element={<RedirectToDefaultNetworkDetailsPage />}
      />
      <Route
        index
        element={
          <Navigate
            to={{
              pathname: NETWORK_PATH,
            }}
          />
        }
      />
    </Routes>
  );
};

export const NetworkContainer = React.memo(NetworkContainerComponent);
