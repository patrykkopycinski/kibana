/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  mapAttackDiscoveryToProposal,
  type AttackDiscoveryAlertSummary,
} from './attack_discovery_adapter';
import { ATTACK_DISCOVERY_SCENARIOS } from '../../evals/attack_discovery_dataset';

describe('mapAttackDiscoveryToProposal', () => {
  it('maps a basic AD summary to a new proposal with manual approval', () => {
    const ad: AttackDiscoveryAlertSummary = {
      id: 'ad-basic',
      title: 'Basic finding',
      description: 'A basic AD finding.',
      severity: 'medium',
      confidence: 0.75,
      tactics: ['initial-access'],
      relatedAlertIds: ['alert-1'],
      triageStatus: 'open',
    };

    const proposal = mapAttackDiscoveryToProposal({ proposalId: 'p-1', ad });

    expect(proposal.id).toBe('p-1');
    expect(proposal.title).toBe('Basic finding');
    expect(proposal.status).toBe('new');
    expect(proposal.severity).toBe('medium');
    expect(proposal.confidence).toBe(0.75);
    expect(proposal.approvalRequirement).toBe('manual');
    expect(proposal.requiredApproverCount).toBe(1);
    expect(proposal.evidenceRefs).toEqual(['alert-1']);
    expect(proposal.capability).toBe('attack-discovery');
  });

  it('maps closed triage to dismissed and acknowledged to approved', () => {
    const closed = mapAttackDiscoveryToProposal({
      proposalId: 'p-closed',
      ad: { id: 'ad-closed', title: 'Closed', triageStatus: 'closed' },
    });
    expect(closed.status).toBe('dismissed');

    const acknowledged = mapAttackDiscoveryToProposal({
      proposalId: 'p-ack',
      ad: { id: 'ad-ack', title: 'Acknowledged', triageStatus: 'acknowledged' },
    });
    expect(acknowledged.status).toBe('approved');
  });

  it('maps each dataset scenario to the expected outcome', () => {
    const scenarios = ATTACK_DISCOVERY_SCENARIOS;

    expect(scenarios).toHaveLength(5);

    const continuation = mapAttackDiscoveryToProposal({
      proposalId: 'p-continuation',
      ad: scenarios.find((s) => s.id === 'ad-useful-continuation')!.ad,
    });
    expect(continuation.status).toBe('new');
    expect(continuation.recommendation).toContain('Review Attack Discovery finding');
    expect(continuation.expectedImpact).toContain('lateral-movement');

    const monitor = mapAttackDiscoveryToProposal({
      proposalId: 'p-monitor',
      ad: scenarios.find((s) => s.id === 'ad-monitor-only')!.ad,
    });
    expect(monitor.status).toBe('dismissed');
    expect(monitor.recommendation).toContain('Monitor only');

    const duplicate = mapAttackDiscoveryToProposal({
      proposalId: 'p-duplicate',
      ad: scenarios.find((s) => s.id === 'ad-duplicate-low-value')!.ad,
    });
    expect(duplicate.status).toBe('dismissed');
    expect(duplicate.recommendation).toContain('Duplicate of ad-001');

    const missing = mapAttackDiscoveryToProposal({
      proposalId: 'p-missing',
      ad: scenarios.find((s) => s.id === 'ad-missing-evidence')!.ad,
    });
    expect(missing.status).toBe('needs-evidence');
    expect(missing.recommendation).toContain('Missing evidence');

    const contradictory = mapAttackDiscoveryToProposal({
      proposalId: 'p-contradictory',
      ad: scenarios.find((s) => s.id === 'ad-contradictory-evidence')!.ad,
    });
    expect(contradictory.status).toBe('needs-evidence');
    expect(contradictory.recommendation).toContain('Contradicted by proxy-logs');
  });
});
