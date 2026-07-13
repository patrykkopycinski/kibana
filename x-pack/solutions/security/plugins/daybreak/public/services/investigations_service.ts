/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core-http-browser';
import { daybreakApiPath } from '../../common/http_api';

export type InvestigationStatus = 'open' | 'closed' | 'escalated';

export interface TimelineEntry {
  timestamp: string;
  description: string;
  evidenceRef?: string;
}

export interface InvestigationEntity {
  id: string;
  name: string;
  type: 'host' | 'user' | 'ip' | 'process' | 'file' | 'other';
  relevance: 'primary' | 'secondary' | 'contextual';
}

export interface InvestigationHypothesis {
  id: string;
  statement: string;
  confidence: number;
  status: 'untested' | 'supported' | 'contradicted' | 'inconclusive';
}

export interface DaybreakInvestigation {
  id: string;
  title: string;
  summary: string;
  sourceProposalId: string;
  sourceWatch?: string;
  sourceWorkerId?: string;
  capability: string;
  status: InvestigationStatus;
  hypotheses: InvestigationHypothesis[];
  evidenceRefs: string[];
  timeline: TimelineEntry[];
  entities: InvestigationEntity[];
  openQuestions: string[];
  decisions?: string[];
  createdAt: string;
  updatedAt: string;
}

interface ListInvestigationsResponse {
  results: DaybreakInvestigation[];
}

export class InvestigationsService {
  constructor(private readonly http: HttpSetup) {}

  async list(): Promise<DaybreakInvestigation[]> {
    const { results } = await this.http.get<ListInvestigationsResponse>(
      `${daybreakApiPath}/investigations`
    );
    return results;
  }

  async get(id: string): Promise<DaybreakInvestigation> {
    return this.http.get<DaybreakInvestigation>(`${daybreakApiPath}/investigations/${id}`);
  }

  async createFromProposal(proposalId: string): Promise<DaybreakInvestigation> {
    return this.http.post<DaybreakInvestigation>(
      `${daybreakApiPath}/investigations/from-proposal`,
      {
        body: JSON.stringify({ proposalId }),
      }
    );
  }

  async update(
    id: string,
    updates: Partial<Pick<DaybreakInvestigation, 'status' | 'summary' | 'openQuestions'>>
  ): Promise<DaybreakInvestigation> {
    return this.http.put<DaybreakInvestigation>(`${daybreakApiPath}/investigations/${id}`, {
      body: JSON.stringify(updates),
    });
  }

  async enrich(id: string): Promise<DaybreakInvestigation> {
    return this.http.post<DaybreakInvestigation>(`${daybreakApiPath}/investigations/${id}/enrich`, {
      body: JSON.stringify({}),
    });
  }


  async runForensic(
    id: string,
    body: { hosts?: string[]; timeWindowHours?: number } = {}
  ): Promise<{ workflowExecutionId: string }> {
    return this.http.post<{ workflowExecutionId: string }>(
      `${daybreakApiPath}/investigations/${id}/run-forensic`,
      {
        body: JSON.stringify(body),
      }
    );
  }

  async runEnrichmentWorker(id: string): Promise<{ workflowExecutionId: string }> {
    return this.http.post<{ workflowExecutionId: string }>(
      `${daybreakApiPath}/investigations/${id}/run`,
      {
        body: JSON.stringify({}),
      }
    );
  }
}
