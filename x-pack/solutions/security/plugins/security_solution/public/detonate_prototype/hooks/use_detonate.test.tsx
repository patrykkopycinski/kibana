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
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@kbn/react-query';

import { detonateApi } from '../api/client';
import {
  DETONATE_QUERY_KEY,
  useDetonationRuns,
  useDetonationRunStats,
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

describe('useDetonationRuns retries', () => {
  // The shared `setup` turns retries off for every query, which would hide the hook's own rule.
  const mountWithRetries = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 3, retryDelay: 0 } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useDetonationRuns({ size: 50 }), { wrapper });
  };
  const httpError = (status: number) => Object.assign(new Error('boom'), { response: { status } });

  beforeEach(() => jest.clearAllMocks());

  it('does not retry a 4xx: the fetch is called once and the query errors', async () => {
    jest.mocked(detonateApi.searchRuns).mockRejectedValue(httpError(400));

    const { result } = mountWithRetries();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(detonateApi.searchRuns).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404])('does not retry a %i either', async (status) => {
    jest.mocked(detonateApi.searchRuns).mockRejectedValue(httpError(status));

    const { result } = mountWithRetries();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(detonateApi.searchRuns).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 up to three times: the server asked to be tried again', async () => {
    jest.mocked(detonateApi.searchRuns).mockRejectedValue(httpError(429));

    const { result } = mountWithRetries();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(detonateApi.searchRuns).toHaveBeenCalledTimes(4);
  });

  it('retries a server failure up to three times', async () => {
    jest.mocked(detonateApi.searchRuns).mockRejectedValue(httpError(503));

    const { result } = mountWithRetries();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(detonateApi.searchRuns).toHaveBeenCalledTimes(4);
  });
});

describe('dashboard queries share time + kql + search', () => {
  const emptyStats = {
    total: 0,
    verdicts: { malicious: 0, benign: 0, inconclusive: 0, unknown: 0 },
    meanDurationMs: null,
    alerts: { siem: 0, endpoint: 0 },
    trend: { intervalMs: 86_400_000, buckets: [] },
    topRules: [],
    topEventCodes: [],
  };
  const mount = (retry: number | false = false) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry, retryDelay: 0 } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { queryClient, wrapper };
  };
  const httpError = (status: number) => Object.assign(new Error('boom'), { response: { status } });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(detonateApi.getRunStats).mockResolvedValue(emptyStats);
    jest.mocked(detonateApi.searchRuns).mockResolvedValue({ hits: [], total: 0 });
  });

  it('keys the stats query on the time range, kql and search, and sends them', async () => {
    const { queryClient, wrapper } = mount();
    const query = { from: 'now-7d', to: 'now', kql: 'detonate.verdict:malicious', search: 'abc' };
    const { result, rerender } = renderHook((q) => useDetonationRunStats(q), {
      wrapper,
      initialProps: query,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(detonateApi.getRunStats).toHaveBeenLastCalledWith({}, query, expect.anything());

    rerender({ ...query, from: 'now-30d' });
    await waitFor(() => expect(detonateApi.getRunStats).toHaveBeenCalledTimes(2));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        [DETONATE_QUERY_KEY, 'tasks', 'stats', query],
        [DETONATE_QUERY_KEY, 'tasks', 'stats', { ...query, from: 'now-30d' }],
      ])
    );
  });

  it('keys the runs query on start/end and kql, and sends them', async () => {
    const { queryClient, wrapper } = mount();
    const query = { start: 'now-7d', end: 'now', kql: 'host.name:a', size: 50 };
    const { result } = renderHook(() => useDetonationRuns(query), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(detonateApi.searchRuns).toHaveBeenCalledWith(
      {},
      { ...query, from: 0 },
      expect.anything()
    );
    expect(queryClient.getQueryCache().getAll()[0].queryKey).toEqual([
      DETONATE_QUERY_KEY,
      'tasks',
      'runs',
      query,
    ]);
  });

  it('stats retries a 429', async () => {
    jest.mocked(detonateApi.getRunStats).mockRejectedValue(httpError(429));
    const { result } = renderHook(() => useDetonationRunStats({ from: 'now-7d', to: 'now' }), {
      wrapper: mount(3).wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(detonateApi.getRunStats).toHaveBeenCalledTimes(4);
  });

  it('stats does not retry a 4xx but retries a server failure', async () => {
    jest.mocked(detonateApi.getRunStats).mockRejectedValue(httpError(400));
    const first = renderHook(() => useDetonationRunStats({ from: 'now-7d', to: 'now' }), {
      wrapper: mount(3).wrapper,
    });
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    expect(detonateApi.getRunStats).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    jest.mocked(detonateApi.getRunStats).mockRejectedValue(httpError(503));
    const second = renderHook(() => useDetonationRunStats({ from: 'now-7d', to: 'now' }), {
      wrapper: mount(3).wrapper,
    });
    await waitFor(() => expect(second.result.current.isError).toBe(true));
    expect(detonateApi.getRunStats).toHaveBeenCalledTimes(4);
  });
});

describe('useDetonationRuns polling', () => {
  const POLL_MS = 5000;
  const row = (state: string, at = Date.now()) => ({
    'detonate.state': state,
    '@timestamp': new Date(at).toISOString(),
  });
  const respondWith = (hits: unknown[], total = hits.length) =>
    jest.mocked(detonateApi.searchRuns).mockResolvedValue({ hits, total } as never);

  const mount = async (size = 50) => {
    const { wrapper } = setup();
    const hook = renderHook(() => useDetonationRuns({ size }), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    return hook;
  };
  const tick = async () => {
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS + 100);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('polls while a loaded row is running', async () => {
    respondWith([row('complete'), row('running')]);
    await mount();
    expect(detonateApi.searchRuns).toHaveBeenCalledTimes(1);

    await tick();

    expect(detonateApi.searchRuns).toHaveBeenCalledTimes(2);
  });

  const mountWithStats = async () => {
    jest.mocked(detonateApi.getRunStats).mockResolvedValue({} as never);
    const { wrapper } = setup();
    const hook = renderHook(
      () => ({
        runs: useDetonationRuns({ size: 50 }),
        stats: useDetonationRunStats({ from: 'now-7d', to: 'now' }),
      }),
      { wrapper }
    );
    await waitFor(() => expect(hook.result.current.stats.isSuccess).toBe(true));
    await waitFor(() => expect(hook.result.current.runs.isSuccess).toBe(true));
    return hook;
  };
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  };

  it('refreshes the dashboard stats on each poll tick while a run is running', async () => {
    respondWith([row('running')]);
    await mountWithStats();
    expect(detonateApi.getRunStats).toHaveBeenCalledTimes(1);

    await tick();

    await waitFor(() => expect(detonateApi.getRunStats).toHaveBeenCalledTimes(2));
  });

  it('fetches the stats only after the runs response that finishes a row has resolved', async () => {
    const second = deferred<unknown>();
    jest
      .mocked(detonateApi.searchRuns)
      .mockResolvedValueOnce({ hits: [row('running')], total: 1 } as never)
      .mockReturnValueOnce(second.promise as never);
    await mountWithStats();
    expect(detonateApi.getRunStats).toHaveBeenCalledTimes(1);

    await tick();
    expect(detonateApi.searchRuns).toHaveBeenCalledTimes(2);
    // The runs request is still in flight, so the write it makes has not happened yet.
    expect(detonateApi.getRunStats).toHaveBeenCalledTimes(1);

    await act(async () => {
      second.resolve({ hits: [row('complete')], total: 1 });
    });

    await waitFor(() => expect(detonateApi.getRunStats).toHaveBeenCalledTimes(2));
    const [runsOrder] = jest.mocked(detonateApi.searchRuns).mock.invocationCallOrder.slice(-1);
    const [statsOrder] = jest.mocked(detonateApi.getRunStats).mock.invocationCallOrder.slice(-1);
    expect(statsOrder).toBeGreaterThan(runsOrder);
  });

  it('refreshes the stats once when the last running row finishes and polling stops', async () => {
    jest
      .mocked(detonateApi.searchRuns)
      .mockResolvedValueOnce({ hits: [row('running')], total: 1 } as never)
      .mockResolvedValue({ hits: [row('complete')], total: 1 } as never);
    const { result } = await mountWithStats();
    expect(detonateApi.getRunStats).toHaveBeenCalledTimes(1);

    // A load that is not a poll tick (a manual refetch) sees the row finish.
    await act(async () => {
      await result.current.runs.refetch();
    });

    await waitFor(() => expect(detonateApi.getRunStats).toHaveBeenCalledTimes(2));
    await tick();
    await act(async () => {});
    expect(detonateApi.getRunStats).toHaveBeenCalledTimes(2);
  });

  it('does not restart a stats search that is still running when the next tick fires', async () => {
    respondWith([row('running')]);
    await mountWithStats();
    jest.mocked(detonateApi.getRunStats).mockReturnValue(new Promise(() => {}) as never);

    await tick();
    await waitFor(() => expect(detonateApi.getRunStats).toHaveBeenCalledTimes(2));
    await tick();
    await act(async () => {});

    expect(detonateApi.searchRuns).toHaveBeenCalledTimes(3);
    expect(detonateApi.getRunStats).toHaveBeenCalledTimes(2);
  });

  it('does not refresh the dashboard stats when no run is running', async () => {
    respondWith([row('complete')]);
    await mountWithStats();

    await tick();
    await act(async () => {});

    expect(detonateApi.getRunStats).toHaveBeenCalledTimes(1);
  });

  it('does not poll once no loaded row is running', async () => {
    respondWith([row('complete'), row('failed')]);
    await mount();

    await tick();

    expect(detonateApi.searchRuns).toHaveBeenCalledTimes(1);
  });

  it('stops polling for a row that has said running for longer than any run can last', async () => {
    respondWith([row('running', Date.now() - 3 * 60 * 60 * 1000)]);
    await mount();

    await tick();

    expect(detonateApi.searchRuns).toHaveBeenCalledTimes(1);
  });

  it('refetches only the page that holds the running row on a poll', async () => {
    jest.mocked(detonateApi.searchRuns).mockImplementation(((
      _http: unknown,
      { from }: { from?: number }
    ) =>
      Promise.resolve({
        hits: [row(from === 1 ? 'running' : 'complete')],
        total: 100,
      })) as never);
    const { result } = await mount(1);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    // The running row is on page 2, so polling starts once that page is rendered.
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    await tick();

    const { calls } = jest.mocked(detonateApi.searchRuns).mock;
    expect(calls).toHaveLength(3);
    expect(calls[2][1]).toEqual(expect.objectContaining({ from: 1 }));
  });

  it('keeps every loaded page when a refetched page comes back with a smaller total', async () => {
    let page0Reads = 0;
    jest.mocked(detonateApi.searchRuns).mockImplementation(((
      _http: unknown,
      { from }: { from?: number }
    ) => {
      if (from === 0) page0Reads += 1;
      // Both pages hold a running row, so both are refetched and page 1's offset is rebuilt from
      // page 0's refetched response, whose total fell below the next offset (a run left the filter).
      const total = from === 0 && page0Reads > 1 ? 1 : 100;
      return Promise.resolve({ hits: [row('running')], total });
    }) as never);
    const { result } = await mount(1);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    await tick();
    await waitFor(() => expect(page0Reads).toBe(2));
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(result.current.data?.pages).toHaveLength(2);
  });

  it('fetches the rows after a short last page once a refetch raises the total', async () => {
    let page0Reads = 0;
    const hitsFor = (from?: number) =>
      Array.from({ length: from === 0 ? 50 : 30 }, () => row('running'));
    jest.mocked(detonateApi.searchRuns).mockImplementation(((
      _http: unknown,
      { from }: { from?: number }
    ) => {
      if (from === 0) page0Reads += 1;
      const total = from === 0 && page0Reads > 1 ? 110 : 80;
      return Promise.resolve({ hits: hitsFor(from), total });
    }) as never);
    const { result } = await mount(50);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    await tick();
    await waitFor(() => expect(result.current.data?.pages[0].total).toBe(110));
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    jest.mocked(detonateApi.searchRuns).mockClear();

    await act(async () => {
      await result.current.fetchNextPage({ pageParam: 80 });
    });

    const { calls } = jest.mocked(detonateApi.searchRuns).mock;
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(expect.objectContaining({ from: 80 }));
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(3));

    // The page at 80 holds running rows and follows a short page (30 of 50): the poll must
    // rebuild its offset instead of dropping it.
    jest.mocked(detonateApi.searchRuns).mockClear();
    await tick();
    await waitFor(() =>
      expect(jest.mocked(detonateApi.searchRuns).mock.calls.map(([, q]) => q.from)).toContain(80)
    );
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(result.current.data?.pages).toHaveLength(3);
  });

  it('lets a poll tick leave an in-flight Load more to finish', async () => {
    let resolveSecondPage: (value: unknown) => void = () => {};
    jest.mocked(detonateApi.searchRuns).mockImplementation(((
      _http: unknown,
      { from }: { from?: number }
    ) =>
      from === 1
        ? new Promise((resolve) => {
            resolveSecondPage = resolve;
          })
        : Promise.resolve({ hits: [row('running')], total: 100 })) as never);
    const { result } = await mount(1);

    let loadMore: Promise<unknown> = Promise.resolve();
    act(() => {
      loadMore = result.current.fetchNextPage({ pageParam: 1 });
    });
    await tick();
    await act(async () => {
      resolveSecondPage({ hits: [row('complete')], total: 100 });
      await loadMore;
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
  });

  describe('getNextPageParam', () => {
    const lastOptions = (size: number) => {
      const { wrapper } = setup();
      renderHook(() => useDetonationRuns({ size }), { wrapper });
      const { calls } = jest.mocked(useInfiniteQuery).mock;
      return calls[calls.length - 1][0] as unknown as {
        getNextPageParam: (
          lastPage: { hits: unknown[]; total: number },
          pages: Array<{ hits: unknown[]; total: number }>
        ) => number | undefined;
      };
    };
    const page = (count: number, total: number) => ({
      hits: Array.from({ length: count }, () => ({})),
      total,
    });

    it('asks for the next offset while rows remain', () => {
      const { getNextPageParam } = lastOptions(50);
      const first = page(50, 500);

      expect(getNextPageParam(first, [first])).toBe(50);
    });

    it('stops when the next page would pass the 10,000 result window', () => {
      const { getNextPageParam } = lastOptions(50);
      const pages = [page(9910, 20000), page(50, 20000)];

      expect(getNextPageParam(pages[1], pages)).toBeUndefined();
    });

    it('still asks for the last page that fits the window', () => {
      const { getNextPageParam } = lastOptions(50);
      const pages = [page(9900, 20000), page(50, 20000)];

      expect(getNextPageParam(pages[1], pages)).toBe(9950);
    });

    it('stops only on an empty page', () => {
      const { getNextPageParam } = lastOptions(50);
      const pages = [page(50, 80), page(0, 80)];

      expect(getNextPageParam(pages[1], pages)).toBeUndefined();
    });

    it('keeps asking after a short page so a refetch can rebuild later offsets', () => {
      const { getNextPageParam } = lastOptions(50);
      const pages = [page(50, 80), page(30, 80)];

      expect(getNextPageParam(pages[1], pages)).toBe(80);
    });

    it('ignores a shrunken total so a selective refetch cannot drop later pages', () => {
      const { getNextPageParam } = lastOptions(50);
      const pages = [page(50, 500), page(50, 40)];

      expect(getNextPageParam(pages[1], pages)).toBe(100);
    });
  });
});
