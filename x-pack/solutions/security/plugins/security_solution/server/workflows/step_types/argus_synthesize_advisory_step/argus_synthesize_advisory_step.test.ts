/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ARGUS_DEMO_ADVISORIES } from '@kbn/argus-exploit-to-detection';

import {
  argusSynthesizeAdvisoryInputSchema,
  argusSynthesizeAdvisoryStepDefinition,
} from './argus_synthesize_advisory_step';

const advisory = ARGUS_DEMO_ADVISORIES[0];

interface MockEsClient {
  search: jest.Mock;
  index: jest.Mock;
  bulk: jest.Mock;
}

const buildEsClient = (): MockEsClient => ({
  search: jest.fn().mockResolvedValue({
    hits: { hits: [{ _source: advisory }] },
  }),
  index: jest.fn().mockResolvedValue({ result: 'created' }),
  bulk: jest.fn().mockResolvedValue({ items: [] }),
});

const buildContext = (esClient: MockEsClient, rawInput: Record<string, unknown>) => {
  const input = argusSynthesizeAdvisoryInputSchema.parse(rawInput);
  return {
    input,
    config: {},
    // Step contract expects rawInput to match the input shape pre-validation.
    // Tests build it from a partial record, so reuse the parsed result whose
    // shape is a strict superset of what the step contract requires.
    rawInput: { ...rawInput, ...input } as {
      advisory_id: string;
      caller_id: string;
      dry_run: string | boolean;
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
    stepId: 'argus-synthesize-advisory',
    stepType: 'security.argusSynthesizeAdvisory',
  };
};

describe('argusSynthesizeAdvisory step — input schema', () => {
  it('requires a non-empty advisory_id', () => {
    expect(() => argusSynthesizeAdvisoryInputSchema.parse({ advisory_id: '' })).toThrow();
    expect(() => argusSynthesizeAdvisoryInputSchema.parse({})).toThrow();
  });

  it('defaults caller_id to "workflow" and dry_run to false', () => {
    const parsed = argusSynthesizeAdvisoryInputSchema.parse({ advisory_id: 'CVE-1' });
    expect(parsed.caller_id).toBe('workflow');
    expect(parsed.dry_run).toBe(false);
  });

  it('honours an explicit caller_id', () => {
    const parsed = argusSynthesizeAdvisoryInputSchema.parse({
      advisory_id: 'CVE-1',
      caller_id: 'soc_argus_synthesis_driver',
    });
    expect(parsed.caller_id).toBe('soc_argus_synthesis_driver');
  });
});

describe('argusSynthesizeAdvisory step — handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns advisory_not_found when the advisory is missing', async () => {
    const esClient: MockEsClient = {
      search: jest.fn().mockResolvedValue({ hits: { hits: [] } }),
      index: jest.fn().mockResolvedValue({ result: 'created' }),
      bulk: jest.fn().mockResolvedValue({ items: [] }),
    };
    const context = buildContext(esClient, { advisory_id: 'CVE-MISSING' });

    const result = await argusSynthesizeAdvisoryStepDefinition.handler(context);
    expect(result.error).toBeUndefined();
    expect(result.output?.outcome_kind).toBe('advisory_not_found');
    expect(result.output?.advisory_id).toBe('CVE-MISSING');
    // Logs the audit row when not in dry-run.
    expect(esClient.index).toHaveBeenCalledTimes(1);
    expect((esClient.index.mock.calls[0][0] as { index: string }).index).toBe('.soc-evolution-log');
  });

  it('happy path: writes a mutation_intent + traces + audit row', async () => {
    const esClient = buildEsClient();
    const context = buildContext(esClient, {
      advisory_id: advisory.advisory_id,
      caller_id: 'soc_argus_synthesis_driver',
    });

    const result = await argusSynthesizeAdvisoryStepDefinition.handler(context);

    expect(result.error).toBeUndefined();
    expect(result.output?.outcome_kind).toBe('synthesized');
    expect(result.output?.rec_id).toBeDefined();
    expect(result.output?.variant_count).toBeGreaterThan(0);
    expect(result.output?.trace_count).toBeGreaterThan(0);
    expect(result.output?.dry_run).toBe(false);

    // 1 advisory lookup
    expect(esClient.search).toHaveBeenCalledTimes(1);

    // index() is called twice: once for .soc-mutation-intents, once for the audit row
    const indexedIndices = esClient.index.mock.calls.map((c) => (c[0] as { index: string }).index);
    expect(indexedIndices).toContain('.soc-mutation-intents');
    expect(indexedIndices).toContain('.soc-evolution-log');

    // Reasoning traces go via bulk.
    expect(esClient.bulk).toHaveBeenCalledTimes(1);
  });

  it('dry-run mode: produces a synthesized outcome without writing anything', async () => {
    const esClient = buildEsClient();
    const context = buildContext(esClient, {
      advisory_id: advisory.advisory_id,
      dry_run: true,
    });

    const result = await argusSynthesizeAdvisoryStepDefinition.handler(context);

    expect(result.error).toBeUndefined();
    expect(result.output?.outcome_kind).toBe('synthesized');
    expect(result.output?.rec_id).toBeDefined();
    expect(result.output?.dry_run).toBe(true);

    expect(esClient.search).toHaveBeenCalledTimes(1);
    expect(esClient.index).not.toHaveBeenCalled();
    expect(esClient.bulk).not.toHaveBeenCalled();
  });

  it('returns an error when ES indexing fails after a successful synthesis', async () => {
    const esClient = buildEsClient();
    esClient.index.mockRejectedValueOnce(new Error('cluster_unavailable'));

    const context = buildContext(esClient, { advisory_id: advisory.advisory_id });

    const result = await argusSynthesizeAdvisoryStepDefinition.handler(context);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toContain('cluster_unavailable');
  });
});
