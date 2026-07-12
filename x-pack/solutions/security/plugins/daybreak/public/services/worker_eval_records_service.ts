/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core-http-browser';
import { daybreakApiPath } from '../../common/http_api';

export type DaybreakHumanDecision =
  | 'approve'
  | 'modify'
  | 'dismiss'
  | 'escalate'
  | 'defer'
  | 'pending';

export type DaybreakCostBasis = 'priced' | 'unknown' | 'self-hosted';

export interface DaybreakWorkerEvalProvenance {
  modelId?: string;
  connectorId?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  costBasis: DaybreakCostBasis;
}

export interface DaybreakWorkerEvalRecord {
  id: string;
  runId: string;
  dataset: string;
  environment: string;
  capability: string;
  actual: Record<string, unknown>;
  expected: Record<string, unknown>;
  humanDecision?: DaybreakHumanDecision;
  score: number;
  provenance: DaybreakWorkerEvalProvenance;
  createdAt: string;
}

interface ListWorkerEvalRecordsResponse {
  results: DaybreakWorkerEvalRecord[];
}

/**
 * Thin HTTP client wrapping the Daybreak Worker Evaluation Record API.
 */
export class WorkerEvalRecordsService {
  private readonly http: HttpSetup;

  constructor({ http }: { http: HttpSetup }) {
    this.http = http;
  }

  async list(): Promise<DaybreakWorkerEvalRecord[]> {
    const { results } = await this.http.get<ListWorkerEvalRecordsResponse>(
      `${daybreakApiPath}/worker-eval-records`
    );
    return results;
  }
}
