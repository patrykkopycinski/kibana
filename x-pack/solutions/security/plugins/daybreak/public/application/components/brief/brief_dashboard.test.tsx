/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { BriefDashboard, computeBriefSections } from './brief_dashboard';
import { useProposals } from '../../hooks/use_proposals';
import { useProposalTransition } from '../../hooks/use_proposal_transition';
import type { DaybreakProposal } from '../../../services/proposals_service';

jest.mock('../../hooks/use_proposals');
jest.mock('../../hooks/use_proposal_transition');

const mockUseProposals = useProposals as jest.Mock;
const mockUseProposalTransition = useProposalTransition as jest.Mock;

/**
 * Real-data-shaped fixture standing in for `GET /api/daybreak/proposals`
 * output (FR-014, FR-020) — mirrors `DaybreakProposal`, not any prototype
 * demo-seed shape, so the test proves the dashboard buckets `useProposals()`
 * data rather than any hardcoded/seeded state (same rationale as
 * `shell.test.tsx`'s `proposalsFixture`).
 *
 * Covers every bucket-relevant combination:
 *  - open + gate-ready (evidence + recommendation) → open thread, awaiting
 *    review, and next action.
 *  - open + evidence-only (no recommendation) → open thread only, not
 *    awaiting review, no next action.
 *  - open + recommendation-only (no evidence) → open thread and next action,
 *    not awaiting review (gate requires both).
 *  - terminal (`approved`) → excluded from every section even though it has
 *    both evidence and a recommendation.
 *  - terminal (`dismissed`) → excluded from every section.
 */
const proposalsFixture: DaybreakProposal[] = [
  {
    id: 'proposal-ready',
    title: 'Suspicious login from new device',
    capability: 'alert-analysis',
    severity: 'high',
    confidence: 0.82,
    status: 'needs-evidence',
    evidenceRefs: ['evidence-1'],
    recommendation: 'Block the source IP and force password reset.',
    createdAt: '2026-07-10T00:00:00.000Z',
  },
  {
    id: 'proposal-needs-recommendation',
    title: 'Unusual outbound data transfer',
    capability: 'alert-analysis',
    severity: 'medium',
    confidence: 0.6,
    status: 'new',
    evidenceRefs: ['evidence-2'],
    createdAt: '2026-07-10T01:00:00.000Z',
  },
  {
    id: 'proposal-needs-evidence',
    title: 'Privilege escalation attempt',
    capability: 'alert-analysis',
    severity: 'critical',
    confidence: 0.9,
    status: 'new',
    evidenceRefs: [],
    recommendation: 'Isolate the host immediately.',
    createdAt: '2026-07-10T02:00:00.000Z',
  },
  {
    id: 'proposal-approved',
    title: 'Already-resolved brute force attempt',
    capability: 'alert-analysis',
    severity: 'low',
    confidence: 0.95,
    status: 'approved',
    evidenceRefs: ['evidence-3'],
    recommendation: 'Already blocked.',
    createdAt: '2026-07-09T00:00:00.000Z',
  },
  {
    id: 'proposal-dismissed',
    title: 'False-positive alert',
    capability: 'alert-analysis',
    severity: 'low',
    confidence: 0.3,
    status: 'dismissed',
    evidenceRefs: [],
    createdAt: '2026-07-09T01:00:00.000Z',
  },
];

const renderDashboard = () =>
  render(
    <IntlProvider locale="en">
      <BriefDashboard />
    </IntlProvider>
  );

describe('computeBriefSections (FR-014, FR-020)', () => {
  it('buckets open (non-terminal) proposals into openThreads, excluding approved/dismissed', () => {
    const { openThreads } = computeBriefSections(proposalsFixture);

    expect(openThreads.map((proposal) => proposal.id)).toEqual([
      'proposal-ready',
      'proposal-needs-recommendation',
      'proposal-needs-evidence',
    ]);
  });

  it('buckets only gate-ready open proposals (evidence AND recommendation) into awaitingReview', () => {
    const { awaitingReview } = computeBriefSections(proposalsFixture);

    expect(awaitingReview.map((proposal) => proposal.id)).toEqual(['proposal-ready']);
  });

  it('buckets every open proposal with a non-empty recommendation into nextActions', () => {
    const { nextActions } = computeBriefSections(proposalsFixture);

    expect(nextActions.map((proposal) => proposal.id)).toEqual([
      'proposal-ready',
      'proposal-needs-evidence',
    ]);
  });

  it('surfaces a gate-ready proposal as the priority decision ahead of more severe incomplete work', () => {
    const { priorityProposalId } = computeBriefSections(proposalsFixture);

    expect(priorityProposalId).toBe('proposal-ready');
  });
});

describe('BriefDashboard (FR-014, FR-020)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProposalTransition.mockReturnValue({
      transition: jest.fn().mockResolvedValue(undefined),
      isLoading: false,
      missingRequirements: undefined,
    });
  });

  it('renders open threads + awaiting-review + next-actions from real-data fixtures', () => {
    mockUseProposals.mockReturnValue({
      proposals: proposalsFixture,
      isLoading: false,
      refresh: jest.fn(),
    });

    renderDashboard();

    expect(screen.getByTestId('daybreakBriefDashboard')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakBriefPriority')).toHaveTextContent(
      'Suspicious login from new device'
    );
    expect(screen.getByTestId('daybreakBriefPriority')).toHaveTextContent('Review ready');

    // Open threads (FR-014): 3 non-terminal proposals, terminal ones excluded.
    expect(screen.getByTestId('daybreakBriefOpenThreadsCount')).toHaveTextContent('3');
    expect(screen.getByTestId('daybreakBriefOpenThreadsItem-proposal-ready')).toBeInTheDocument();
    expect(
      screen.getByTestId('daybreakBriefOpenThreadsItem-proposal-needs-recommendation')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('daybreakBriefOpenThreadsItem-proposal-needs-evidence')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('daybreakBriefOpenThreadsItem-proposal-approved')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('daybreakBriefOpenThreadsItem-proposal-dismissed')
    ).not.toBeInTheDocument();

    // Awaiting review (FR-020): only the gate-ready proposal.
    expect(screen.getByTestId('daybreakBriefAwaitingReviewCount')).toHaveTextContent('1');
    expect(
      screen.getByTestId('daybreakBriefAwaitingReviewItem-proposal-ready')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('daybreakBriefAwaitingReviewItem-proposal-needs-recommendation')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('daybreakBriefAwaitingReviewItem-proposal-needs-evidence')
    ).not.toBeInTheDocument();

    // Next actions (FR-020): every open proposal with a recommendation.
    expect(screen.getByTestId('daybreakBriefNextActionsCount')).toHaveTextContent('2');
    expect(screen.getByTestId('daybreakBriefNextActionsItem-proposal-ready')).toHaveTextContent(
      'Block the source IP and force password reset.'
    );
    expect(
      screen.getByTestId('daybreakBriefNextActionsItem-proposal-needs-evidence')
    ).toHaveTextContent('Isolate the host immediately.');
    expect(
      screen.queryByTestId('daybreakBriefNextActionsItem-proposal-needs-recommendation')
    ).not.toBeInTheDocument();
  });

  it('renders an explicit, assertable loading state before the fixture resolves', () => {
    mockUseProposals.mockReturnValue({
      proposals: [],
      isLoading: true,
      refresh: jest.fn(),
    });

    renderDashboard();

    expect(screen.getByTestId('daybreakBriefPriorityLoading')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakBriefOpenThreadsLoading')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakBriefAwaitingReviewLoading')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakBriefNextActionsLoading')).toBeInTheDocument();
    expect(screen.queryByTestId('daybreakBriefOpenThreadsList')).not.toBeInTheDocument();
  });

  it('renders explicit empty states per section when there is no matching data', () => {
    mockUseProposals.mockReturnValue({
      proposals: [],
      isLoading: false,
      refresh: jest.fn(),
    });

    renderDashboard();

    expect(screen.getByTestId('daybreakBriefPriorityEmpty')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakBriefOpenThreadsEmpty')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakBriefAwaitingReviewEmpty')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakBriefNextActionsEmpty')).toBeInTheDocument();
  });
});
