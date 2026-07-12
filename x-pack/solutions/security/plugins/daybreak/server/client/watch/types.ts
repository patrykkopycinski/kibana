/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetResponse } from '@elastic/elasticsearch/lib/api/types';

export type WatchStatus = 'active' | 'paused' | 'draft';
export type WatchAutonomyTier = 'auto-run' | 'proposed-diff' | 'approval-required';

export interface WatchProperties {
  id: string;
  name: string;
  description: string;
  surface: string;
  status: WatchStatus;
  autonomyTier: WatchAutonomyTier;
  skillIds: string[];
  createdAt: string;
  updatedAt: string;
  space: string;
}

export type WatchDocument = Pick<GetResponse<WatchProperties>, '_source' | '_id'>;
