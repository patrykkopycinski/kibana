/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties } from '../../client/proposals/types';
import type { SecurityKnowledgeIndicatorProperties } from './ski';
import { DAYBREAK_PROPOSAL_SCHEMA_VERSION } from './versions';

export interface MapSkiToHuntProposalParams {
  proposalId: string;
  ski: SecurityKnowledgeIndicatorProperties;
  sourceWatchId?: string;
  sourceWorkerId?: string;
  space?: string;
  now?: Date;
}

const skiTypeToSeverity = (
  type: SecurityKnowledgeIndicatorProperties['type']
): ProposalProperties['severity'] => {
  if (type === 'threat') return 'high';
  if (type === 'vulnerability') return 'medium';
  if (type === 'coverage_gap') return 'low';
  return 'medium';
};

/**
 * Map a Security Knowledge Indicator into a Dark Watch hunt {@link ProposalProperties}.
 */
export const mapSkiToHuntProposal = (
  params: MapSkiToHuntProposalParams
): ProposalProperties => {
  const {
    proposalId,
    ski,
    sourceWatchId = ski.sourceWatch ?? 'dark-watch',
    sourceWorkerId = 'dark-watch-adapter',
    space,
    now = new Date(),
  } = params;

  const refsSummary =
    ski.relatedRefs.length > 0 ? ` Related refs: ${ski.relatedRefs.join(', ')}.` : '';
  const hypothesis = `SKI ${ski.id} (${ski.type}): ${ski.normalizedName} — confidence ${ski.confidence}, scope ${ski.scope}.${refsSummary}`;

  const recommendationParts = [
    `Investigate ${ski.normalizedName} surfaced by ${ski.source}.`,
    ski.supportingEvidence.length > 0
      ? `Evidence: ${ski.supportingEvidence.join(', ')}.`
      : undefined,
    ski.expiresAt ? `Indicator expires ${ski.expiresAt}.` : undefined,
  ].filter(Boolean);

  return {
    id: proposalId,
    schemaVersion: DAYBREAK_PROPOSAL_SCHEMA_VERSION,
    title: `Hunt: ${ski.normalizedName}`,
    sourceWatch: sourceWatchId,
    sourceWorkerId,
    capability: 'dark-watch',
    severity: skiTypeToSeverity(ski.type),
    confidence: ski.confidence,
    status: 'new',
    recommendation: recommendationParts.join(' '),
    evidenceRefs: ski.supportingEvidence,
    hypothesis,
    expectedImpact: ski.scope,
    approvalRequirement: 'manual',
    requiredApproverCount: 1,
    approvals: [],
    decisionHistory: [],
    createdAt: now.toISOString(),
    space,
  };
};
