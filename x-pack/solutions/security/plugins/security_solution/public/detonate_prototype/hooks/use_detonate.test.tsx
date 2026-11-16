/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * A successful submit must refresh both the run list and the allowance line;
 * a failed one must refresh neither.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@kbn/react-query';

import { detonateApi } from '../api/client';
import {
  DETONATE_QUERY_KEY,
  useDetonationRuns,
  useSubmitFile,
  useSubmitHash,
} from './use_detonate';

jest.mock('../../common/lib/kibana', () => ({
  useKibana: () => ({ services: { http: {} } }),
}));
jest.mock('@kbn/react-query', () => {
  const actual = jest.requireActual('@kbn/react-query');
  return { ...actual, useInfiniteQuery: jest.fn(actual.useInfiniteQuery) };
});
jest.mock('../api/client');
jest.mock('../components/detonation_notifier', () => ({ useTrackDetonation: () => jest.fn() }));

const task = { id: 'task-1' };

const setup = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
};

const invalidatedKeys = (invalidate: jest.SpyInstance) =>
  invalidate.mock.calls.map(([filters]) => filters?.queryKey);

describe('submit mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(detonateApi.submitHash).mockResolvedValue(task as never);
    jest.mocked(detonateApi.submitFile).mockResolvedValue(task as never);
  });

  it('useSubmitHash invalidates the task list and the usage allowance on success', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSubmitHash(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sample_hash: 'a'.repeat(64) });
    });

    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining([
        [DETONATE_QUERY_KEY, 'tasks'],
        [DETONATE_QUERY_KEY, 'usage'],
      ])
    );
  });

  it('useSubmitFile invalidates the task list and the usage allowance on success', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSubmitFile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ file: new File(['MZ'], 'sample.exe') });
    });

    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining([
        [DETONATE_QUERY_KEY, 'tasks'],
        [DETONATE_QUERY_KEY, 'usage'],
      ])
    );
  });

  it('invalidates nothing when the submit fails', async () => {
    jest.mocked(detonateApi.submitHash).mockRejectedValue(new Error('nope'));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSubmitHash(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sample_hash: 'a'.repeat(64) }).catch(() => undefined);
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('useDetonationRuns polling', () => {
  const pagesOf = (...states: string[]) => ({
    pages: [{ hits: states.map((state) => ({ 'detonate.state': state })), total: states.length }],
  });

  const refetchIntervalOption = () => {
    const { wrapper } = setup();
    renderHook(() => useDetonationRuns({ size: 50 }), { wrapper });
    const { calls } = jest.mocked(useInfiniteQuery).mock;
    return (
      calls[calls.length - 1][0] as unknown as { refetchInterval: (data: unknown) => unknown }
    ).refetchInterval;
  };

  it('polls while a loaded row is running', () => {
    expect(refetchIntervalOption()(pagesOf('complete', 'running'))).toEqual(expect.any(Number));
  });

  it('stops polling once no loaded row is running, or nothing has loaded', () => {
    const refetchInterval = refetchIntervalOption();
    expect(refetchInterval(pagesOf('complete', 'failed'))).toBe(false);
    expect(refetchInterval(undefined)).toBe(false);
  });
});
