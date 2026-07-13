/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SignificantSecurityEventProperties } from '../common/schemas/sse';
import type { InvestigationProperties } from '../common/schemas/investigation';

export interface SseGoldenExample {
  id: string;
  description: string;
  input: InvestigationProperties;
  expected: Partial<SignificantSecurityEventProperties>;
}

const buildInputInvestigation = (): InvestigationProperties => ({
  id: 'investigation-lsass-001',
  title: 'Investigation: Mimikatz credential dumping on server01',
  summary: 'Escalate — lsass access on server01 matches credential dumping pattern.',
  sourceProposalId: 'proposal-lsass-001',
  sourceWatch: 'demo-watch-floor',
  sourceWorkerId: 'daybreak-alert-analysis-worker',
  capability: 'alert-analysis',
  status: 'escalated',
  hypotheses: [
    {
      id: 'investigation-lsass-001-h1',
      statement: 'The alert represents a genuine security incident requiring investigation.',
      confidence: 0.95,
      status: 'untested',
    },
  ],
  evidenceRefs: ['evidence-lsass-001'],
  timeline: [
    {
      timestamp: '2026-07-13T10:00:00.000Z',
      description: 'Proposal proposal-lsass-001 escalated to Watch Officer.',
      evidenceRef: 'evidence-lsass-001',
    },
  ],
  entities: [
    {
      id: 'investigation-lsass-001-watch',
      name: 'demo-watch-floor',
      type: 'other',
      relevance: 'contextual',
    },
  ],
  openQuestions: ['What additional evidence is needed to confirm or refute the primary hypothesis?'],
  createdAt: '2026-07-13T10:00:00.000Z',
  updatedAt: '2026-07-13T10:00:00.000Z',
});

export const SSE_GOLDEN_EXAMPLES: SseGoldenExample[] = [
  {
    id: 'daybreak-golden-sse-from-investigation',
    description: 'Escalated investigation becomes a Significant Security Event.',
    input: buildInputInvestigation(),
    expected: {
      title: 'SSE: Investigation: Mimikatz credential dumping on server01',
      status: 'escalated',
      findingType: 'escalation_request',
      capability: 'alert-analysis',
      sourceInvestigationId: 'investigation-lsass-001',
      severity: 'high',
    },
  },
];
