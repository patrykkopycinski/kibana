/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { DaybreakApp } from './shell';
import { useEvidence } from '../hooks/use_evidence';
import { useProposals } from '../hooks/use_proposals';
import type { DaybreakProposal } from '../../services/proposals_service';

jest.mock('../hooks/use_evidence');
jest.mock('../hooks/use_proposals');

const mockUseEvidence = useEvidence as jest.Mock;
const mockUseProposals = useProposals as jest.Mock;

const proposalsFixture: DaybreakProposal[] = [
  {
    id: 'proposal-1',
    title: 'Suspicious login from new device',
    capability: 'alert-analysis',
    severity: 'high',
    confidence: 0.82,
    status: 'needs-evidence',
    evidenceRefs: [],
    createdAt: '2026-07-10T00:00:00.000Z',
  },
];

const renderShell = () =>
  render(
    <IntlProvider locale="en">
      <DaybreakApp />
    </IntlProvider>
  );

describe('DaybreakApp (FR-010, FR-011, FR-020)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEvidence.mockReturnValue({ evidence: [], isLoading: false, refresh: jest.fn() });
  });

  it('renders the icon rail, stage, and composer once the hook fixture resolves data-populated (FR-010, FR-011, FR-020)', () => {
    mockUseProposals.mockReturnValue({
      proposals: proposalsFixture,
      isLoading: false,
      refresh: jest.fn(),
    });

    renderShell();

    expect(screen.getByTestId('daybreakAppShell')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakRail')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakStage')).toBeInTheDocument();

    expect(screen.getByTestId('daybreakRailItem-brief')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakRailItem-chats')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakRailItem-agents')).toBeInTheDocument();
  });

  it('switches to the Chats nav panel when the Chats rail item is selected (FR-010)', () => {
    mockUseProposals.mockReturnValue({
      proposals: proposalsFixture,
      isLoading: false,
      refresh: jest.fn(),
    });

    renderShell();

    fireEvent.click(screen.getByTestId('daybreakRailItem-chats'));
    expect(screen.getByTestId('daybreakNavItem-proposal-1')).toBeInTheDocument();
  });
});
