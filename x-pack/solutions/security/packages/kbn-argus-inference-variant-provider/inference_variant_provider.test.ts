/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { InferenceChatModel } from '@kbn/inference-langchain';
import {
  ARGUS_DEMO_ADVISORIES,
  DEFAULT_SCRIPTED_LLM_PROVIDER,
  type VariantCandidate,
  type VariantProvider,
  type VariantProviderInput,
} from '@kbn/argus-exploit-to-detection';

let mockChainInvokeResult: unknown;
let mockChainInvokeError: unknown;
let mockChainInvokeCalls = 0;

jest.mock('@langchain/core/output_parsers', () => ({
  JsonOutputParser: jest.fn().mockImplementation(() => ({
    pipe: jest.fn(),
  })),
}));

jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromTemplate: jest.fn().mockReturnValue({
      pipe: jest.fn().mockReturnValue({
        pipe: jest.fn().mockReturnValue({
          invoke: jest.fn().mockImplementation(() => {
            mockChainInvokeCalls += 1;
            if (mockChainInvokeError !== undefined) {
              return Promise.reject(mockChainInvokeError);
            }
            return Promise.resolve(mockChainInvokeResult);
          }),
        }),
      }),
    }),
  },
}));

const { buildPromptInput, createInferenceVariantProvider, INFERENCE_VARIANT_PROVIDER_NAME } =
  jest.requireActual(
    './inference_variant_provider'
  ) as typeof import('./inference_variant_provider');

const advisory = ARGUS_DEMO_ADVISORIES[0];

const baseInput: VariantProviderInput = {
  advisory,
  axis: 'command_args',
  platform: 'windows',
  budget: 3,
  corpus_id: 'corpus-test-001',
  rule_id: 'argus.test.rule',
};

const validRawCandidate = (i: number): Record<string, string> => ({
  process_name: 'powershell.exe',
  process_executable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  command_line: `powershell.exe -NoProfile -Command Write-Host ok-${i}`,
  parent_name: 'explorer.exe',
  parent_executable: 'C:\\Windows\\explorer.exe',
  rationale: `kbn-inference test variant #${i} for command_args axis`,
});

const fakeChatModel = {} as unknown as InferenceChatModel;

describe('createInferenceVariantProvider', () => {
  const logger = loggingSystemMock.createLogger();

  beforeEach(() => {
    jest.clearAllMocks();
    mockChainInvokeResult = undefined;
    mockChainInvokeError = undefined;
    mockChainInvokeCalls = 0;
  });

  it('returns the expected number of variants on the happy path', async () => {
    mockChainInvokeResult = [validRawCandidate(0), validRawCandidate(1), validRawCandidate(2)];

    const provider = createInferenceVariantProvider({ chatModel: fakeChatModel, logger });
    const out = await provider.generate(baseInput);

    expect(out).toHaveLength(3);
    expect(mockChainInvokeCalls).toBe(1);
    expect(out[0].process_name).toBe('powershell.exe');
    expect(out[0].rationale).toContain('kbn-inference test variant #0');
  });

  it('falls back to the scripted provider when the LLM throws', async () => {
    mockChainInvokeError = new Error('connector unavailable');

    const provider = createInferenceVariantProvider({ chatModel: fakeChatModel, logger });
    const out = await provider.generate(baseInput);

    expect(out).toHaveLength(3);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('LLM call failed for advisory=')
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('connector unavailable'));
  });

  it('falls back when the LLM returns a non-array', async () => {
    mockChainInvokeResult = { not: 'an array' };

    const provider = createInferenceVariantProvider({ chatModel: fakeChatModel, logger });
    const out = await provider.generate(baseInput);

    expect(out).toHaveLength(3);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('LLM returned non-array'));
  });

  it('falls back when the LLM returns the wrong number of candidates', async () => {
    mockChainInvokeResult = [validRawCandidate(0), validRawCandidate(1)]; // only 2, need 3

    const provider = createInferenceVariantProvider({ chatModel: fakeChatModel, logger });
    const out = await provider.generate(baseInput);

    expect(out).toHaveLength(3);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('LLM returned 2 variants, expected 3')
    );
  });

  it('substitutes one fallback slot when a single candidate is malformed', async () => {
    mockChainInvokeResult = [
      validRawCandidate(0),
      { process_name: 'cmd.exe' /* missing required fields */ },
      validRawCandidate(2),
    ];

    const provider = createInferenceVariantProvider({ chatModel: fakeChatModel, logger });
    const out = await provider.generate(baseInput);

    expect(out).toHaveLength(3);
    expect(out[0].rationale).toContain('test variant #0');
    expect(out[2].rationale).toContain('test variant #2');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('was malformed; substituting scripted fallback for this slot')
    );
    expect(out[1]).not.toBe(out[0]);
  });

  it('coerces missing rationale to a deterministic placeholder', async () => {
    const noRationale = {
      process_name: 'powershell.exe',
      process_executable: 'C:\\powershell.exe',
      command_line: 'powershell.exe -NoProfile -X',
      parent_name: 'explorer.exe',
      parent_executable: 'C:\\Windows\\explorer.exe',
    };

    mockChainInvokeResult = [noRationale, noRationale, noRationale];

    const provider = createInferenceVariantProvider({ chatModel: fakeChatModel, logger });
    const out = await provider.generate(baseInput);

    expect(out).toHaveLength(3);
    expect(out.every((v) => typeof v.rationale === 'string' && v.rationale.length > 0)).toBe(true);
  });

  it('uses the provided fallback override when the LLM call fails', async () => {
    mockChainInvokeError = new Error('boom');

    const fallbackCalls: VariantProviderInput[] = [];
    const stubFallback: VariantProvider = {
      async generate(input: VariantProviderInput) {
        fallbackCalls.push(input);
        const stub: VariantCandidate = {
          process_name: 'pwsh.exe',
          process_executable: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
          command_line: 'pwsh.exe --stub --override',
          parent_name: 'explorer.exe',
          parent_executable: 'C:\\Windows\\explorer.exe',
          rationale: 'stub-fallback override',
        };
        return Array.from({ length: input.budget }, () => stub);
      },
    };

    const provider = createInferenceVariantProvider({
      chatModel: fakeChatModel,
      logger,
      fallback: stubFallback,
    });
    const out = await provider.generate(baseInput);

    expect(out).toHaveLength(3);
    expect(out.every((v) => v.rationale === 'stub-fallback override')).toBe(true);
    expect(fallbackCalls).toHaveLength(1);
    expect(fallbackCalls[0].axis).toBe('command_args');
  });

  it('exposes a stable provider name token for trace emission', () => {
    expect(INFERENCE_VARIANT_PROVIDER_NAME).toBe('kbn-inference');
  });

  it('default fallback is DEFAULT_SCRIPTED_LLM_PROVIDER (deterministic for same inputs)', async () => {
    mockChainInvokeError = new Error('force fallback');

    const provider = createInferenceVariantProvider({ chatModel: fakeChatModel, logger });
    const a = await provider.generate(baseInput);

    mockChainInvokeError = new Error('force fallback');
    const b = await provider.generate(baseInput);

    expect(a).toEqual(b);
    const directScripted = await DEFAULT_SCRIPTED_LLM_PROVIDER.generate(baseInput);
    expect(a).toEqual(directScripted);
  });
});

describe('buildPromptInput', () => {
  it('exposes all advisory + axis + platform + budget + identity fields', () => {
    const input = buildPromptInput(baseInput);

    expect(input.advisory_id).toBe(advisory.advisory_id);
    expect(input.advisory_title).toBe(advisory.title);
    expect(input.advisory_summary).toBe(advisory.summary);
    expect(input.primary_technique).toContain(advisory.mitre[0].technique_id);
    expect(input.axis).toBe('command_args');
    expect(input.platform).toBe('windows');
    expect(input.budget).toBe('3');
    expect(input.corpus_id).toBe('corpus-test-001');
    expect(input.rule_id).toBe('argus.test.rule');
  });

  it('handles advisories without a primary MITRE technique gracefully', () => {
    const advisoryNoMitre = { ...advisory, mitre: [] as typeof advisory.mitre } as typeof advisory;
    const input = buildPromptInput({ ...baseInput, advisory: advisoryNoMitre });
    expect(input.primary_technique).toBe('unknown');
  });
});
