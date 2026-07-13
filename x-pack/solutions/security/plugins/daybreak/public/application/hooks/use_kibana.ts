/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useKibana as useKibanaReact } from '@kbn/kibana-react-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { EvidenceService } from '../../services/evidence_service';
import type { ProposalsService } from '../../services/proposals_service';
import type { WatchesService } from '../../services/watches_service';
import type { WorkflowsService } from '../../services/workflows_service';
import type { WorkerEvalRecordsService } from '../../services/worker_eval_records_service';
import type { InvestigationsService } from '../../services/investigations_service';
import type { SseService } from '../../services/sse_service';

export interface DaybreakKibanaServices extends CoreStart {
  evidenceService: EvidenceService;
  proposalsService: ProposalsService;
  watchesService: WatchesService;
  workflowsService: WorkflowsService;
  workerEvalRecordsService: WorkerEvalRecordsService;
  investigationsService: InvestigationsService;
  sseService: SseService;
}

export const useKibana = () => useKibanaReact<DaybreakKibanaServices>();
