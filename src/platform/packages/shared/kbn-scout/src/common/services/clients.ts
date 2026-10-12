/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFileSync } from 'fs';
import { CA_CERT_PATH } from '@kbn/dev-utils';
import { KbnClient } from '@kbn/kbn-client';
import { createEsClientForTesting } from '@kbn/test-es-server';
import type { ScoutLogger } from './logger';
import type { ScoutTestConfig, EsClient } from '../../types';

interface ClientOptions {
  serviceName: string;
  url: string;
  username: string;
  password: string;
  log: ScoutLogger;
}

function createClientUrlWithAuth({ serviceName, url, username, password, log }: ClientOptions) {
  const clientUrl = new URL(url);
  clientUrl.username = username;
  clientUrl.password = password;

  log.serviceLoaded(`${serviceName}Client`);

  return clientUrl.toString();
}

/** The project API key the config carries, inline or via `apiKeyEnv` (serverless targets). */
const resolveApiKey = (config: ScoutTestConfig): string | undefined =>
  config.apiKey ?? (config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined);

let esClientInstance: EsClient | null = null;
let kbnClientInstance: KbnClient | null = null;

export function getEsClient(config: ScoutTestConfig, log: ScoutLogger) {
  const apiKey = resolveApiKey(config);
  if (!esClientInstance && apiKey) {
    // Serverless projects have no basic-auth user: authenticate with the project API key.
    log.serviceLoaded('esClient');
    esClientInstance = createEsClientForTesting({
      esUrl: config.hosts.elasticsearch,
      isCloud: config.isCloud,
      auth: { apiKey },
    });
  }

  if (!esClientInstance) {
    const { username, password } = config.auth;
    const elasticsearchUrl = createClientUrlWithAuth({
      serviceName: 'es',
      url: config.hosts.elasticsearch,
      username,
      password,
      log,
    });

    esClientInstance = createEsClientForTesting({
      esUrl: elasticsearchUrl,
      isCloud: config.isCloud,
      authOverride: { username, password },
    });
  }

  return esClientInstance;
}

let linkedEsClientInstance: EsClient | null = null;

export function getLinkedEsClient(config: ScoutTestConfig, log: ScoutLogger) {
  if (!linkedEsClientInstance) {
    const linkedProject = config.linkedProject;
    if (!linkedProject) {
      throw new Error('linkedProject is not configured in ScoutTestConfig');
    }

    const { username, password } = linkedProject.auth;
    const elasticsearchUrl = createClientUrlWithAuth({
      serviceName: 'linkedEs',
      url: linkedProject.hosts.elasticsearch,
      username,
      password,
      log,
    });

    linkedEsClientInstance = createEsClientForTesting({
      esUrl: elasticsearchUrl,
      isCloud: config.isCloud,
      authOverride: { username, password },
    });
  }

  return linkedEsClientInstance;
}

export function getKbnClient(config: ScoutTestConfig, log: ScoutLogger) {
  if (!kbnClientInstance) {
    const apiKey = resolveApiKey(config);
    const kibanaUrl = apiKey
      ? config.hosts.kibana
      : createClientUrlWithAuth({
          serviceName: 'kbn',
          url: config.hosts.kibana,
          username: config.auth.username,
          password: config.auth.password,
          log,
        });
    if (apiKey) {
      log.serviceLoaded('kbnClient');
    }

    kbnClientInstance = new KbnClient({
      log,
      url: kibanaUrl,
      ...(apiKey ? { apiKey } : {}),
      ...(config.http2 ? { certificateAuthorities: [readFileSync(CA_CERT_PATH)] } : {}),
    });
  }

  return kbnClientInstance;
}
