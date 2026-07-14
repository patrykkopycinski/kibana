/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SecurityKnowledgeIndicatorProperties } from '../common/schemas/ski';
import type { ProposalProperties } from '../client/proposals/types';
import type { SignificantSecurityEventProperties } from '../common/schemas/sse';
import { mapSkiToHuntProposal } from '../common/schemas/hunt_adapter';
import { buildSseFromProposal } from '../common/schemas/sse_builder';

export const HUNT_GOLDEN_SKI: SecurityKnowledgeIndicatorProperties = {
  id: 'ski-dark-watch-golden',
  type: 'threat',
  normalizedName: 'cobalt-strike-beacon-pattern',
  source: 'dark-watch-ingest',
  collectedAt: '2026-07-13T12:00:00.000Z',
  confidence: 0.88,
  scope: 'endpoint-beaconing',
  supportingEvidence: ['evidence-ski-001'],
  relatedRefs: ['T1055', 'CVE-2023-1234'],
  sourceWatch: 'dark-watch-demo',
};

export interface HuntGoldenExample {
  id: string;
  description: string;
  ski: SecurityKnowledgeIndicatorProperties;
  expectedProposal: Partial<ProposalProperties>;
  expectedSse: Partial<SignificantSecurityEventProperties>;
}

export const HUNT_GOLDEN_EXAMPLES: HuntGoldenExample[] = [
  {
    id: 'daybreak-golden-hunt-proposal',
    description: 'SKI threat indicator becomes a dark-watch hunt proposal and hunt_finding SSE.',
    ski: HUNT_GOLDEN_SKI,
    expectedProposal: {
      capability: 'dark-watch',
      severity: 'high',
      status: 'new',
      title: 'Hunt: cobalt-strike-beacon-pattern',
    },
    expectedSse: {
      findingType: 'hunt_finding',
      capability: 'dark-watch',
      severity: 'high',
    },
  },
];

export const buildHuntGoldenSse = (
  proposalId = 'hunt-proposal-golden',
  sseId = 'sse-hunt-golden'
): SignificantSecurityEventProperties => {
  const proposal = mapSkiToHuntProposal({ proposalId, ski: HUNT_GOLDEN_SKI });
  return buildSseFromProposal({ sseId, proposal });
};
