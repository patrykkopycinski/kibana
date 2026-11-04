/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  ATTACK_DISCOVERY_GENERATE,
  ELASTIC_AI_ASSISTANT_ANONYMIZATION_FIELDS_URL_FIND,
} from '@kbn/elastic-assistant-common';
import { AttackDiscoveryGenerateApiClient } from './attack_discovery_generate_api_client';

const log = { warning: jest.fn() } as unknown as ToolingLog;

const httpError = (message: string, status?: number): Error =>
  Object.assign(new Error(message), status === undefined ? {} : { status });

interface FetchScript {
  readonly generate?: () => Promise<unknown>;
  readonly poll?: () => Promise<unknown>;
}

const createClient = ({ generate, poll }: FetchScript) => {
  const pollMock = jest.fn(poll ?? (async () => ({})));
  const fetchMock = jest.fn(async (path: string) => {
    if (path === ELASTIC_AI_ASSISTANT_ANONYMIZATION_FIELDS_URL_FIND) return { data: [] };
    if (path === ATTACK_DISCOVERY_GENERATE) {
      return generate ? generate() : { execution_uuid: 'exec-1' };
    }
    return pollMock();
  });
  const client = new AttackDiscoveryGenerateApiClient(fetchMock as unknown as HttpHandler, log);
  return { client, pollMock };
};

const runToCompletion = async (client: AttackDiscoveryGenerateApiClient) => {
  const pending = client.generate({ connectorId: 'c' });
  await jest.advanceTimersByTimeAsync(1_600_000);
  return pending;
};

describe('AttackDiscoveryGenerateApiClient error classification', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each([401, 403, 429, 502, 503])(
    'marks a _generate request rejected with HTTP %i as infrastructure',
    async (code) => {
      const { client } = createClient({
        generate: async () => {
          throw httpError('upstream', code);
        },
      });

      const result = await runToCompletion(client);

      expect(result.errorKind).toBe('infrastructure');
      expect(result.error).toContain(`generate HTTP ${code}`);
    }
  );

  it('marks a _generate transport failure (no HTTP status) as infrastructure', async () => {
    const { client } = createClient({
      generate: async () => {
        throw new TypeError('fetch failed');
      },
    });

    const result = await runToCompletion(client);

    expect(result.errorKind).toBe('infrastructure');
    expect(result.error).toContain('generate HTTP n/a');
  });

  it.each([400, 418])(
    'leaves a _generate request rejected with HTTP %i unmarked (a model failure)',
    async (code) => {
      const { client } = createClient({
        generate: async () => {
          throw httpError('invalid alertsIndexPattern', code);
        },
      });

      const result = await runToCompletion(client);

      expect(result.status).toBe('failed');
      expect(result.errorKind).toBeUndefined();
      expect(result.error).toContain(`generate HTTP ${code}`);
    }
  );

  it('leaves a status-less non-transport _generate error unmarked (a harness bug)', async () => {
    const { client } = createClient({
      generate: async () => {
        throw new TypeError('x is not a function');
      },
    });

    const result = await runToCompletion(client);

    expect(result.errorKind).toBeUndefined();
  });

  it('marks a _generate response without execution_uuid as infrastructure', async () => {
    const { client } = createClient({ generate: async () => ({}) });

    const result = await runToCompletion(client);

    expect(result.errorKind).toBe('infrastructure');
    expect(result.error).toContain('missing execution_uuid');
  });

  it('marks a generation that never materialized (poll 404 past the grace window) as infrastructure', async () => {
    const { client, pollMock } = createClient({
      poll: async () => {
        throw httpError('not found', 404);
      },
    });

    const result = await runToCompletion(client);

    expect(pollMock.mock.calls.length).toBeGreaterThan(1);
    expect(result.errorKind).toBe('infrastructure');
    expect(result.error).toContain('poll HTTP 404 (generation never materialized)');
  });

  it('marks a poll transport error (no HTTP status) as infrastructure', async () => {
    const { client } = createClient({
      poll: async () => {
        throw new TypeError('fetch failed');
      },
    });

    const result = await runToCompletion(client);

    expect(result.errorKind).toBe('infrastructure');
    expect(result.error).toContain('poll HTTP n/a');
  });

  it.each([401, 403])('marks a non-retryable poll HTTP %i as infrastructure', async (code) => {
    const { client } = createClient({
      poll: async () => {
        throw httpError('denied', code);
      },
    });

    const result = await runToCompletion(client);

    expect(result.errorKind).toBe('infrastructure');
    expect(result.error).toContain(`poll HTTP ${code}`);
  });

  it('leaves a poll rejected with HTTP 400 unmarked (a model failure)', async () => {
    const { client, pollMock } = createClient({
      poll: async () => {
        throw httpError('bad request', 400);
      },
    });

    const result = await runToCompletion(client);

    expect(pollMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('failed');
    expect(result.errorKind).toBeUndefined();
    expect(result.error).toContain('poll HTTP 400');
  });

  it('marks a poll that keeps failing with 503 until the deadline as infrastructure', async () => {
    const { client, pollMock } = createClient({
      poll: async () => {
        throw httpError('service unavailable', 503);
      },
    });

    const result = await runToCompletion(client);

    expect(pollMock.mock.calls.length).toBeGreaterThan(10);
    expect(result.status).toBe('timed_out');
    expect(result.errorKind).toBe('infrastructure');
    expect(result.error).toContain('poll HTTP 503 until deadline');
  });

  describe('deadline failure streak', () => {
    // Polls run every 5s for 1,500s, so a full run makes 300 polls; the streak bound is 24.
    const TOTAL_POLLS = 300;
    const MIN_STREAK = 24;

    const runWithTrailingFailures = async (failures: number) => {
      let calls = 0;
      const { client } = createClient({
        poll: async () => {
          calls += 1;
          if (calls > TOTAL_POLLS - failures) throw httpError('service unavailable', 503);
          return { generation: { status: 'running' } };
        },
      });
      const result = await runToCompletion(client);
      expect(calls).toBe(TOTAL_POLLS);
      return result;
    };

    it('leaves a deadline unmarked when a running generation gets one 503 on the final poll', async () => {
      const result = await runWithTrailingFailures(1);

      expect(result.status).toBe('timed_out');
      expect(result.error).toContain('poll timed out');
      expect(result.errorKind).toBeUndefined();
    });

    it('leaves a deadline unmarked when the trailing failure streak is just under the bound', async () => {
      const result = await runWithTrailingFailures(MIN_STREAK - 1);

      expect(result.errorKind).toBeUndefined();
    });

    it('marks a deadline as infrastructure when the trailing failure streak reaches the bound', async () => {
      const result = await runWithTrailingFailures(MIN_STREAK);

      expect(result.errorKind).toBe('infrastructure');
      expect(result.error).toContain('poll HTTP 503 until deadline');
    });
  });

  it('leaves a deadline unmarked when polls failed earlier but the last one succeeded', async () => {
    let calls = 0;
    const { client } = createClient({
      poll: async () => {
        calls += 1;
        if (calls <= 3) throw httpError('service unavailable', 503);
        return { generation: { status: 'running' } };
      },
    });

    const result = await runToCompletion(client);

    expect(calls).toBeGreaterThan(4);
    expect(result.status).toBe('timed_out');
    expect(result.error).toContain('poll timed out');
    expect(result.errorKind).toBeUndefined();
  });

  it.each(['canceled', 'dismissed'])(
    'marks a generation that ended %s as infrastructure',
    async (terminal) => {
      const { client } = createClient({
        poll: async () => ({ generation: { status: terminal, reason: 'stopped' } }),
      });

      const result = await runToCompletion(client);

      expect(result.status).toBe(terminal);
      expect(result.error).toContain(`generation ${terminal}`);
      expect(result.errorKind).toBe('infrastructure');
    }
  );

  it('leaves a generation that reported failed unmarked (a model failure)', async () => {
    const { client } = createClient({
      poll: async () => ({
        generation: { status: 'failed', reason: 'Maximum generation attempts (10) reached' },
      }),
    });

    const result = await runToCompletion(client);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('generation failed: Maximum generation attempts');
    expect(result.errorKind).toBeUndefined();
  });

  it('leaves a poll timeout unmarked (a model failure)', async () => {
    const { client } = createClient({
      poll: async () => ({ generation: { status: 'running' } }),
    });

    const result = await runToCompletion(client);

    expect(result.status).toBe('timed_out');
    expect(result.errorKind).toBeUndefined();
  });

  it('returns discoveries without an error for a succeeded generation', async () => {
    const { client } = createClient({
      poll: async () => ({
        generation: { status: 'succeeded', alerts_context_count: 3 },
        data: [{ title: 't' }],
      }),
    });

    const result = await runToCompletion(client);

    expect(result.error).toBeUndefined();
    expect(result.errorKind).toBeUndefined();
    expect(result.alertsContextCount).toBe(3);
    expect(result.discoveries).toHaveLength(1);
  });
});
