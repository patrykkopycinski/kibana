/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { RouteProps } from 'react-router-dom-v5-compat';
import { useLocation, Navigate } from 'react-router-dom-v5-compat';
import { ALERTS_PATH, DETECTIONS_PATH } from '../../common/constants';
import { PluginTemplateWrapper } from '../common/components/plugin_template_wrapper';
import { Alerts } from './pages/alerts';

const AlertsRoutes = () => (
  <PluginTemplateWrapper>
    <Alerts />
  </PluginTemplateWrapper>
);

const DetectionsRedirects = () => {
  const location = useLocation();

  return location.pathname === DETECTIONS_PATH ? (
    <Navigate to={{ ...location, pathname: ALERTS_PATH }} replace />
  ) : (
    <Navigate
      to={{ ...location, pathname: location.pathname.replace(DETECTIONS_PATH, '') }}
      replace
    />
  );
};

export const routes: RouteProps[] = [
  {
    path: DETECTIONS_PATH,
    element: <DetectionsRedirects />,
  },
  {
    path: ALERTS_PATH,
    element: <AlertsRoutes />,
  },
];
