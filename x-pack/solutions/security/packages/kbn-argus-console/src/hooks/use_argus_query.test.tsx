/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';

import { useArgusQuery } from './use_argus_query';
import type { ArgusHttp } from './types';

interface DeferredFetch {
  readonly promise: Promise<unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (err: Error) => void;
}

const createDeferred = (): DeferredFetch => {
  let resolve!: (value: unknown) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

interface ProbeProps {
  readonly http: ArgusHttp;
  readonly pollIntervalMs?: number;
  readonly onState: (state: { readonly status: string; readonly data: unknown }) => void;
}

const Probe: React.FC<ProbeProps> = ({ http, pollIntervalMs, onState }) => {
  const result = useArgusQuery<{ readonly q?: string }, { readonly value: number }>({
    http,
    route: '/internal/test/probe',
    method: 'GET',
    pollIntervalMs,
    silentPolling: Boolean(pollIntervalMs && pollIntervalMs > 0),
  });
  React.useEffect(() => {
    onState({ status: result.status, data: result.data });
  }, [result.status, result.data, onState]);
  return null;
};

describe('useArgusQuery (overlap protection)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Regression: when the route's response time exceeds the poll interval,
   * the hook used to abort each in-flight request via AbortController on the
   * next poll tick, swallow the AbortError, and never reach `success`. This
   * test guarantees that polling no longer self-DoS-es slow routes.
   */
  it('skips overlapping poll cycles while a fetch is in flight', async () => {
    const deferreds: DeferredFetch[] = [];
    const fetchSpy = jest.fn(() => {
      const next = createDeferred();
      deferreds.push(next);
      return next.promise;
    });
    const http: ArgusHttp = {
      fetch: fetchSpy as unknown as ArgusHttp['fetch'],
    };
    const states: Array<{ status: string; data: unknown }> = [];
    const onState = jest.fn((next: { status: string; data: unknown }) => {
      states.push(next);
    });

    render(<Probe http={http} pollIntervalMs={50} onState={onState} />);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Five poll ticks fire before the in-flight request settles. None of
    // them should kick off a new fetch — the hook must reuse the in-flight
    // request and skip the poll.
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(50);
      }
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Resolve the in-flight fetch — status flips to success.
    await act(async () => {
      deferreds[0].resolve({ value: 1 });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(states.some((s) => s.status === 'success')).toBe(true);
    });

    // After the inflight request resolves, the next poll fires a fresh
    // fetch normally.
    await act(async () => {
      jest.advanceTimersByTime(50);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('reaches success on the first response', async () => {
    const fetchSpy = jest.fn(async () => ({ value: 7 }));
    const http: ArgusHttp = {
      fetch: fetchSpy as unknown as ArgusHttp['fetch'],
    };
    const states: Array<{ status: string; data: unknown }> = [];
    const onState = jest.fn((next: { status: string; data: unknown }) => {
      states.push(next);
    });

    render(<Probe http={http} onState={onState} />);

    await waitFor(() => {
      expect(
        states.some((s) => s.status === 'success' && (s.data as { value: number })?.value === 7)
      ).toBe(true);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * Regression: hook used to reset `silentHadSuccessRef` and abort the
   * in-flight request on every parent render because callers pass `transform`
   * as an inline arrow (`transform: (raw) => raw as Foo`). With the new
   * stabilisation via refs + dep-array fingerprints, repeated parent renders
   * should NOT trigger additional fetches.
   */
  it('survives parent re-renders without re-fetching', async () => {
    const fetchSpy = jest.fn(async () => ({ value: 99 }));
    const http: ArgusHttp = {
      fetch: fetchSpy as unknown as ArgusHttp['fetch'],
    };
    const onState = jest.fn();

    const Parent: React.FC<{ readonly tick: number }> = ({ tick }) => {
      // `tick` is a parent-only state — bumping it forces a parent re-render
      // without changing any of the hook's logical inputs. Each render still
      // hands the hook a freshly-allocated inline `transform` arrow.
      return (
        <div data-tick={tick}>
          <Probe http={http} onState={onState} />
        </div>
      );
    };

    const { rerender } = render(<Parent tick={1} />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    // Force five parent re-renders. Without the fix this used to produce
    // 6+ fetches (each render aborts and restarts); with the fix, the
    // count stays at 1 until a real poll/dependency change.
    for (let i = 2; i <= 6; i++) {
      rerender(<Parent tick={i} />);
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
