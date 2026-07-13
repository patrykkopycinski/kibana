/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildInvestigationFromProposal } from './investigation_builder';
import type { ProposalProperties } from '../../client/proposals/types';
import { INVESTIGATION_GOLDEN_EXAMPLES } from '../../evals/investigation_golden_dataset';
import { scoreInvestigationShape } from '../../evals/investigation_dataset_gate';

const buildProposalFromInput = (
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

describe('buildInvestigationFromProposal', () => {
  it('builds an investigation from the golden example', () => {
    const example = INVESTIGATION_GOLDEN_EXAMPLES[0];
    const proposal = buildProposalFromInput(example.input);
    const investigation = buildInvestigationFromProposal({
      investigationId: 'daybreak-golden-investigation-escalated-lsass',
      proposal,
    });

    const { score, total } = scoreInvestigationShape(investigation, example.expected);

    expect(score).toBe(1);
    expect(total).toBeGreaterThan(0);
    expect(investigation.sourceProposalId).toBe(proposal.id);
    expect(investigation.hypotheses).toHaveLength(1);
    expect(investigation.timeline).toHaveLength(1);
    expect(investigation.entities).toHaveLength(1);
  });
});
