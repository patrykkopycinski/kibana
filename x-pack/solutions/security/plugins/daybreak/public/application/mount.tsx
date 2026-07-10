/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import ReactDOM from 'react-dom';
import type { AppMountParameters, CoreStart } from '@kbn/core/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { I18nProvider } from '@kbn/i18n-react';
import { Router } from '@kbn/shared-ux-router';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { ProposalsService } from '../services/proposals_service';
import { DaybreakRoutes } from './routes';

/**
 * Mounts the Daybreak application (FR-010). Lazy-loaded from `plugin.ts`'s
 * `core.application.register` `mount` callback so the route module is
 * code-split from the main bundle.
 */
export const mountApp = ({
  core,
  element,
  history,
}: {
  core: CoreStart;
  element: AppMountParameters['element'];
  history: AppMountParameters['history'];
}) => {
  const queryClient = new QueryClient();
  const services = {
    ...core,
    proposalsService: new ProposalsService({ http: core.http }),
  };

  ReactDOM.render(
    core.rendering.addContext(
      <KibanaContextProvider services={services}>
        <I18nProvider>
          <QueryClientProvider client={queryClient}>
            <Router history={history}>
              <DaybreakRoutes />
            </Router>
          </QueryClientProvider>
        </I18nProvider>
      </KibanaContextProvider>
    ),
    element
  );

  return () => {
    ReactDOM.unmountComponentAtNode(element);
  };
};
