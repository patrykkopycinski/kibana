/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { memo, useEffect, useState } from 'react';
import { useLocation, useParams, useHistory } from 'react-router-dom';
import deepEqual from 'fast-deep-equal';

import { RouteSpyState } from './types';
import { useRouteSpy } from './use_route_spy';

export const SpyRouteComponent = () => {
  const { pathname, search, state } = useLocation();
  const { pageName, detailName, tabName, flowTarget } = useParams();
  const history = useHistory();
  const [isInitializing, setIsInitializing] = useState(true);
  const [route, dispatch] = useRouteSpy();

  useEffect(() => {
    if (isInitializing && search !== '') {
      dispatch({
        type: 'updateSearch',
        search,
      });
      setIsInitializing(false);
    }
  }, [search]);
  useEffect(() => {
    if (pageName && !deepEqual(route.pathName, pathname)) {
      if (isInitializing && detailName == null) {
        dispatch({
          type: 'updateRouteWithOutSearch',
          route: {
            pageName,
            detailName,
            tabName,
            pathName: pathname,
            history,
            flowTarget,
          },
        });
        setIsInitializing(false);
      } else {
        dispatch({
          type: 'updateRoute',
          route: {
            pageName,
            detailName,
            tabName: tabName as RouteSpyState['tabName'],
            search,
            pathName: pathname,
            history,
            flowTarget: flowTarget as RouteSpyState['flowTarget'],
          },
        });
      }
    } else {
      if (pageName && !deepEqual(state, route.state)) {
        dispatch({
          type: 'updateRoute',
          route: {
            pageName,
            detailName,
            tabName: tabName as RouteSpyState['tabName'],
            search,
            pathName: pathname,
            history,
            flowTarget: flowTarget as RouteSpyState['flowTarget'],
            state,
          },
        });
      }
    }
  }, [pathname, search, pageName, detailName, tabName, flowTarget, state]);
  return null;
};

export const SpyRoute = memo(SpyRouteComponent, deepEqual);
