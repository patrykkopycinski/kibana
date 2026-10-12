/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

jest.mock('@kbn/kbn-client', () => ({
  KbnClient: jest.fn((options: unknown) => ({ options })),
}));

jest.mock('@kbn/test-es-server', () => ({
  createEsClientForTesting: jest.fn((options: unknown) => ({ options })),
}));

const noopLogger: ScoutLogger = {
  serviceMessage: jest.fn(),
  serviceLoaded: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
} as unknown as ScoutLogger;

const loadClients = (): typeof import('./clients') => {
  // The module memoizes its clients; reset the registry so each case starts clean.
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./clients');
};

const kbnClientMock = () =>
  (jest.requireMock('@kbn/kbn-client') as { KbnClient: jest.Mock }).KbnClient;
const esClientMock = () =>
  (jest.requireMock('@kbn/test-es-server') as { createEsClientForTesting: jest.Mock })
    .createEsClientForTesting;

const basicAuthConfig = {
  serverless: false,
  http2: false,
  uiam: false,
  isCloud: false,
  cloudUsersFilePath: '/path/to/role_users.json',
  license: 'trial',
  hosts: { kibana: 'http://localhost:5620', elasticsearch: 'http://localhost:9220' },
  auth: { username: 'elastic', password: 'changeme' },
} as unknown as ScoutTestConfig;

const apiKeyConfig = {
  ...basicAuthConfig,
  serverless: true,
  isCloud: true,
  projectType: 'security',
  productTier: 'complete',
  apiKey: 'project-api-key',
  hosts: {
    kibana: 'https://project.kb.us-central1.gcp.qa.elastic.cloud',
    elasticsearch: 'https://project.es.us-central1.gcp.qa.elastic.cloud',
  },
  auth: { username: '', password: '' },
} as unknown as ScoutTestConfig;

describe('scout clients auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getEsClient', () => {
    it('sends the project API key instead of basic auth when the config has one', () => {
      const { getEsClient } = loadClients();

      getEsClient(apiKeyConfig, noopLogger);

      expect(esClientMock()).toHaveBeenCalledTimes(1);
      expect(esClientMock().mock.calls[0][0]).toMatchObject({
        esUrl: 'https://project.es.us-central1.gcp.qa.elastic.cloud',
        isCloud: true,
        auth: { apiKey: 'project-api-key' },
      });
      // No credentials embedded in the URL and no basic auth override.
      expect(esClientMock().mock.calls[0][0].authOverride).toBeUndefined();
    });

    it('resolves an apiKeyEnv config from the environment', () => {
      process.env.SCOUT_TEST_PROJECT_API_KEY = 'env-key';
      try {
        const { getEsClient } = loadClients();

        getEsClient(
          { ...apiKeyConfig, apiKey: undefined, apiKeyEnv: 'SCOUT_TEST_PROJECT_API_KEY' },
          noopLogger
        );

        expect(esClientMock().mock.calls[0][0]).toMatchObject({
          auth: { apiKey: 'env-key' },
        });
      } finally {
        delete process.env.SCOUT_TEST_PROJECT_API_KEY;
      }
    });

    it('keeps basic auth when the config has no API key', () => {
      const { getEsClient } = loadClients();

      getEsClient(basicAuthConfig, noopLogger);

      const options = esClientMock().mock.calls[0][0];
      expect(options.esUrl).toBe('http://elastic:changeme@localhost:9220/');
      expect(options.authOverride).toEqual({ username: 'elastic', password: 'changeme' });
      expect(options.auth).toBeUndefined();
    });
  });

  describe('getKbnClient', () => {
    it('passes the API key to the client and keeps the URL credential-free', () => {
      const { getKbnClient } = loadClients();

      getKbnClient(apiKeyConfig, noopLogger);

      expect(kbnClientMock()).toHaveBeenCalledTimes(1);
      expect(kbnClientMock().mock.calls[0][0]).toMatchObject({
        url: 'https://project.kb.us-central1.gcp.qa.elastic.cloud',
        apiKey: 'project-api-key',
      });
    });

    it('keeps basic auth in the URL when the config has no API key', () => {
      const { getKbnClient } = loadClients();

      getKbnClient(basicAuthConfig, noopLogger);

      const options = kbnClientMock().mock.calls[0][0];
      expect(options.url).toBe('http://elastic:changeme@localhost:5620/');
      expect(options.apiKey).toBeUndefined();
    });
  });
});
