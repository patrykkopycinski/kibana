/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StackConnectorDefinition } from '../utils/eval_connector';

let mockScoutProjects: Array<{ name: string; use?: object; timeout?: number }> = [
  { name: 'local', use: {} },
];

jest.mock('@kbn/scout', () => ({
  createPlaywrightConfig: () => ({
    reporter: [],
    use: { serversConfigDir: '/servers' },
    projects: mockScoutProjects,
  }),
}));

const mockConnectors: StackConnectorDefinition[] = [
  { id: 'judge', name: 'Judge', actionTypeId: '.gen-ai', config: {}, type: 'stack_connector' },
  { id: 'model', name: 'Model', actionTypeId: '.gen-ai', config: {}, type: 'stack_connector' },
];

jest.mock('../utils/inference_endpoint_definition', () => ({
  loadInferenceEndpoints: () => [],
}));
jest.mock('../utils/eval_connector', () => ({
  loadStackConnectors: () => mockConnectors,
}));

import { createPlaywrightEvalsConfig, resolveScoutProject } from './create_playwright_eval_config';

describe('createPlaywrightEvalsConfig concurrency', () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env.EVAL_CONNECTOR_ID = 'judge';
    delete process.env.EVAL_CONCURRENCY;
  });

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  const projectConcurrency = (options: { concurrency?: number } = {}): unknown[] =>
    (createPlaywrightEvalsConfig({ testDir: '/evals', ...options }).projects ?? []).map(
      ({ use }) => (use as { concurrency?: number } | undefined)?.concurrency
    );

  it('defaults every connector project to 5', () => {
    expect(projectConcurrency()).toEqual([5, 5]);
  });

  it("uses the suite's configured concurrency", () => {
    expect(projectConcurrency({ concurrency: 16 })).toEqual([16, 16]);
  });

  it('lets EVAL_CONCURRENCY override the suite default', () => {
    process.env.EVAL_CONCURRENCY = '8';
    expect(projectConcurrency({ concurrency: 16 })).toEqual([8, 8]);
  });

  it('treats an empty EVAL_CONCURRENCY as unset, as CI forwards it', () => {
    process.env.EVAL_CONCURRENCY = '';
    expect(projectConcurrency({ concurrency: 16 })).toEqual([16, 16]);
  });

  it('rejects an invalid EVAL_CONCURRENCY', () => {
    process.env.EVAL_CONCURRENCY = '0';
    expect(() => projectConcurrency()).toThrow(
      'EVAL_CONCURRENCY must be a positive integer, got "0".'
    );
  });
});

describe('createPlaywrightEvalsConfig Scout project selection', () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env.EVAL_CONNECTOR_ID = 'judge';
    delete process.env.EVAL_SCOUT_PROJECT;
    mockScoutProjects = [
      { name: 'setup-local', use: {} },
      { name: 'local', use: { configName: 'local' } },
      { name: 'teardown-local', use: {} },
      { name: 'setup-mki', use: {} },
      { name: 'mki', use: { configName: 'cloud_mki' }, timeout: 90_000 },
      { name: 'teardown-mki', use: {} },
    ];
  });

  afterEach(() => {
    process.env = { ...previousEnv };
    mockScoutProjects = [{ name: 'local', use: {} }];
  });

  const names = () =>
    (createPlaywrightEvalsConfig({ testDir: '/evals' }).projects ?? []).map((p) => p.name);

  it('targets the local Scout stack by default', () => {
    expect(names()).toEqual(['setup-local', 'teardown-local', 'judge', 'model']);
  });

  it('targets the remote serverless project when EVAL_SCOUT_PROJECT=mki', () => {
    process.env.EVAL_SCOUT_PROJECT = 'mki';
    const projects = createPlaywrightEvalsConfig({ testDir: '/evals' }).projects ?? [];

    expect(projects.map((p) => p.name)).toEqual(['setup-mki', 'teardown-mki', 'judge', 'model']);
    const connectorProjects = projects.filter((p) => p.name === 'judge' || p.name === 'model');
    expect(connectorProjects.map((p) => (p.use as { configName?: string }).configName)).toEqual([
      'cloud_mki',
      'cloud_mki',
    ]);
  });

  it("drops Scout's 90s UI-test timeout from the remote project so the suite timeout applies", () => {
    process.env.EVAL_SCOUT_PROJECT = 'mki';
    const projects = createPlaywrightEvalsConfig({ testDir: '/evals' }).projects ?? [];

    expect(
      projects.filter((p) => p.name === 'judge' || p.name === 'model').map((p) => p.timeout)
    ).toEqual([undefined, undefined]);
  });

  it('rejects an unknown EVAL_SCOUT_PROJECT', () => {
    expect(() => resolveScoutProject('prod')).toThrow(/EVAL_SCOUT_PROJECT must be one of/);
  });

  it('treats an empty EVAL_SCOUT_PROJECT as unset, as CI forwards it', () => {
    expect(resolveScoutProject('')).toBe('local');
  });
});
