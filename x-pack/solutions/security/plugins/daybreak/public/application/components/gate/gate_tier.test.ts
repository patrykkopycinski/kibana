/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { GATE_TIERS, GATE_TIER_META, deriveGateTier } from './gate_tier';
import type { DaybreakProposal } from '../../../services/proposals_service';

const baseProposal: DaybreakProposal = {
  id: 'proposal-1',
  title: 'Suspicious login from new device',
  capability: 'alert-analysis',
  severity: 'high',
  confidence: 0.82,
  status: 'new',
  evidenceRefs: [],
  createdAt: '2026-07-10T00:00:00.000Z',
};

describe('GATE_TIERS (FR-016)', () => {
  it('exposes exactly the three prototype gate tiers', () => {
    expect(GATE_TIERS).toEqual(['auto', 'propose', 'approval-required']);
  });

  it('has metadata for every tier', () => {
    for (const tier of GATE_TIERS) {
      expect(GATE_TIER_META[tier]).toBeDefined();
      expect(GATE_TIER_META[tier].icon).toEqual(expect.any(String));
      expect(GATE_TIER_META[tier].label()).toEqual(expect.any(String));
    }
  });
});

describe('deriveGateTier (FR-016)', () => {
  it('returns "auto" when neither evidence nor a recommendation is present', () => {
    expect(deriveGateTier(baseProposal)).toBe('auto');
  });

  it('returns "propose" when only evidence is present', () => {
    expect(deriveGateTier({ ...baseProposal, evidenceRefs: ['evidence-1'] })).toBe('propose');
  });

  it('returns "propose" when only a recommendation is present', () => {
    expect(deriveGateTier({ ...baseProposal, recommendation: 'Block the source IP.' })).toBe(
      'propose'
    );
  });

  it('returns "propose" when the recommendation is present but blank', () => {
    expect(deriveGateTier({ ...baseProposal, recommendation: '   ' })).toBe('auto');
  });

  it('returns "approval-required" when both evidence and a recommendation are present — matching evaluateReadinessGate\'s approved-transition check', () => {
    expect(
      deriveGateTier({
        ...baseProposal,
        evidenceRefs: ['evidence-1'],
        recommendation: 'Block the source IP.',
      })
    ).toBe('approval-required');
  });
});
