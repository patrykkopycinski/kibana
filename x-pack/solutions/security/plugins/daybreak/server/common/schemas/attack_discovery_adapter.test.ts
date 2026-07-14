/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';
import path from 'path';
import {
  mapAttackDiscoveryToProposal,
  type AttackDiscoveryAlertSummary,
} from './attack_discovery_adapter';
import { ATTACK_DISCOVERY_SCENARIOS } from '../../evals/attack_discovery_dataset';

const platformSample = JSON.parse(
  readFileSync(path.join(__dirname, '../../evals/fixtures/attack_discovery_9_5_platform_sample.json'), 'utf8')
);

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

    const { proposal, evidencePackages } = mapAttackDiscoveryToProposal({ proposalId: 'p-1', ad });

    expect(proposal.id).toBe('p-1');
    expect(proposal.title).toBe('Basic finding');
    expect(proposal.status).toBe('new');
    expect(proposal.severity).toBe('medium');
    expect(proposal.confidence).toBe(0.75);
    expect(proposal.approvalRequirement).toBe('manual');
    expect(proposal.requiredApproverCount).toBe(1);
    expect(proposal.evidenceRefs).toContain('evidence-ad-ad-basic-alert-0');
    expect(proposal.evidenceRefs).toContain('evidence-ad-ad-basic-source');
    expect(proposal.evidenceRefs).not.toContain('alert-1');
    expect(proposal.capability).toBe('attack-discovery');
    expect(evidencePackages.length).toBeGreaterThanOrEqual(1);
  });

  it('maps closed triage to dismissed and acknowledged to approved', () => {
    const closed = mapAttackDiscoveryToProposal({
      proposalId: 'p-closed',
      ad: { id: 'ad-closed', title: 'Closed', triageStatus: 'closed' },
    }).proposal;
    expect(closed.status).toBe('dismissed');

    const acknowledged = mapAttackDiscoveryToProposal({
      proposalId: 'p-ack',
      ad: { id: 'ad-ack', title: 'Acknowledged', triageStatus: 'acknowledged' },
    }).proposal;
    expect(acknowledged.status).toBe('approved');
  });

  it('maps each dataset scenario to the expected outcome', () => {
    const scenarios = ATTACK_DISCOVERY_SCENARIOS;

    expect(scenarios).toHaveLength(6);

    const continuation = mapAttackDiscoveryToProposal({
      proposalId: 'p-continuation',
      ad: scenarios.find((s) => s.id === 'ad-useful-continuation')!.ad,
    }).proposal;
    expect(continuation.status).toBe('new');
    expect(continuation.recommendation).toContain('Continue Attack Discovery investigation');
    expect(continuation.expectedImpact).toContain('lateral-movement');

    const monitor = mapAttackDiscoveryToProposal({
      proposalId: 'p-monitor',
      ad: scenarios.find((s) => s.id === 'ad-monitor-only')!.ad,
    }).proposal;
    expect(monitor.status).toBe('dismissed');
    expect(monitor.recommendation).toContain('Monitor only');

    const duplicate = mapAttackDiscoveryToProposal({
      proposalId: 'p-duplicate',
      ad: scenarios.find((s) => s.id === 'ad-duplicate-low-value')!.ad,
    }).proposal;
    expect(duplicate.status).toBe('dismissed');
    expect(duplicate.recommendation).toContain('Duplicate of ad-001');

    const missing = mapAttackDiscoveryToProposal({
      proposalId: 'p-missing',
      ad: scenarios.find((s) => s.id === 'ad-missing-evidence')!.ad,
    }).proposal;
    expect(missing.status).toBe('needs-evidence');
    expect(missing.recommendation).toContain('Missing evidence');

    const contradictory = mapAttackDiscoveryToProposal({
      proposalId: 'p-contradictory',
      ad: scenarios.find((s) => s.id === 'ad-contradictory-evidence')!.ad,
    }).proposal;
    expect(contradictory.status).toBe('needs-evidence');
    expect(contradictory.recommendation).toContain('Contradicted by proxy-logs');

    const acknowledged = mapAttackDiscoveryToProposal({
      proposalId: 'p-ack-continuation',
      ad: scenarios.find((s) => s.id === 'ad-acknowledged-continuation')!.ad,
    }).proposal;
    expect(acknowledged.status).toBe('approved');
  });

  it('maps 9.5 generation output from platform sample fixture', () => {
    const { proposal, evidencePackages, normalized } = mapAttackDiscoveryToProposal({
      proposalId: 'p-platform-gen',
      ad: platformSample.discovery,
      generation: platformSample.generation,
      continuation: platformSample.continuationContext,
    });

    expect(normalized.inputKind).toBe('generation-output');
    expect(normalized.generationUuid).toBe(platformSample.generation.execution_uuid);
    expect(normalized.alertIds).toHaveLength(2);
    expect(proposal.status).toBe('new');
    expect(proposal.recommendation).toContain('Continue Attack Discovery investigation');
    expect(proposal.evidenceRefs).toContain(`evidence-ad-${platformSample.discovery.id}-alert-0`);
    expect(proposal.evidenceRefs).toContain(`evidence-ad-${platformSample.discovery.id}-alert-1`);
    expect(proposal.evidenceRefs).not.toContain(platformSample.discovery.alertIds[0]);
    expect(evidencePackages).toHaveLength(4);
    expect(proposal.evidenceRefs).toEqual(evidencePackages.map((pkg) => pkg.id));
    expect(evidencePackages[0].stanceSignals?.[0].note).toContain('powershell.exe');
  });

  it('maps persisted AttackDiscoveryApiAlert (snake_case) from platform sample', () => {
    const { proposal, normalized } = mapAttackDiscoveryToProposal({
      proposalId: 'p-platform-api',
      ad: platformSample.apiAlert,
      continuation: platformSample.continuationContext,
    });

    expect(normalized.inputKind).toBe('api-alert');
    expect(normalized.riskScore).toBe(85);
    expect(normalized.severity).toBe('high');
    expect(normalized.sourceIndex).toBe('.alerts-security.alerts-default');
    expect(normalized.generationUuid).toBe(platformSample.apiAlert.generation_uuid);
    expect(proposal.hypothesis).toContain('finance-ws-01');
    expect(proposal.riskCaveats ?? []).toEqual([]);
  });
});
