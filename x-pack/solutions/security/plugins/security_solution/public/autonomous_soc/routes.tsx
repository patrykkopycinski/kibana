/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';

import { AUTONOMOUS_SOC_PATH, SecurityPageName } from '../../common/constants';
import type { SecuritySubPluginRoutes } from '../app/types';
import { PluginTemplateWrapper } from '../common/components/plugin_template_wrapper';
import { AutonomousSocDashboard } from './pages/autonomous_soc_dashboard';
import { withSecurityRoutePageWrapper } from '../common/components/security_route_page_wrapper';

const AutonomousSocRoutes = () => (
  <PluginTemplateWrapper>
    <AutonomousSocDashboard />
  </PluginTemplateWrapper>
);

export const routes: SecuritySubPluginRoutes = [
  {
    path: AUTONOMOUS_SOC_PATH,
    component: withSecurityRoutePageWrapper(AutonomousSocRoutes, SecurityPageName.autonomousSoc),
  },
];
