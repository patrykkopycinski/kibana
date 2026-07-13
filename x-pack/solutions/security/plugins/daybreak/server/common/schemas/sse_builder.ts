/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InvestigationProperties } from './investigation';
import type { ProposalProperties } from '../../client/proposals/types';
import { DAYBREAK_SSE_SCHEMA_VERSION } from './versions';
import type { SseRecommendedAction, SignificantSecurityEventProperties, SseStatus } from './sse';

export interface BuildSseFromInvestigationParams {
  sseId: string;
  investigation: InvestigationProperties;
  now?: Date;
}

export interface BuildSseFromProposalParams {
  sseId: string;
  proposal: ProposalProperties;
  now?: Date;
}

const buildRecommendedActions = (sourceId: string): SseRecommendedAction[] => [
  {
    id: `${sourceId}-action-1`,
    description: 'Review correlated entities and timeline before approving response.',
    autonomyRequired: 'suggest',
  },
  {
    id: `${sourceId}-action-2`,
    description: 'Escalate to incident response if confidence is high and impact is broad.',
    autonomyRequired: 'approve',
  },
];

/** Build a deterministic SSE from an Investigation. */
export const buildSseFromInvestigation = (
  params: BuildSseFromInvestigationParams
): SignificantSecurityEventProperties => {
  const { sseId, investigation, now = new Date() } = params;
  const createdAt = now.toISOString();
  const status: SseStatus = investigation.status === 'escalated' ? 'escalated' : 'open';

  return {
    schemaVersion: DAYBREAK_SSE_SCHEMA_VERSION,
    id: sseId,
    title: `SSE: ${investigation.title}`,
    description: investigation.summary,
    findingType: 'escalation_request',
    sourceInvestigationId: investigation.id,
    sourceWatch: investigation.sourceWatch,
    sourceWorkerId: investigation.sourceWorkerId,
    capability: investigation.capability,
    severity: investigation.status === 'escalated' ? 'high' : 'medium',
    confidence: investigation.hypotheses[0]?.confidence ?? 0.7,
    status,
    evidenceRefs: investigation.evidenceRefs,
    entities: investigation.entities.map((entity) => entity.name),
    recommendedActions: buildRecommendedActions(sseId),
    destinations: [],
    createdAt,
    updatedAt: createdAt,
  };
};

/** Build a deterministic SSE from an escalated Proposal. */
export const buildSseFromProposal = (
  params: BuildSseFromProposalParams
): SignificantSecurityEventProperties => {
  const { sseId, proposal, now = new Date() } = params;
  const createdAt = now.toISOString();
  const status: SseStatus = proposal.status === 'escalated' ? 'escalated' : 'open';

  return {
    schemaVersion: DAYBREAK_SSE_SCHEMA_VERSION,
    id: sseId,
    title: `SSE: ${proposal.title}`,
    description: proposal.recommendation ?? `Proposal ${proposal.id} promoted to SSE.`,
    findingType: 'escalation_request',
    sourceProposalId: proposal.id,
    sourceWatch: proposal.sourceWatch,
    sourceWorkerId: proposal.sourceWorkerId,
    capability: proposal.capability,
    severity: proposal.severity,
    confidence: proposal.confidence,
    status,
    evidenceRefs: proposal.evidenceRefs,
    entities: proposal.sourceWatch ? [proposal.sourceWatch] : [],
    recommendedActions: buildRecommendedActions(sseId),
    destinations: [],
    createdAt,
    updatedAt: createdAt,
  };
};
