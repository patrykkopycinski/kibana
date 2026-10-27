/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { lazy, Suspense } from 'react';
import { Route, Routes } from '@kbn/shared-ux-router';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { EuiLoadingElastic } from '@elastic/eui';

import type { SecuritySubPluginRoutes } from '../app/types';
import { SecurityPageName } from '../app/types';
import { DETONATE_PROTOTYPE_APP_PATH } from '../../common/detonate_prototype';
import { SecuritySolutionPageWrapper } from '../common/components/page_wrapper';
import { PluginTemplateWrapper } from '../common/components/plugin_template_wrapper';
import { withSecurityRoutePageWrapper } from '../common/components/security_route_page_wrapper';
import { DetonationNotifier } from './components/detonation_notifier';

const DetonateListPageLazy = lazy(() => import('./pages/list_page'));
const DetonateDetailPageLazy = lazy(() => import('./pages/detail_page'));

/**
 * The prototype owns its query client so its polling cannot be influenced by,
 * or influence, the defaults another Security page relies on.
 */
const queryClient = new QueryClient();

export const DetonatePrototypeRoutes = () => (
  <QueryClientProvider client={queryClient}>
    {/* Above the routes so a submitted run keeps its completion watcher while
        the analyst moves between the list and detail pages. */}
    <DetonationNotifier>
      <PluginTemplateWrapper>
        <SecuritySolutionPageWrapper>
          <Suspense fallback={<EuiLoadingElastic />}>
            <Routes>
              <Route
                path={`${DETONATE_PROTOTYPE_APP_PATH}/:taskId`}
                component={DetonateDetailPageLazy}
              />
              <Route exact path={DETONATE_PROTOTYPE_APP_PATH} component={DetonateListPageLazy} />
            </Routes>
          </Suspense>
        </SecuritySolutionPageWrapper>
      </PluginTemplateWrapper>
    </DetonationNotifier>
  </QueryClientProvider>
);

export const routes: SecuritySubPluginRoutes = [
  {
    path: DETONATE_PROTOTYPE_APP_PATH,
    component: withSecurityRoutePageWrapper(
      DetonatePrototypeRoutes,
      SecurityPageName.detonatePrototype
    ),
  },
];
