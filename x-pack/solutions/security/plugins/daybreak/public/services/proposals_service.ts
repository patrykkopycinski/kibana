/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core-http-browser';
import { daybreakApiPath } from '../../common/http_api';

/**
 * Proposal shape as returned by `GET /api/daybreak/proposals` (FR-023). Kept
 * as a browser-local type rather than importing from `server/client/proposals/types`
 * to preserve the public/server boundary — the HTTP response is the actual
 * contract the browser depends on.
 */
export interface DaybreakProposal {
  id: string;
  title: string;
  capability: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  status:
    | 'new'
    | 'needs-evidence'
    | 'approved'
    | 'modified'
    | 'dismissed'
    | 'escalated'
    | 'deferred';
  recommendation?: string;
  evidenceRefs: string[];
  expectedImpact?: string;
  riskCaveats?: string[];
  createdAt: string;
}

interface ListProposalsResponse {
  results: DaybreakProposal[];
}

/**
 * Thin HTTP client wrapping the Daybreak Proposal API (FR-010, FR-011). The
 * `public/` layer renders real PD-2 worker output — no mocked or seeded data.
 */
export class ProposalsService {
  private readonly http: HttpSetup;

  constructor({ http }: { http: HttpSetup }) {
    this.http = http;
  }

  async list(): Promise<DaybreakProposal[]> {
    const { results } = await this.http.get<ListProposalsResponse>(`${daybreakApiPath}/proposals`);
    return results;
  }

  async transitionStatus(
    id: string,
    targetStatus: DaybreakProposal['status']
  ): Promise<DaybreakProposal> {
    return this.http.post<DaybreakProposal>(`${daybreakApiPath}/proposals/${id}/transition`, {
      body: JSON.stringify({ targetStatus }),
    });
  }
}
