/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Principal } from '@kbn/argus-tool-manifest';

import { RestGovernanceClient } from './rest_governance_client';

interface FakeFetchCall {
  url: string;
  body: unknown;
}

const makeFakeFetch = (
  responses: Array<{ status: number; body: unknown }>
): { fetchImpl: typeof fetch; calls: FakeFetchCall[] } => {
  const calls: FakeFetchCall[] = [];
  let i = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    const rawBody = init?.body;
    const body =
      typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody === undefined ? null : rawBody;
    calls.push({ url: String(url), body });
    const resp = responses[i++] ?? { status: 500, body: 'no more responses' };
    return new Response(JSON.stringify(resp.body), { status: resp.status });
  };
  return { fetchImpl, calls };
};

const CLAUDE: Principal = {
  protocol: 'mcp',
  client_id: 'claude-desktop',
  profile: 'operator',
};

describe('RestGovernanceClient', () => {
  it('fetches adversarial, reasoning, and trust-tier rows in parallel and composes the snapshot', async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      {
        status: 200,
        body: {
          hits: {
            hits: [
              {
                _source: {
                  gate_decision: 'marginal',
                  aggregate: { min: { no_secret_leakage: 1.0 } },
                },
              },
            ],
          },
        },
      },
      {
        status: 200,
        body: {
          hits: {
            hits: [{ _source: { gate_decision: 'pass' } }],
          },
        },
      },
      {
        status: 200,
        body: {
          hits: {
            hits: [{ _source: { watchdog_frozen: false, tier: 'trusted' } }],
          },
        },
      },
    ]);
    const client = new RestGovernanceClient({
      es_url: 'http://es:9200',
      es_auth_header: 'Basic xxx',
      fetchImpl,
    });
    const snap = await client.snapshot(CLAUDE);
    expect(snap).toEqual({
      adversarial_gate: 'marginal',
      adversarial_min_no_secret_leakage: 1.0,
      reasoning_gate: 'pass',
      watchdog_frozen: false,
    });
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toContain('.soc-reasoning-eval-runs');
    expect(calls[2].url).toContain('.soc-actor-trust-tiers');
  });

  it('returns unknown gates and 0 leakage when ES returns empty hits', async () => {
    const { fetchImpl } = makeFakeFetch([
      { status: 200, body: { hits: { hits: [] } } },
      { status: 200, body: { hits: { hits: [] } } },
      { status: 200, body: { hits: { hits: [] } } },
    ]);
    const client = new RestGovernanceClient({
      es_url: 'http://es:9200',
      es_auth_header: 'Basic xxx',
      fetchImpl,
    });
    const snap = await client.snapshot(CLAUDE);
    expect(snap.adversarial_gate).toBe('unknown');
    expect(snap.adversarial_min_no_secret_leakage).toBe(0);
    expect(snap.reasoning_gate).toBe('unknown');
    expect(snap.watchdog_frozen).toBe(false);
  });

  it('propagates non-2xx HTTP errors to the caller', async () => {
    const { fetchImpl } = makeFakeFetch([{ status: 500, body: { error: 'boom' } }]);
    const client = new RestGovernanceClient({
      es_url: 'http://es:9200',
      es_auth_header: 'Basic xxx',
      fetchImpl,
    });
    await expect(client.snapshot(CLAUDE)).rejects.toThrow(/governance fetch/);
  });

  it('identifies the principal with the protocol-qualified actor_id when querying trust tiers', async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      { status: 200, body: { hits: { hits: [] } } },
      { status: 200, body: { hits: { hits: [] } } },
      { status: 200, body: { hits: { hits: [] } } },
    ]);
    const client = new RestGovernanceClient({
      es_url: 'http://es:9200',
      es_auth_header: 'Basic xxx',
      fetchImpl,
    });
    await client.snapshot(CLAUDE);
    const trustTierCall = calls.find((c) => c.url.includes('.soc-actor-trust-tiers'));
    expect(trustTierCall).toBeDefined();
    const body = trustTierCall!.body as { query?: { term?: { actor_id?: string } } };
    expect(body.query?.term?.actor_id).toBe('mcp:claude-desktop');
  });
});
