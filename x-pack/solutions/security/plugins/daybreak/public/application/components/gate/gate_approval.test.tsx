/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { GateApproval } from './gate_approval';
import { useProposalTransition } from '../../hooks/use_proposal_transition';
import type { DaybreakProposal } from '../../../services/proposals_service';

jest.mock('../../hooks/use_proposal_transition');

const mockUseProposalTransition = useProposalTransition as jest.Mock;

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

const renderGate = (proposal: DaybreakProposal) =>
  render(
    <IntlProvider locale="en">
      <GateApproval proposal={proposal} />
    </IntlProvider>
  );

describe('GateApproval (FR-016, FR-7, FR-018)', () => {
  let transition: jest.Mock;

  beforeEach(() => {
    transition = jest.fn();
    mockUseProposalTransition.mockReturnValue({
      transition,
      isLoading: false,
      missingRequirements: undefined,
    });
  });

  it('renders only the "auto" tier badge with no approve button when neither evidence nor a recommendation is present', () => {
    renderGate(baseProposal);

    expect(screen.getByTestId('daybreakGateTierBadge-auto')).toBeInTheDocument();
    expect(screen.queryByTestId('daybreakGateApproveButton')).not.toBeInTheDocument();
  });

  it('renders only the "propose" tier badge with no approve button when only evidence is present', () => {
    renderGate({ ...baseProposal, evidenceRefs: ['evidence-1'] });

    expect(screen.getByTestId('daybreakGateTierBadge-propose')).toBeInTheDocument();
    expect(screen.queryByTestId('daybreakGateApproveButton')).not.toBeInTheDocument();
  });

  it('renders the "approval-required" tier badge with an approve button when both evidence and a recommendation are present', () => {
    renderGate({
      ...baseProposal,
      evidenceRefs: ['evidence-1'],
      recommendation: 'Block the source IP.',
    });

    expect(screen.getByTestId('daybreakGateTierBadge-approval-required')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakGateApproveButton')).toBeInTheDocument();
  });

  it('calls transition with the approved target status when the approve button is clicked', () => {
    const readyProposal: DaybreakProposal = {
      ...baseProposal,
      evidenceRefs: ['evidence-1'],
      recommendation: 'Block the source IP.',
    };
    renderGate(readyProposal);

    fireEvent.click(screen.getByTestId('daybreakGateApproveButton'));

    expect(transition).toHaveBeenCalledWith({ id: 'proposal-1', targetStatus: 'approved' });
  });

  it('renders the missingRequirements failure callout when the gate rejects the transition (FR-018)', () => {
    mockUseProposalTransition.mockReturnValue({
      transition,
      isLoading: false,
      missingRequirements: ['evidence', 'recommendation'],
    });

    renderGate(baseProposal);

    expect(screen.getByTestId('daybreakGateApprovalFailure')).toBeInTheDocument();
  });

  it('does not render the failure callout when there are no missingRequirements', () => {
    renderGate(baseProposal);

    expect(screen.queryByTestId('daybreakGateApprovalFailure')).not.toBeInTheDocument();
  });
});
