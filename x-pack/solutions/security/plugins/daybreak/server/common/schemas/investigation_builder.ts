/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties } from '../../client/proposals/types';
import { DAYBREAK_INVESTIGATION_SCHEMA_VERSION } from './versions';
import type {
  InvestigationEntity,
  InvestigationHypothesis,
  InvestigationProperties,
  InvestigationStatus,
  TimelineEntry,
} from './investigation';
import { extractCorrelationEntitiesFromProposal } from '../../workflow/correlate_investigation_entities';

export interface BuildInvestigationParams {
  investigationId: string;
  proposal: ProposalProperties;
  evidenceSummaries?: string[];
  now?: Date;
}

/** Build a deterministic investigation from an escalated proposal. */
export const buildInvestigationFromProposal = (
  params: BuildInvestigationParams
): InvestigationProperties => {
  const { investigationId, proposal, evidenceSummaries = [], now = new Date() } = params;
  const createdAt = now.toISOString();

  const status: InvestigationStatus = proposal.status === 'escalated' ? 'escalated' : 'open';

  const hypotheses: InvestigationHypothesis[] = [
    {
      id: `${investigationId}-h1`,
      statement: `The alert ${proposal.title} represents a genuine security incident requiring investigation.`,
      confidence: proposal.confidence,
      status: 'untested',
    },
  ];

  const timeline: TimelineEntry[] = [
    {
      timestamp: createdAt,
      description: `Proposal ${proposal.id} escalated to Watch Officer.`,
      evidenceRef: proposal.evidenceRefs[0],
    },
  ];

  const entities: InvestigationEntity[] = [];
  if (proposal.sourceWatch) {
    entities.push({
      id: `${investigationId}-watch`,
      name: proposal.sourceWatch,
      type: 'other',
      relevance: 'contextual',
    });
  }

  const seenEntities = new Set(entities.map((entity) => `${entity.type}:${entity.name.toLowerCase()}`));
  for (const extracted of extractCorrelationEntitiesFromProposal(proposal)) {
    const key = `${extracted.type}:${extracted.name.toLowerCase()}`;
    if (seenEntities.has(key)) {
      continue;
    }
    seenEntities.add(key);
    entities.push({
      id: `${investigationId}-entity-${extracted.type}-${extracted.name}`,
      name: extracted.name,
      type: extracted.type,
      relevance: extracted.type === 'host' ? 'primary' : 'secondary',
    });
  }

  const evidenceRefs = proposal.evidenceRefs.length
    ? proposal.evidenceRefs
    : evidenceSummaries.map((_, idx) => `${investigationId}-evidence-${idx}`);

  return {
    schemaVersion: DAYBREAK_INVESTIGATION_SCHEMA_VERSION,
    id: investigationId,
    title: `Investigation: ${proposal.title}`,
    summary:
      proposal.recommendation ??
      `Investigation opened from proposal ${proposal.id} with status ${proposal.status}.`,
    sourceProposalId: proposal.id,
    sourceWatch: proposal.sourceWatch,
    sourceWorkerId: proposal.sourceWorkerId,
    capability: proposal.capability,
    status,
    hypotheses,
    evidenceRefs,
    timeline,
    entities,
    openQuestions: [
      'What additional evidence is needed to confirm or refute the primary hypothesis?',
    ],
    decisions: [],
    createdAt,
    updatedAt: createdAt,
  };
};
