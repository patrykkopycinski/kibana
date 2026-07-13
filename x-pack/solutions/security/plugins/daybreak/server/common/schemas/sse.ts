/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetResponse } from '@elastic/elasticsearch/lib/api/types';

/** Status values for a Significant Security Event. */
export type SseStatus = 'open' | 'acknowledged' | 'closed' | 'escalated';

/** Type of finding an SSE represents. */
export type SseFindingType =
  | 'hunt_finding'
  | 'correlation'
  | 'threat_match'
  | 'coverage_gap'
  | 'escalation_request';

/** A recommended action attached to an SSE. */
export interface SseRecommendedAction {
  id: string;
  description: string;
  autonomyRequired: 'suggest' | 'approve' | 'auto';
}

/** An external destination the SSE should be sent to. */
export interface SseDestination {
  id: string;
  kind: 'case' | 'siem' | 'webhook' | 'slack' | 'email';
  reference?: string;
}

/** Spike-owned Significant Security Event document. */
export interface SignificantSecurityEventProperties {
  schemaVersion?: string;
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
  space?: string;
}

/** SSE document as returned by ES. */
export type SseDocument = Pick<GetResponse<SignificantSecurityEventProperties>, '_source' | '_id'>;
