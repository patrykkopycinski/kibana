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
 * Decision taxonomy values. Maps to terminal proposal statuses but captures
 * the operator's decision intent explicitly for analytics and audit.
 */
export type DecisionTaxonomy = 'approve' | 'modify' | 'defer' | 'dismiss' | 'escalate';

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
 * ApprovalEntry records a single human approval action.
 */
export interface ApprovalEntry {
  actor: string;
  timestamp: string;
  reason?: string;
}

/**
 * Recorded decision when a proposal reaches a terminal status.
 */
export interface DecisionRecord {
  type: DecisionTaxonomy;
  actor?: string;
  reason?: string;
  timestamp: string;
}

/**
 * Full Proposal document for the `.kibana-daybreak-proposals` index.
 */
export interface ProposalProperties {
  schemaVersion?: string;
  id: string;
  title: string;
  sourceWatch?: string;
  /** WorkerRef id that emitted this proposal (CWL stub alignment). */
  sourceWorkerId?: string;
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
  requiredApproverCount: number;
  approvals: ApprovalEntry[];
  hypothesis?: string;
  decisionHistory: DecisionHistoryEntry[];
  decision?: DecisionRecord;
  space?: string;
}

/** Proposal document as returned by ES. */
export type ProposalDocument = Pick<GetResponse<ProposalProperties>, '_source' | '_id'>;
