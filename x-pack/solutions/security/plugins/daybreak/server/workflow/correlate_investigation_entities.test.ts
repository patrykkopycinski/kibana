/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties } from '../client/proposals/types';
import type { InvestigationProperties } from '../common/schemas/investigation';
import {
  correlateProposalsToInvestigation,
  extractCorrelationEntitiesFromProposal,
  getInvestigationCorrelationEntities,
  resolveInvestigationHostNames,
} from './correlate_investigation_entities';

const baseProposal = (overrides: Partial<ProposalProperties>): ProposalProperties => ({
  id: 'proposal-1',
  title: 'Test proposal',
  capability: 'alert-analysis',
  severity: 'high',
  confidence: 0.9,
  status: 'escalated',
  evidenceRefs: ['evidence-1'],
  requiredApproverCount: 1,
  approvals: [],
  decisionHistory: [],
  createdAt: new Date().toISOString(),
  ...overrides,
});

const baseInvestigation = (
  overrides: Partial<InvestigationProperties>
): InvestigationProperties => ({
  id: 'investigation-1',
  title: 'Investigation',
  summary: 'Investigate FIN-WS-09 activity for user jdoe.',
  sourceProposalId: 'proposal-source',
  capability: 'alert-analysis',
  status: 'escalated',
  hypotheses: [],
  evidenceRefs: [],
  timeline: [],
  entities: [
    {
      id: 'entity-host',
      name: 'FIN-WS-09',
      type: 'host',
      relevance: 'primary',
    },
    {
      id: 'entity-user',
      name: 'jdoe',
      type: 'user',
      relevance: 'secondary',
    },
  ],
  openQuestions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('correlate_investigation_entities', () => {
  it('extracts host and user entities from proposal text', () => {
    const entities = extractCorrelationEntitiesFromProposal(
      baseProposal({
        recommendation: 'Isolate host FIN-WS-04 and reset credentials for user svc-backup.',
      })
    );

    expect(entities).toEqual(
      expect.arrayContaining([
        { type: 'host', name: 'FIN-WS-04' },
        { type: 'user', name: 'svc-backup' },
      ])
    );
  });

  it('correlates proposals by shared host entity', () => {
    const investigation = baseInvestigation({});
    const proposals = [
      baseProposal({
        id: 'proposal-source',
        recommendation: 'Initial alert on FIN-WS-09.',
      }),
      baseProposal({
        id: 'proposal-related',
        recommendation: 'Lateral movement detected on host FIN-WS-09.',
      }),
      baseProposal({
        id: 'proposal-unrelated',
        recommendation: 'Unrelated activity on FIN-WS-11.',
      }),
    ];

    const related = correlateProposalsToInvestigation(investigation, proposals);
    expect(related.map((proposal) => proposal.id)).toEqual(['proposal-related']);
  });

  it('falls back to sourceWatch when no host/user entities are present', () => {
    const investigation = baseInvestigation({
      entities: [],
      summary: 'No named entities yet.',
      sourceWatch: 'demo-watch-floor',
    });
    const proposals = [
      baseProposal({ id: 'proposal-source', sourceWatch: 'demo-watch-floor' }),
      baseProposal({ id: 'proposal-related', sourceWatch: 'demo-watch-floor', title: 'Related' }),
      baseProposal({ id: 'proposal-other', sourceWatch: 'other-watch', title: 'Other' }),
    ];

    const related = correlateProposalsToInvestigation(investigation, proposals);
    expect(related.map((proposal) => proposal.id)).toEqual(['proposal-related']);
  });

  it('resolves forensic host scope from investigation and source proposal', () => {
    const investigation = baseInvestigation({});
    const hosts = resolveInvestigationHostNames(
      investigation,
      baseProposal({ recommendation: 'Contain host FIN-WS-04 immediately.' })
    );

    expect(hosts).toEqual(expect.arrayContaining(['FIN-WS-09', 'FIN-WS-04']));
  });

  it('collects investigation correlation entities from entities and summary', () => {
    const entities = getInvestigationCorrelationEntities(baseInvestigation({}));
    expect(entities).toEqual(
      expect.arrayContaining([
        { type: 'host', name: 'FIN-WS-09' },
        { type: 'user', name: 'jdoe' },
      ])
    );
  });
});
