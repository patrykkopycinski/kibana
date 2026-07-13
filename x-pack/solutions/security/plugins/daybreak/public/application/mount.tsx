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
import { EvidenceService } from '../services/evidence_service';
import { ProposalsService } from '../services/proposals_service';
import { WatchesService } from '../services/watches_service';
import { WorkflowsService } from '../services/workflows_service';
import { WorkerEvalRecordsService } from '../services/worker_eval_records_service';
import { InvestigationsService } from '../services/investigations_service';
import { SseService } from '../services/sse_service';
import { DaybreakRoutes } from './routes';

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
    evidenceService: new EvidenceService({ http: core.http }),
    proposalsService: new ProposalsService({ http: core.http }),
    watchesService: new WatchesService(core.http),
    workflowsService: new WorkflowsService(core.http),
    workerEvalRecordsService: new WorkerEvalRecordsService({ http: core.http }),
    investigationsService: new InvestigationsService(core.http),
    sseService: new SseService(core.http),
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
