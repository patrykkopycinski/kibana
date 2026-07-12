/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core-http-browser';
import { daybreakApiPath } from '../../common/http_api';

export type DaybreakWatchStatus = 'active' | 'paused' | 'draft';
export type DaybreakWatchAutonomyTier = 'auto-run' | 'proposed-diff' | 'approval-required';

export interface DaybreakWatch {
  id: string;
  name: string;
  description: string;
  surface: string;
  status: DaybreakWatchStatus;
  autonomyTier: DaybreakWatchAutonomyTier;
  skillIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface ListWatchesResponse {
  results: DaybreakWatch[];
}

export class WatchesService {
  constructor(private readonly http: HttpSetup) {}

  async list(): Promise<DaybreakWatch[]> {
    return (await this.http.get<ListWatchesResponse>(`${daybreakApiPath}/watches`)).results;
  }

  async create(watch: Omit<DaybreakWatch, 'createdAt' | 'updatedAt'>): Promise<DaybreakWatch> {
    return this.http.post<DaybreakWatch>(`${daybreakApiPath}/watches`, {
      body: JSON.stringify(watch),
    });
  }

  async update(
    id: string,
    updates: Partial<Omit<DaybreakWatch, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<DaybreakWatch> {
    return this.http.put<DaybreakWatch>(`${daybreakApiPath}/watches/${id}`, {
      body: JSON.stringify(updates),
    });
  }
}
