/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InvestigationProperties } from '../common/schemas/investigation';

export interface InvestigationGoldenExample {
  id: string;
  description: string;
  input: {
    proposalId: string;
    title: string;
    status: 'escalated' | 'new' | 'approved';
    confidence: number;
    recommendation?: string;
    evidenceRefs: string[];
    sourceWatch?: string;
    sourceWorkerId?: string;
    capability: string;
  };
  expected: Partial<InvestigationProperties>;
}

export const INVESTIGATION_GOLDEN_EXAMPLES: InvestigationGoldenExample[] = [
  {
    id: 'daybreak-golden-investigation-escalated-lsass',
    description: 'Escalated Mimikatz proposal becomes an investigation with open questions and a timeline.',
    input: {
      proposalId: 'proposal-lsass-001',
      title: 'Mimikatz credential dumping on server01',
      status: 'escalated',
      confidence: 0.95,
      recommendation: 'Escalate — lsass access on server01 matches credential dumping pattern.',
      evidenceRefs: ['evidence-lsass-001'],
      sourceWatch: 'demo-watch-floor',
      sourceWorkerId: 'daybreak-alert-analysis-worker',
      capability: 'alert-analysis',
    },
    expected: {
      title: 'Investigation: Mimikatz credential dumping on server01',
      status: 'escalated',
      capability: 'alert-analysis',
      openQuestions: [
        'What additional evidence is needed to confirm or refute the primary hypothesis?',
      ],
    },
  },
];
