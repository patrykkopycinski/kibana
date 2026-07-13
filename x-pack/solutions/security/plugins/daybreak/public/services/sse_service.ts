/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core-http-browser';
import { daybreakApiPath } from '../../common/http_api';

export type SseStatus = 'open' | 'acknowledged' | 'closed' | 'escalated';

export type SseFindingType =
  | 'hunt_finding'
  | 'correlation'
  | 'threat_match'
  | 'coverage_gap'
  | 'escalation_request';

export interface SseRecommendedAction {
  id: string;
  description: string;
  autonomyRequired: 'suggest' | 'approve' | 'auto';
}

export interface SseDestination {
  id: string;
  kind: 'case' | 'siem' | 'webhook' | 'slack' | 'email';
  reference?: string;
}

export interface DaybreakSse {
  id: string;
  title: string;
  description: string;
  findingType: SseFindingType;
  sourceProposalId?: string;
  sourceInvestigationId?: string;
  sourceWatch?: string;
  sourceWorkerId?: string;
  capability: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  status: SseStatus;
  evidenceRefs: string[];
  entities: string[];
  recommendedActions: SseRecommendedAction[];
  destinations: SseDestination[];
  createdAt: string;
  updatedAt: string;
}

interface ListSseResponse {
  results: DaybreakSse[];
}

export class SseService {
  constructor(private readonly http: HttpSetup) {}

  async list(): Promise<DaybreakSse[]> {
    const { results } = await this.http.get<ListSseResponse>(`${daybreakApiPath}/sse`);
    return results;
  }

  async get(id: string): Promise<DaybreakSse> {
    return this.http.get<DaybreakSse>(`${daybreakApiPath}/sse/${id}`);
  }

  async createFromProposal(proposalId: string): Promise<DaybreakSse> {
    return this.http.post<DaybreakSse>(`${daybreakApiPath}/sse/from-proposal`, {
      body: JSON.stringify({ proposalId }),
    });
  }

  async createFromInvestigation(investigationId: string): Promise<DaybreakSse> {
    return this.http.post<DaybreakSse>(`${daybreakApiPath}/sse/from-investigation`, {
      body: JSON.stringify({ investigationId }),
    });
  }

  async update(
    id: string,
    updates: Partial<Pick<DaybreakSse, 'status' | 'description' | 'destinations'>>
  ): Promise<DaybreakSse> {
    return this.http.put<DaybreakSse>(`${daybreakApiPath}/sse/${id}`, {
      body: JSON.stringify(updates),
    });
  }
}
