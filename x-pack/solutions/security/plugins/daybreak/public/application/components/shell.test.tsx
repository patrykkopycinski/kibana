/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { DaybreakApp } from './shell';
import { useProposals } from '../hooks/use_proposals';
import type { DaybreakProposal } from '../../services/proposals_service';

jest.mock('../hooks/use_proposals');

const mockUseProposals = useProposals as jest.Mock;

/**
 * Hook fixture standing in for real Proposal HTTP API output (FR-020) — the
 * shape mirrors `DaybreakProposal`, not any prototype demo-seed shape, so the
 * test proves the shell renders `useProposals()` data rather than any
 * hardcoded/seeded state.
 */
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
  });

  it('renders the rail (nav), stage, and composer once the hook fixture resolves data-populated (FR-010, FR-011, FR-020)', () => {
    mockUseProposals.mockReturnValue({
      proposals: proposalsFixture,
      isLoading: false,
      refresh: jest.fn(),
    });

    renderShell();

    // Application shell top-level regions (FR-010).
    expect(screen.getByTestId('daybreakAppShell')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakRail')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakStage')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakComposer')).toBeInTheDocument();

    // The rail's proposal list is the shell's thread/nav surface (FR-010) —
    // it must render an item per fixture proposal once data-populated
    // (FR-011), not the loading placeholder.
    expect(screen.getByTestId('daybreakRailList')).toBeInTheDocument();
    const railItem = screen.getByTestId('daybreakRailItem-proposal-1');
    expect(railItem).toBeInTheDocument();
    expect(within(railItem).getByText('Suspicious login from new device')).toBeInTheDocument();
    expect(screen.queryByTestId('daybreakRailLoading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('daybreakRailEmpty')).not.toBeInTheDocument();
  });

  it('renders an explicit, assertable loading state before the fixture resolves (FR-011)', () => {
    mockUseProposals.mockReturnValue({
      proposals: [],
      isLoading: true,
      refresh: jest.fn(),
    });

    renderShell();

    expect(screen.getByTestId('daybreakRailLoading')).toBeInTheDocument();
    expect(screen.queryByTestId('daybreakRailList')).not.toBeInTheDocument();
  });
});
