/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DAYBREAK_PROPOSAL_SCHEMA_VERSION } from '../schemas/versions';
import {
  FIELD_DECISIONS,
  UNKNOWNS_MATRIX,
  UNMAPPED_SPIKE_PROPOSAL_FIELDS,
  buildGoldenAdPair,
  buildGoldenApprovedProposal,
  buildGoldenFprPair,
  buildRatificationPacket,
} from './ratification_packet';
import { mapProposalToCwlStub } from './watch_floor_contract';

describe('ratification_packet', () => {
  it('builds FPR golden proposal from benign-scanner dataset row via spike builders', () => {
    const { proposal, evidence } = buildGoldenFprPair();

    expect(proposal.schemaVersion).toBe(DAYBREAK_PROPOSAL_SCHEMA_VERSION);
    expect(proposal.capability).toBe('false-positive-reduction');
    expect(proposal.status).toBe('dismissed');
    expect(proposal.evidenceRefs).toContain(evidence.id);
    expect(evidence.stance).toBe('against');
    expect(evidence.stanceSignals?.length).toBeGreaterThanOrEqual(2);
    expect(proposal.recommendation).toMatch(/^Dismiss —/);
  });

  it('builds AD golden proposal from attack_discovery_dataset useful-continuation', () => {
    const { proposal, evidence } = buildGoldenAdPair();

    expect(proposal.capability).toBe('attack-discovery');
    expect(proposal.severity).toBe('high');
    expect(proposal.evidenceRefs).toContain(evidence.id);
    expect(evidence.sensitivityLabel).toBe('internal');
    expect(proposal.recommendation).toMatch(/Continue Attack Discovery investigation/);
  });

  it('approved variant carries decision history for HITL flush', () => {
    const { proposal: base } = buildGoldenFprPair();
    const approved = buildGoldenApprovedProposal(base);

    expect(approved.status).toBe('approved');
    expect(approved.approvals).toHaveLength(1);
    expect(approved.decisionHistory).toHaveLength(1);
    expect(approved.decision?.type).toBe('approve');
  });

  it('maps golden proposals to CWL stubs without unmapped fields', () => {
    const packet = buildRatificationPacket();

    for (const pair of packet.cwlStubPairs) {
      const stub = mapProposalToCwlStub(pair.spike);
      expect(stub).toEqual(pair.cwlStub);
      expect(stub).not.toHaveProperty('capability');
      expect(stub).not.toHaveProperty('evidenceRefs');
    }
  });

  it('exports field decisions and unknowns matrices for #17942 flush', () => {
    expect(FIELD_DECISIONS.length).toBeGreaterThanOrEqual(8);
    expect(UNKNOWNS_MATRIX.length).toBeGreaterThanOrEqual(6);
    expect(UNMAPPED_SPIKE_PROPOSAL_FIELDS).toContain('evidenceRefs');
  });

  it('assembles a complete ratification packet', () => {
    const packet = buildRatificationPacket();

    expect(packet.ratificationEpic).toBe('elastic/security-team#17942');
    expect(packet.goldenExamples.proposalFprDismiss.id).toBe(
      'golden-proposal-fpr-scanner-exception'
    );
    expect(packet.goldenExamples.proposalAdContinuation.id).toBe(
      'golden-proposal-ad-lateral-movement'
    );
    expect(packet.cwlStubPairs).toHaveLength(3);
    expect(packet.requirementsCoverage.proposalQueue.spikeSatisfies).toBe(true);
  });
});
