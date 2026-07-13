/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useProposalActions } from './use_proposal_actions';
import { useKibana } from './use_kibana';

jest.mock('./use_kibana');

const mockUseKibana = useKibana as jest.Mock;

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { Wrapper, client };
};

describe('useProposalActions', () => {
  let actResponse: jest.Mock;
  let runResponseActionWorker: jest.Mock;
  let invalidateQueries: jest.SpyInstance;

  beforeEach(() => {
    actResponse = jest.fn();
    runResponseActionWorker = jest.fn();
    mockUseKibana.mockReturnValue({
      services: {
        proposalsService: {
          actResponse,
          runResponseActionWorker,
        },
      },
    });
  });

  it('calls actResponse with proposal id and action', async () => {
    actResponse.mockResolvedValue({
      proposalId: 'proposal-1',
      action: 'get_processes',
      hostName: 'FIN-WS-04',
      toolId: 'endpoint-response-actions.running_processes',
      toolResult: {},
      timelineEntry: {
        timestamp: '2026-07-13T00:00:00.000Z',
        description: 'Response action completed.',
      },
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useProposalActions(), { wrapper: Wrapper });

    await result.current.actResponse.mutateAsync({
      id: 'proposal-1',
      action: 'get_processes',
      hostName: 'FIN-WS-04',
    });

    expect(actResponse).toHaveBeenCalledWith('proposal-1', {
      action: 'get_processes',
      hostName: 'FIN-WS-04',
    });
  });

  it('invalidates investigations after a successful actResponse', async () => {
    actResponse.mockResolvedValue({
      proposalId: 'proposal-1',
      action: 'isolate',
      hostName: 'FIN-WS-04',
      toolId: 'endpoint-response-actions.isolate_host',
      toolResult: {},
      timelineEntry: {
        timestamp: '2026-07-13T00:00:00.000Z',
        description: 'Host isolated.',
      },
    });

    const { Wrapper, client } = createWrapper();
    invalidateQueries = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useProposalActions(), { wrapper: Wrapper });

    await result.current.actResponse.mutateAsync({ id: 'proposal-1', action: 'isolate' });

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['daybreak', 'investigations'] });
    });
  });

  it('calls runResponseActionWorker with proposal id', async () => {
    runResponseActionWorker.mockResolvedValue({ workflowExecutionId: 'wf-123' });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useProposalActions(), { wrapper: Wrapper });

    await result.current.runResponseActionWorker.mutateAsync({ id: 'proposal-1' });

    expect(runResponseActionWorker).toHaveBeenCalledWith('proposal-1', {});
  });
});
