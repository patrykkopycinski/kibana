/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetResponse } from '@elastic/elasticsearch/lib/api/types';

/** Proposal status values for the `.kibana-daybreak-proposals` index. */
export type ProposalStatus =
  | 'new'
  | 'needs-evidence'
  | 'approved'
  | 'modified'
  | 'dismissed'
  | 'escalated'
  | 'deferred';

/**
 * DecisionHistoryEntry describes a single status transition.
 */
export interface DecisionHistoryEntry {
  fromStatus: ProposalStatus;
  toStatus: ProposalStatus;
  actor?: string;
  reason?: string;
  timestamp: string;
}

/**
 * Full Proposal document for the `.kibana-daybreak-proposals` index.
 */
export interface ProposalProperties {
  id: string;
  title: string;
  sourceWatch?: string;
  capability: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  status: ProposalStatus;
  owner?: string;
  createdAt: string;
  recommendation?: string;
  evidenceRefs: string[];
  expectedImpact?: string;
  riskCaveats?: string[];
  approvalRequirement?: 'manual' | 'automatic';
  hypothesis?: string;
  decisionHistory: DecisionHistoryEntry[];
  space?: string;
}

/** Proposal document as returned by ES. */
export type ProposalDocument = Pick<GetResponse<ProposalProperties>, '_source' | '_id'>;
