/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mapSkiToHuntProposal } from './hunt_adapter';
import type { SecurityKnowledgeIndicatorProperties } from './ski';
import { HUNT_GOLDEN_SKI } from '../../evals/hunt_golden_dataset';

const buildSki = (
  overrides: Partial<SecurityKnowledgeIndicatorProperties> = {}
): SecurityKnowledgeIndicatorProperties => ({
  ...HUNT_GOLDEN_SKI,
  ...overrides,
});

describe('mapSkiToHuntProposal', () => {
  it('maps a threat SKI to a dark-watch hunt proposal', () => {
    const ski = buildSki();
    const proposal = mapSkiToHuntProposal({ proposalId: 'hunt-p-1', ski });

    expect(proposal.id).toBe('hunt-p-1');
    expect(proposal.capability).toBe('dark-watch');
    expect(proposal.title).toBe('Hunt: cobalt-strike-beacon-pattern');
    expect(proposal.status).toBe('new');
    expect(proposal.severity).toBe('high');
    expect(proposal.confidence).toBe(0.88);
    expect(proposal.hypothesis).toContain('ski-dark-watch-golden');
    expect(proposal.hypothesis).toContain('cobalt-strike-beacon-pattern');
    expect(proposal.evidenceRefs).toEqual(['evidence-ski-001']);
    expect(proposal.approvalRequirement).toBe('manual');
  });

  it('maps vulnerability type to medium severity', () => {
    const proposal = mapSkiToHuntProposal({
      proposalId: 'hunt-vuln',
      ski: buildSki({ type: 'vulnerability', normalizedName: 'cve-2024-1234' }),
    });
    expect(proposal.severity).toBe('medium');
    expect(proposal.title).toBe('Hunt: cve-2024-1234');
  });

  it('maps coverage_gap type to low severity', () => {
    const proposal = mapSkiToHuntProposal({
      proposalId: 'hunt-gap',
      ski: buildSki({ type: 'coverage_gap', normalizedName: 'missing-edr-coverage' }),
    });
    expect(proposal.severity).toBe('low');
  });

  it('uses sourceWatch from SKI when sourceWatchId is omitted', () => {
    const proposal = mapSkiToHuntProposal({
      proposalId: 'hunt-watch',
      ski: buildSki({ sourceWatch: 'custom-dark-watch' }),
    });
    expect(proposal.sourceWatch).toBe('custom-dark-watch');
  });
});
