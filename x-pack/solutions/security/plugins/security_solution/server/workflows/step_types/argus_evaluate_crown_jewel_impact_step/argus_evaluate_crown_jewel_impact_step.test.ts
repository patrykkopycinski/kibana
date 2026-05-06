/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  argusEvaluateCrownJewelImpactInputSchema,
  argusEvaluateCrownJewelImpactStepDefinition,
} from './argus_evaluate_crown_jewel_impact_step';

interface MockEsClient {
  search: jest.Mock;
}

const buildEsClient = (jewelSources: Array<Record<string, unknown>>): MockEsClient => ({
  search: jest.fn().mockResolvedValue({
    hits: {
      hits: jewelSources.map((src, idx) => ({ _id: `cj-${idx}`, _source: src })),
    },
  }),
});

const buildContext = (esClient: MockEsClient, rawInput: Record<string, unknown>) => {
  const input = argusEvaluateCrownJewelImpactInputSchema.parse(rawInput);
  return {
    input,
    config: {},
    rawInput: { ...rawInput, ...input } as {
      rec_id: string;
      caller_id: string;
      targets: {
        host_names?: string | string[];
        host_ips?: string | string[];
        user_names?: string | string[];
        user_ids?: string | string[];
        service_names?: string | string[];
        index_patterns?: string | string[];
        tags?: string | string[];
      };
      jewels_size: number;
    },
    contextManager: {
      getContext: jest.fn().mockReturnValue({ workflow: { spaceId: 'default' } }),
      getScopedEsClient: jest.fn().mockReturnValue(esClient),
      renderInputTemplate: jest.fn(),
      getFakeRequest: jest.fn(),
    },
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    abortSignal: new AbortController().signal,
    stepId: 'argus-evaluate-crown-jewel-impact',
    stepType: 'security.argusEvaluateCrownJewelImpact',
  };
};

const goldFinanceJewel = {
  '@timestamp': '2026-04-01T00:00:00.000Z',
  asset_id: 'cj-prod-finance-payments',
  asset_type: 'service',
  name: 'Payments authorisation service',
  tier: 'gold',
  owner: 'finance-platform-team',
  match_patterns: [
    {
      kind: 'index_pattern',
      values: ['logs-finance-*'],
      match_mode: 'wildcard',
    },
  ],
  gate_active: true,
};

const silverGenericJewel = {
  '@timestamp': '2026-04-01T00:00:00.000Z',
  asset_id: 'cj-prod-app-cluster',
  asset_type: 'host',
  name: 'Generic prod app cluster',
  tier: 'silver',
  owner: 'platform-eng',
  match_patterns: [
    {
      kind: 'host_name',
      values: ['prod-app-01'],
    },
  ],
  gate_active: true,
};

const silverGateOffJewel = {
  '@timestamp': '2026-04-01T00:00:00.000Z',
  asset_id: 'cj-prod-staging',
  asset_type: 'host',
  name: 'Staging cluster (gate off)',
  tier: 'silver',
  owner: 'platform-eng',
  match_patterns: [
    {
      kind: 'host_name',
      values: ['stage-app-01'],
    },
  ],
  gate_active: false,
};

const crownJewel = {
  '@timestamp': '2026-04-01T00:00:00.000Z',
  asset_id: 'cj-prod-pki-root',
  asset_type: 'service',
  name: 'PKI root signing service',
  tier: 'crown',
  owner: 'security-eng',
  match_patterns: [
    {
      kind: 'service_name',
      values: ['pki-root'],
    },
  ],
  gate_active: true,
};

describe('argusEvaluateCrownJewelImpact step — input schema', () => {
  it('requires a non-empty rec_id', () => {
    expect(() =>
      argusEvaluateCrownJewelImpactInputSchema.parse({
        rec_id: '',
        targets: { index_patterns: ['logs-*'] },
      })
    ).toThrow();
  });

  it('defaults caller_id and jewels_size', () => {
    const parsed = argusEvaluateCrownJewelImpactInputSchema.parse({
      rec_id: 'rec-1',
      targets: {},
    });
    expect(parsed.caller_id).toBe('soc_argus_crown_jewel_gate');
    expect(parsed.jewels_size).toBe(1000);
  });
});

describe('argusEvaluateCrownJewelImpact step — handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns proceed when no jewels match', async () => {
    const esClient = buildEsClient([silverGenericJewel]);
    const context = buildContext(esClient, {
      rec_id: 'rec-1',
      targets: { index_patterns: ['logs-acme-*'], host_names: ['dev-laptop'] },
    });

    const result = await argusEvaluateCrownJewelImpactStepDefinition.handler(context);
    expect(result.error).toBeUndefined();
    expect(result.output?.recommended_action).toBe('proceed');
    expect(result.output?.max_tier).toBe('none');
    expect(result.output?.affected_count).toBe(0);
    expect(result.output?.jewels_loaded).toBe(1);
  });

  it('escalates to pending_review on a wildcard index_pattern match against a gold asset', async () => {
    const esClient = buildEsClient([goldFinanceJewel]);
    const context = buildContext(esClient, {
      rec_id: 'rec-2',
      targets: { index_patterns: ['logs-finance-payments-*'] },
    });

    const result = await argusEvaluateCrownJewelImpactStepDefinition.handler(context);
    expect(result.error).toBeUndefined();
    expect(result.output?.recommended_action).toBe('pending_review');
    expect(result.output?.max_tier).toBe('gold');
    expect(result.output?.affected_count).toBe(1);
    expect(result.output?.affected[0].asset_id).toBe('cj-prod-finance-payments');
    expect(result.output?.reason).toContain('caller=soc_argus_crown_jewel_gate');
    expect(result.output?.reason).toContain('rec_id=rec-2');
  });

  it('flags crown_match=true when any matched asset is tier=crown', async () => {
    const esClient = buildEsClient([silverGenericJewel, crownJewel]);
    const context = buildContext(esClient, {
      rec_id: 'rec-3',
      targets: { service_names: ['pki-root'] },
    });

    const result = await argusEvaluateCrownJewelImpactStepDefinition.handler(context);
    expect(result.error).toBeUndefined();
    expect(result.output?.recommended_action).toBe('pending_review');
    expect(result.output?.max_tier).toBe('crown');
    expect(result.output?.crown_match).toBe(true);
    expect(result.output?.reason).toContain('CROWN match');
  });

  it('keeps proceed for a silver match when gate_active=false on the only matched asset', async () => {
    const esClient = buildEsClient([silverGateOffJewel]);
    const context = buildContext(esClient, {
      rec_id: 'rec-4',
      targets: { host_names: ['stage-app-01'] },
    });

    const result = await argusEvaluateCrownJewelImpactStepDefinition.handler(context);
    expect(result.error).toBeUndefined();
    expect(result.output?.recommended_action).toBe('proceed');
    expect(result.output?.max_tier).toBe('silver');
    expect(result.output?.affected_count).toBe(1);
  });

  it('drops invalid crown-jewel docs without crashing the gate', async () => {
    const esClient = buildEsClient([
      goldFinanceJewel,
      // Invalid: missing match_patterns + tier.
      { '@timestamp': '2026-04-01T00:00:00.000Z', asset_id: 'cj-broken' },
    ]);
    const context = buildContext(esClient, {
      rec_id: 'rec-5',
      targets: { index_patterns: ['logs-finance-x'] },
    });

    const result = await argusEvaluateCrownJewelImpactStepDefinition.handler(context);
    expect(result.error).toBeUndefined();
    // Only the valid jewel was loaded.
    expect(result.output?.jewels_loaded).toBe(1);
    expect(result.output?.recommended_action).toBe('pending_review');
  });

  it('returns proceed with jewels_loaded=0 when the index is unavailable', async () => {
    const esClient: MockEsClient = {
      search: jest.fn().mockRejectedValue(new Error('index_not_found_exception')),
    };
    const context = buildContext(esClient, {
      rec_id: 'rec-6',
      targets: { index_patterns: ['logs-finance-*'] },
    });

    const result = await argusEvaluateCrownJewelImpactStepDefinition.handler(context);
    expect(result.error).toBeUndefined();
    expect(result.output?.recommended_action).toBe('proceed');
    expect(result.output?.jewels_loaded).toBe(0);
  });
});
