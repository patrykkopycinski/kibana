/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mapAttackDiscoveryToProposal } from '../common/schemas/attack_discovery_adapter';
import { mapSkiToHuntProposal } from '../common/schemas/hunt_adapter';
import { buildInvestigationFromProposal } from '../common/schemas/investigation_builder';
import { buildSseFromInvestigation, buildSseFromProposal } from '../common/schemas/sse_builder';
import type { ProposalProperties } from '../client/proposals/types';
import { ATTACK_DISCOVERY_SCENARIOS } from './attack_discovery_dataset';
import { HUNT_GOLDEN_EXAMPLES, buildHuntGoldenSse } from './hunt_golden_dataset';
import { INVESTIGATION_GOLDEN_EXAMPLES } from './investigation_golden_dataset';
import { SSE_GOLDEN_EXAMPLES } from './sse_golden_dataset';
import { scoreInvestigationShape } from './investigation_dataset_gate';
import { scoreSseShape } from './sse_dataset_gate';

const buildProposalFromInvestigationInput = (
  input: (typeof INVESTIGATION_GOLDEN_EXAMPLES)[0]['input']
): ProposalProperties => ({
  id: input.proposalId,
  title: input.title,
  status: input.status,
  confidence: input.confidence,
  recommendation: input.recommendation,
  evidenceRefs: input.evidenceRefs,
  sourceWatch: input.sourceWatch,
  sourceWorkerId: input.sourceWorkerId,
  capability: input.capability,
  severity: 'high',
  requiredApproverCount: 1,
  approvals: [],
  decisionHistory: [],
  createdAt: new Date().toISOString(),
});

const AD_EXPECTED_STATUS: Record<string, string> = {
  'ad-useful-continuation': 'new',
  'ad-monitor-only': 'dismissed',
  'ad-duplicate-low-value': 'dismissed',
  'ad-missing-evidence': 'needs-evidence',
  'ad-contradictory-evidence': 'needs-evidence',
  'ad-acknowledged-continuation': 'approved',
  'ad-blackhat-golden-path': 'new',
};

describe('full MVP capability offline gates', () => {
  it('maps all six Attack Discovery dataset scenarios to expected proposal statuses', () => {
    expect(ATTACK_DISCOVERY_SCENARIOS).toHaveLength(6);

    for (const scenario of ATTACK_DISCOVERY_SCENARIOS) {
      const { proposal } = mapAttackDiscoveryToProposal({
        proposalId: `gate-${scenario.id}`,
        ad: scenario.ad,
      });
      expect(proposal.capability).toBe('attack-discovery');
      expect(proposal.status).toBe(AD_EXPECTED_STATUS[scenario.id]);
    }
  });

  it('scores hunt golden examples as dark-watch proposals with hunt_finding SSE', () => {
    for (const example of HUNT_GOLDEN_EXAMPLES) {
      const proposal = mapSkiToHuntProposal({ proposalId: 'hunt-gate-1', ski: example.ski });
      expect(proposal.capability).toBe(example.expectedProposal.capability);
      expect(proposal.status).toBe(example.expectedProposal.status);

      const sse = buildSseFromProposal({ sseId: 'sse-gate-1', proposal });
      expect(sse.findingType).toBe(example.expectedSse.findingType);
      expect(sse.capability).toBe(example.expectedSse.capability);
    }

    const goldenSse = buildHuntGoldenSse();
    expect(goldenSse.findingType).toBe('hunt_finding');
  });

  it('scores investigation golden examples at 100% shape match', () => {
    for (const example of INVESTIGATION_GOLDEN_EXAMPLES) {
      const proposal = buildProposalFromInvestigationInput(example.input);
      const investigation = buildInvestigationFromProposal({
        investigationId: example.id,
        proposal,
      });
      const { score } = scoreInvestigationShape(investigation, example.expected);
      expect(score).toBe(1);
    }
  });

  it('scores SSE golden examples at 100% shape match', () => {
    for (const example of SSE_GOLDEN_EXAMPLES) {
      const sse = buildSseFromInvestigation({
        sseId: example.id,
        investigation: example.input,
      });
      const { score } = scoreSseShape(sse, example.expected);
      expect(score).toBe(1);
    }
  });
});
