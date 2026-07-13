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
import { ApprovalGate } from './approval_gate';
import { useProposalTransition } from '../../hooks/use_proposal_transition';
import { useProposalActions } from '../../hooks/use_proposal_actions';
import type { DaybreakProposal } from '../../../services/proposals_service';
import { PROPOSAL_STATUS_VALUES, PROPOSAL_STATUS_META } from '../proposal/proposal_status';

jest.mock('../../hooks/use_proposal_transition');
jest.mock('../../hooks/use_proposal_actions');

const mockUseProposalTransition = useProposalTransition as jest.Mock;
const mockUseProposalActions = useProposalActions as jest.Mock;

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
      <ApprovalGate proposal={proposal} />
    </IntlProvider>
  );

describe('ApprovalGate (FR-016, FR-7, FR-018, FR-019)', () => {
  let transition: jest.Mock;

  beforeEach(() => {
    transition = jest.fn();
    mockUseProposalActions.mockReturnValue({
      actResponse: { mutate: jest.fn(), isLoading: false },
      runResponseActionWorker: { mutate: jest.fn(), isLoading: false },
    });
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

    expect(transition).toHaveBeenCalledWith({
      id: 'proposal-1',
      targetStatus: 'approved',
      decisionType: 'approve',
    });
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

  describe('7-value ProposalStatus rendering (FR-019)', () => {
    it('exposes exactly the 7 expected status values', () => {
      expect(PROPOSAL_STATUS_VALUES).toEqual([
        'new',
        'needs-evidence',
        'approved',
        'modified',
        'dismissed',
        'escalated',
        'deferred',
      ]);
    });

    it.each(PROPOSAL_STATUS_VALUES)(
      'renders a status badge with the status-scoped test subject and label for "%s"',
      (status) => {
        const { unmount } = renderGate({ ...baseProposal, status });

        const badge = screen.getByTestId(`daybreakGateApprovalStatus-${status}`);
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent(PROPOSAL_STATUS_META[status].label());

        unmount();
      }
    );
  });
});

describe('approved proposal response actions', () => {
  let actResponseMutate: jest.Mock;
  let runResponseActionWorkerMutate: jest.Mock;

  beforeEach(() => {
    actResponseMutate = jest.fn();
    runResponseActionWorkerMutate = jest.fn();
    mockUseProposalActions.mockReturnValue({
      actResponse: { mutate: actResponseMutate, isLoading: false },
      runResponseActionWorker: { mutate: runResponseActionWorkerMutate, isLoading: false },
    });
    mockUseProposalTransition.mockReturnValue({
      transition: jest.fn(),
      isLoading: false,
      missingRequirements: undefined,
    });
  });

  const approvedProposal: DaybreakProposal = {
    ...baseProposal,
    status: 'approved',
    evidenceRefs: ['evidence-1'],
    recommendation: 'Isolate FIN-WS-04 pending investigation.',
  };

  it('renders response action buttons when the proposal is approved', () => {
    renderGate(approvedProposal);

    expect(screen.getByTestId('daybreakGateGetProcessesButton')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakGateIsolateHostButton')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakGateRunResponseWorkerButton')).toBeInTheDocument();
  });

  it('does not render response action buttons for non-approved proposals', () => {
    renderGate({ ...approvedProposal, status: 'escalated' });

    expect(screen.queryByTestId('daybreakGateGetProcessesButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('daybreakGateIsolateHostButton')).not.toBeInTheDocument();
  });

  it('dispatches get_processes immediately when Get processes is clicked', () => {
    renderGate(approvedProposal);

    fireEvent.click(screen.getByTestId('daybreakGateGetProcessesButton'));

    expect(actResponseMutate).toHaveBeenCalledWith(
      { id: 'proposal-1', action: 'get_processes' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it('opens the isolate confirmation flyout before dispatching isolate', () => {
    renderGate(approvedProposal);

    fireEvent.click(screen.getByTestId('daybreakGateIsolateHostButton'));

    expect(screen.getByTestId('daybreakActionFlyout')).toBeInTheDocument();
    expect(actResponseMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('daybreakActionFlyoutConfirm'));

    expect(actResponseMutate).toHaveBeenCalledWith(
      { id: 'proposal-1', action: 'isolate' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it('calls runResponseActionWorker when Run worker is clicked', () => {
    renderGate(approvedProposal);

    fireEvent.click(screen.getByTestId('daybreakGateRunResponseWorkerButton'));

    expect(runResponseActionWorkerMutate).toHaveBeenCalledWith({ id: 'proposal-1' });
  });
});
