/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { createHttpFetchError } from '@kbn/core-http-browser-mocks';
import { useProposalTransition } from './use_proposal_transition';
import { useKibana } from './use_kibana';
import type { DaybreakProposal } from '../../services/proposals_service';

jest.mock('./use_kibana');

const mockUseKibana = useKibana as jest.Mock;

const createWrapper = () => {
  const client = new QueryClient();
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const approvedProposal: DaybreakProposal = {
  id: 'proposal-1',
  title: 'Test proposal',
  capability: 'alert-analysis',
  severity: 'high',
  confidence: 0.9,
  status: 'approved',
  evidenceRefs: ['evidence-1'],
  recommendation: 'Block the source IP.',
  createdAt: '2026-07-10T00:00:00.000Z',
};

describe('useProposalTransition (FR-018, FR-020)', () => {
  let transitionStatus: jest.Mock;

  beforeEach(() => {
    transitionStatus = jest.fn();
    mockUseKibana.mockReturnValue({
      services: {
        proposalsService: {
          transitionStatus,
        },
      },
    });
  });

  it('populates missingRequirements from a 422 gate-failure fixture', async () => {
    transitionStatus.mockImplementation(() => {
      throw createHttpFetchError(
        'Unprocessable Content',
        'Error',
        {} as Request,
        { status: 422 } as Response,
        {
          message:
            "Proposal 'proposal-1' failed the readiness gate for status 'approved': missing evidence, recommendation",
          attributes: {
            failure: {
              proposalId: 'proposal-1',
              targetStatus: 'approved',
              missingRequirements: ['evidence', 'recommendation'],
            },
          },
        }
      );
    });

    const { result } = renderHook(() => useProposalTransition(), { wrapper: createWrapper() });

    await expect(
      result.current.transition({ id: 'proposal-1', targetStatus: 'approved' })
    ).rejects.toThrow();

    await waitFor(() => {
      expect(result.current.missingRequirements).toEqual(['evidence', 'recommendation']);
    });
  });

  it('does not populate missingRequirements on success', async () => {
    transitionStatus.mockResolvedValue(approvedProposal);

    const { result } = renderHook(() => useProposalTransition(), { wrapper: createWrapper() });

    await result.current.transition({ id: 'proposal-1', targetStatus: 'approved' });

    await waitFor(() => {
      expect(result.current.missingRequirements).toBeUndefined();
    });
  });
});
