/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetResponse } from '@elastic/elasticsearch/lib/api/types';

export interface WorkflowAuditEvent {
  action: 'created' | 'updated' | 'executed' | 'deleted';
  timestamp: string;
}

export interface WorkflowProperties {
  id: string;
  name: string;
  trigger: string;
  skillId: string;
  outcome: string;
  watchIds: string[];
  enabled: boolean;
  priority: number;
  lastRunAt?: string;
  auditTrail: WorkflowAuditEvent[];
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  space: string;
}

export type WorkflowDocument = Pick<GetResponse<WorkflowProperties>, '_source' | '_id'>;
