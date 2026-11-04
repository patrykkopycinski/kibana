/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout';
import type { ToolingLog } from '@kbn/tooling-log';
import { esConnectivityErrors, responseError } from '../task/es_error_fixtures.mock';
import { AttackDiscoveryClient } from './attack_discovery_client';

const log = { warning: jest.fn(), error: jest.fn() } as unknown as ToolingLog;

const createClient = (search: jest.Mock) =>
  new AttackDiscoveryClient({ search } as unknown as EsClient, log);

// Attempts wait 2s then 4s between retries.
const settle = async <T>(promise: Promise<T>) => {
  const outcome = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error })
  );
  await jest.advanceTimersByTimeAsync(10_000);
  return outcome;
};

describe('AttackDiscoveryClient.searchAlertsAsContext', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('formats the hits as page content', async () => {
    const search = jest.fn(async () => ({
      hits: { hits: [{ _id: 'a-1', _source: { host: { name: 'h1' } } }] },
    }));

    const result = await settle(createClient(search).searchAlertsAsContext());

    expect(result).toEqual({ value: [{ metadata: {}, pageContent: '_id,a-1\nhost.name,h1' }] });
  });

  it('retries a 503 and then rejects with the original ResponseError', async () => {
    const error = responseError(503);
    const search = jest.fn().mockRejectedValue(error);

    const result = await settle(createClient(search).searchAlertsAsContext());

    expect(search).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ error });
    expect((result as { error: unknown }).error).toBe(error);
  });

  it('recovers when a retry succeeds', async () => {
    const search = jest
      .fn()
      .mockRejectedValueOnce(responseError(503))
      .mockResolvedValueOnce({ hits: { hits: [] } });

    const result = await settle(createClient(search).searchAlertsAsContext());

    expect(search).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ value: [] });
  });

  it('rejects a 400 after one attempt with the original ResponseError', async () => {
    const error = responseError(400);
    const search = jest.fn().mockRejectedValue(error);

    const result = await settle(createClient(search).searchAlertsAsContext());

    expect(search).toHaveBeenCalledTimes(1);
    expect((result as { error: unknown }).error).toBe(error);
  });

  it('rejects with the last error, not the most frequent message, after mixed failures', async () => {
    const last = responseError(503);
    const search = jest
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(last);

    const result = await settle(createClient(search).searchAlertsAsContext());

    expect(search).toHaveBeenCalledTimes(3);
    expect((result as { error: unknown }).error).toBe(last);
  });

  it('retries a connection failure and then rejects', async () => {
    const error = esConnectivityErrors.ConnectionError();
    const search = jest.fn().mockRejectedValue(error);

    const result = await settle(createClient(search).searchAlertsAsContext());

    expect(search).toHaveBeenCalledTimes(3);
    expect((result as { error: unknown }).error).toBe(error);
  });
});
