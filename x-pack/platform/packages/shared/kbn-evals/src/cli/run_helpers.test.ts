/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FlagsReader, getFlags } from '@kbn/dev-cli-runner';
import { ToolingLog } from '@kbn/tooling-log';
import {
  buildEvalRunArgs,
  buildEvalRunEnv,
  createEvalsClientFromEnv,
  evalRunFlags,
  loadScoutHookConfig,
  readConcurrencyFlag,
  resolveEvaluationConnectorId,
} from './run_helpers';
import type { EvalSuiteDefinition } from './suites';
import {
  loadVaultConfig,
  readSuiteSecretFromDevVault,
  resolveDefaultJudgeConnectorId,
} from './profiles';
import { isTTY, promptForConnector } from './prompts';
import { EvalsClient } from '../utils/evals_client';
import { getEvaluationsKbnClient } from '../utils/evaluations_kbn_client';

jest.mock('./profiles', () => ({
  ...jest.requireActual('./profiles'),
  loadVaultConfig: jest.fn(),
  readSuiteSecretFromDevVault: jest.fn(),
  resolveDefaultJudgeConnectorId: jest.fn(),
}));

jest.mock('./prompts', () => ({
  ...jest.requireActual('./prompts'),
  isTTY: jest.fn(),
  promptForConnector: jest.fn(),
}));

jest.mock('../utils/evals_client', () => ({
  ...jest.requireActual('../utils/evals_client'),
  EvalsClient: jest.fn(),
}));

jest.mock('../utils/evaluations_kbn_client', () => ({
  getEvaluationsKbnClient: jest.fn(),
}));

const mockedLoadVaultConfig = jest.mocked(loadVaultConfig);
const mockedReadSuiteSecret = jest.mocked(readSuiteSecretFromDevVault);

const readFlags = (argv: string[]): FlagsReader => new FlagsReader(getFlags(argv, evalRunFlags));

describe('loadScoutHookConfig', () => {
  const originalCiHookConfig = process.env.KBN_EVALS_SCOUT_HOOK_CONFIG_B64;
  const generalConfig = {
    evaluationsKbn: { url: 'https://kbn.example' },
    sandbox: { apiKey: 'from-general' },
  };
  const suiteSecret = { sandbox: { apiKey: 'from-suite-secret' } };

  beforeEach(() => {
    delete process.env.KBN_EVALS_SCOUT_HOOK_CONFIG_B64;
    mockedLoadVaultConfig.mockReset().mockReturnValue(generalConfig);
    mockedReadSuiteSecret.mockReset().mockReturnValue(suiteSecret);
  });

  afterEach(() => {
    if (originalCiHookConfig === undefined) {
      delete process.env.KBN_EVALS_SCOUT_HOOK_CONFIG_B64;
    } else {
      process.env.KBN_EVALS_SCOUT_HOOK_CONFIG_B64 = originalCiHookConfig;
    }
  });

  it('reuses the suite config CI supplied to the initial hook when the CLI runs it again', () => {
    const ciConfig = {
      ...suiteSecret,
      nightshiftOrcaEs: { url: 'https://orca.example', apiKey: 'orca-key' },
    };
    process.env.KBN_EVALS_SCOUT_HOOK_CONFIG_B64 = Buffer.from(JSON.stringify(ciConfig)).toString(
      'base64'
    );
    mockedLoadVaultConfig.mockReturnValue(undefined);

    expect(loadScoutHookConfig('/repo', undefined, { vaultSecret: 'nightshift' })).toEqual(
      ciConfig
    );
    expect(mockedLoadVaultConfig).not.toHaveBeenCalled();
    expect(mockedReadSuiteSecret).not.toHaveBeenCalled();
  });

  it.each(['not-json-with-private-value', '[]', 'null', '"private-value"'])(
    'rejects an invalid CI hook config without exposing its contents (%s)',
    (config) => {
      process.env.KBN_EVALS_SCOUT_HOOK_CONFIG_B64 = Buffer.from(config).toString('base64');

      expect(() => loadScoutHookConfig('/repo', undefined, {})).toThrow(
        'CI scout-hook config must encode a JSON object'
      );
    }
  );

  it('keeps an explicit file profile ahead of the inherited CI hook config', () => {
    process.env.KBN_EVALS_SCOUT_HOOK_CONFIG_B64 = Buffer.from(JSON.stringify(suiteSecret)).toString(
      'base64'
    );

    expect(loadScoutHookConfig('/repo', 'local', { vaultSecret: 'nightshift' })).toBe(
      generalConfig
    );
  });

  it("gives the hook the suite's own secret with the dev-vault profile", () => {
    expect(loadScoutHookConfig('/repo', 'dev-vault', { vaultSecret: 'nightshift' })).toBe(
      suiteSecret
    );
    expect(mockedReadSuiteSecret).toHaveBeenCalledWith('nightshift');
    expect(mockedLoadVaultConfig).not.toHaveBeenCalled();
  });

  it('gives the hook an empty config when the suite secret cannot be read', () => {
    mockedReadSuiteSecret.mockReturnValue(undefined);

    expect(loadScoutHookConfig('/repo', 'dev-vault', { vaultSecret: 'nightshift' })).toEqual({});
    expect(mockedLoadVaultConfig).not.toHaveBeenCalled();
  });

  it('keeps passing the profile JSON for a file profile, even with a vaultSecret', () => {
    expect(loadScoutHookConfig('/repo', 'local', { vaultSecret: 'nightshift' })).toBe(
      generalConfig
    );
    expect(mockedLoadVaultConfig).toHaveBeenCalledWith('/repo', 'local');
    expect(mockedReadSuiteSecret).not.toHaveBeenCalled();
  });

  it('passes the general dev-vault config to suites without a vaultSecret', () => {
    expect(loadScoutHookConfig('/repo', 'dev-vault', {})).toBe(generalConfig);
    expect(mockedLoadVaultConfig).toHaveBeenCalledWith('/repo', 'dev-vault');
    expect(mockedReadSuiteSecret).not.toHaveBeenCalled();
  });
});

describe('readConcurrencyFlag', () => {
  it('is undefined when --concurrency is not passed', () => {
    expect(readConcurrencyFlag(readFlags([]))).toBeUndefined();
  });

  it('reads a positive integer', () => {
    expect(readConcurrencyFlag(readFlags(['--concurrency', '8']))).toBe('8');
  });

  it.each(['0', 'abc', '-2', '2.5'])('rejects --concurrency %s with a flag error', (value) => {
    expect(() => readConcurrencyFlag(readFlags([`--concurrency=${value}`]))).toThrow(
      expect.objectContaining({
        message: `--concurrency must be a positive integer, got "${value}".`,
        showHelp: true,
      })
    );
  });
});

describe('readConcurrencyFlag with EVAL_CONCURRENCY', () => {
  const previous = process.env.EVAL_CONCURRENCY;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.EVAL_CONCURRENCY;
    } else {
      process.env.EVAL_CONCURRENCY = previous;
    }
  });

  it('rejects an invalid EVAL_CONCURRENCY with a flag error when the flag is not passed', () => {
    process.env.EVAL_CONCURRENCY = '0';
    expect(() => readConcurrencyFlag(readFlags([]))).toThrow(
      expect.objectContaining({
        message: 'EVAL_CONCURRENCY must be a positive integer, got "0".',
        showHelp: true,
      })
    );
  });

  it('leaves a valid EVAL_CONCURRENCY for the Playwright config to read', () => {
    process.env.EVAL_CONCURRENCY = '8';
    expect(readConcurrencyFlag(readFlags([]))).toBeUndefined();
  });

  it('lets the flag win over an invalid EVAL_CONCURRENCY', () => {
    process.env.EVAL_CONCURRENCY = 'abc';
    expect(readConcurrencyFlag(readFlags(['--concurrency', '4']))).toBe('4');
  });
});

describe('--concurrency forwarding', () => {
  const log = new ToolingLog();

  it('sets EVAL_CONCURRENCY for the Playwright run', () => {
    const env = buildEvalRunEnv({
      evaluationConnectorId: 'judge',
      requiresEisCcm: false,
      skipServer: true,
      profileEnvOverrides: {},
      suiteScoutEnv: {},
      flagsReader: readFlags(['--concurrency', '8']),
      log,
    });

    expect(env.EVAL_CONCURRENCY).toBe('8');
  });

  it('leaves EVAL_CONCURRENCY unset when the flag is not passed', () => {
    const env = buildEvalRunEnv({
      evaluationConnectorId: 'judge',
      requiresEisCcm: false,
      skipServer: true,
      profileEnvOverrides: {},
      suiteScoutEnv: {},
      flagsReader: readFlags([]),
      log,
    });

    expect(env).not.toHaveProperty('EVAL_CONCURRENCY');
  });

  it('passes --concurrency on to the re-run args', () => {
    const args = buildEvalRunArgs({
      suiteId: 'agent-builder',
      evaluationConnectorId: 'judge',
      projects: [],
      flagsReader: readFlags(['--concurrency', '8']),
    });

    expect(args).toEqual(expect.arrayContaining(['--concurrency', '8']));
  });
});

describe('resolveEvaluationConnectorId', () => {
  const repoRoot = '/repo';
  const originalConnectorId = process.env.EVAL_CONNECTOR_ID;
  const log = new ToolingLog();
  const suite = { id: 'pinned', defaultJudge: 'eis-pinned' } as EvalSuiteDefinition;
  const DEFAULT_JUDGE = 'eis-default-judge';

  const resolve = (argv: string[], withSuite?: EvalSuiteDefinition, profile?: string) =>
    resolveEvaluationConnectorId(repoRoot, log, readFlags(argv), withSuite, profile);

  beforeEach(() => {
    delete process.env.EVAL_CONNECTOR_ID;
    jest.mocked(isTTY).mockReturnValue(false);
    jest.mocked(promptForConnector).mockReset();
    jest.mocked(resolveDefaultJudgeConnectorId).mockReturnValue(undefined);
  });

  afterEach(() => {
    if (originalConnectorId === undefined) {
      delete process.env.EVAL_CONNECTOR_ID;
    } else {
      process.env.EVAL_CONNECTOR_ID = originalConnectorId;
    }
  });

  it('prefers --evaluation-connector-id over the env var and the suite default', async () => {
    process.env.EVAL_CONNECTOR_ID = 'from-env';
    await expect(resolve(['--evaluation-connector-id', 'from-flag'], suite)).resolves.toBe(
      'from-flag'
    );
  });

  it('prefers EVAL_CONNECTOR_ID over the suite default', async () => {
    process.env.EVAL_CONNECTOR_ID = 'from-env';
    await expect(resolve([], suite)).resolves.toBe('from-env');
  });

  it('falls back to the suite defaultJudge, including for an empty EVAL_CONNECTOR_ID', async () => {
    process.env.EVAL_CONNECTOR_ID = '';
    await expect(resolve([], suite)).resolves.toBe('eis-pinned');
  });

  it('requires a judge when neither a flag, the env var nor a suite default is set', async () => {
    await expect(resolve([])).rejects.toThrow('EVAL_CONNECTOR_ID is required');
  });

  it('prompts with the profile default judge pre-selected on a TTY', async () => {
    jest.mocked(isTTY).mockReturnValue(true);
    jest.mocked(resolveDefaultJudgeConnectorId).mockReturnValue(DEFAULT_JUDGE);
    jest.mocked(promptForConnector).mockResolvedValue('picked');

    await expect(resolve([], undefined, 'dev-vault')).resolves.toBe('picked');
    expect(resolveDefaultJudgeConnectorId).toHaveBeenCalledWith(repoRoot, 'dev-vault');
    expect(promptForConnector).toHaveBeenCalledWith(repoRoot, log, undefined, DEFAULT_JUDGE);
  });

  it('prompts without a pre-selection on a TTY when the profile has no default judge', async () => {
    jest.mocked(isTTY).mockReturnValue(true);
    jest.mocked(promptForConnector).mockResolvedValue('picked');

    await expect(resolve([])).resolves.toBe('picked');
    expect(promptForConnector).toHaveBeenCalledWith(repoRoot, log, undefined, undefined);
  });

  it('uses the profile default judge without prompting when there is no TTY', async () => {
    jest.mocked(resolveDefaultJudgeConnectorId).mockReturnValue(DEFAULT_JUDGE);

    await expect(resolve([], undefined, 'dev-vault')).resolves.toBe(DEFAULT_JUDGE);
    expect(promptForConnector).not.toHaveBeenCalled();
  });
});

describe('createEvalsClientFromEnv', () => {
  const originalEnv = { url: process.env.EVAL_KBN_URL, apiKey: process.env.EVAL_KBN_API_KEY };
  const evaluationsKbnClient = { evaluations: 'kbn-client' };
  const assertPluginEnabled = jest.fn();
  const assertSpacesExist = jest.fn();
  let log: ToolingLog;

  const restore = (name: 'EVAL_KBN_URL' | 'EVAL_KBN_API_KEY', value: string | undefined) => {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  };

  beforeEach(() => {
    delete process.env.EVAL_KBN_URL;
    delete process.env.EVAL_KBN_API_KEY;
    log = new ToolingLog();
    jest.spyOn(log, 'warning').mockImplementation(() => true);
    assertPluginEnabled.mockReset().mockResolvedValue(undefined);
    assertSpacesExist.mockReset().mockResolvedValue(undefined);
    jest
      .mocked(getEvaluationsKbnClient)
      .mockReset()
      .mockReturnValue(evaluationsKbnClient as never);
    jest
      .mocked(EvalsClient)
      .mockReset()
      .mockImplementation(
        () => ({ assertPluginEnabled, assertSpacesExist } as unknown as EvalsClient)
      );
  });

  afterEach(() => {
    restore('EVAL_KBN_URL', originalEnv.url);
    restore('EVAL_KBN_API_KEY', originalEnv.apiKey);
  });

  it('builds the client from EVAL_KBN_URL and EVAL_KBN_API_KEY and passes the spaces on', async () => {
    process.env.EVAL_KBN_URL = 'https://kbn.example';
    process.env.EVAL_KBN_API_KEY = 'secret-key';

    const client = await createEvalsClientFromEnv(log, ['team-a']);

    expect(getEvaluationsKbnClient).toHaveBeenCalledWith(
      expect.objectContaining({
        log,
        evaluationsKbnUrl: 'https://kbn.example',
        evaluationsKbnApiKey: 'secret-key',
      })
    );
    expect(EvalsClient).toHaveBeenCalledWith(evaluationsKbnClient, log, { spaceIds: ['team-a'] });
    expect(client).toBe(jest.mocked(EvalsClient).mock.results[0].value);
    expect(assertPluginEnabled).toHaveBeenCalledTimes(1);
    expect(assertSpacesExist).toHaveBeenCalledTimes(1);
    expect(log.warning).not.toHaveBeenCalled();
  });

  it('warns that it is defaulting to the local Kibana when EVAL_KBN_URL is unset', async () => {
    await createEvalsClientFromEnv(log, undefined);

    expect(log.warning).toHaveBeenCalledWith(
      'EVAL_KBN_URL not set; defaulting to http://elastic:changeme@localhost:5601.'
    );
    expect(getEvaluationsKbnClient).toHaveBeenCalledWith(
      expect.objectContaining({ evaluationsKbnUrl: undefined, evaluationsKbnApiKey: undefined })
    );
  });

  it('turns a disabled evals plugin into a flag error that names the env vars to set', async () => {
    assertPluginEnabled.mockRejectedValue(new Error('evals plugin is disabled'));

    const error = await createEvalsClientFromEnv(log, undefined).catch((e) => e);

    expect(error.message).toContain('evals plugin is disabled');
    expect(error.message).toContain('Set EVAL_KBN_URL to a Kibana instance');
    expect(error.message).toContain('Set EVAL_KBN_API_KEY');
    expect(assertSpacesExist).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error rejection from the plugin check', async () => {
    assertPluginEnabled.mockRejectedValue('plain failure');

    await expect(createEvalsClientFromEnv(log, undefined)).rejects.toThrow('plain failure');
  });

  it('turns a missing space into a flag error carrying the original message', async () => {
    assertSpacesExist.mockRejectedValue(new Error('space "nope" does not exist'));

    await expect(createEvalsClientFromEnv(log, ['nope'])).rejects.toThrow(
      'space "nope" does not exist'
    );
  });

  it('stringifies a non-Error rejection from the space check', async () => {
    assertSpacesExist.mockRejectedValue('no such space');

    await expect(createEvalsClientFromEnv(log, ['nope'])).rejects.toThrow('no such space');
  });
});
