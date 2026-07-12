/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core-http-browser';
import { daybreakApiPath } from '../../common/http_api';

export interface DaybreakWorkflow {
  id: string;
  name: string;
  trigger: string;
  skillId: string;
  outcome: string;
  watchIds: string[];
  enabled: boolean;
  priority: number;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ListWorkflowsResponse {
  results: DaybreakWorkflow[];
}

interface ExecuteWorkflowResponse {
  workflow: DaybreakWorkflow;
  workflowExecutionId: string;
}

export class WorkflowsService {
  constructor(private readonly http: HttpSetup) {}

  async list(): Promise<DaybreakWorkflow[]> {
    return (await this.http.get<ListWorkflowsResponse>(`${daybreakApiPath}/workflows`)).results;
  }

  async create(
    workflow: Omit<DaybreakWorkflow, 'createdAt' | 'updatedAt' | 'lastRunAt'>
  ): Promise<DaybreakWorkflow> {
    return this.http.post<DaybreakWorkflow>(`${daybreakApiPath}/workflows`, {
      body: JSON.stringify(workflow),
    });
  }

  async update(
    id: string,
    updates: Partial<Omit<DaybreakWorkflow, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt'>>
  ): Promise<DaybreakWorkflow> {
    return this.http.put<DaybreakWorkflow>(`${daybreakApiPath}/workflows/${id}`, {
      body: JSON.stringify(updates),
    });
  }

  async execute(id: string): Promise<ExecuteWorkflowResponse> {
    return this.http.post<ExecuteWorkflowResponse>(`${daybreakApiPath}/workflows/${id}/execute`);
  }

  async delete(id: string): Promise<DaybreakWorkflow> {
    return this.http.delete<DaybreakWorkflow>(`${daybreakApiPath}/workflows/${id}`);
  }
}
