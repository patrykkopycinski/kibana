/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const LOCAL_CONNECTOR_ID = 'local-eval-model';

/**
 * Generate a base64-encoded KIBANA_TESTING_AI_CONNECTORS string pointing to a local endpoint.
 * The format matches what parseConnectorsFromEnv() in @kbn/evals expects.
 */
export function createLocalConnector(endpoint: string, modelName: string): string {
  const apiUrl = endpoint.endsWith('/v1')
    ? `${endpoint}/chat/completions`
    : `${endpoint}/v1/chat/completions`;

  const config = {
    [LOCAL_CONNECTOR_ID]: {
      name: `Local: ${modelName}`,
      actionTypeId: '.gen-ai',
      config: {
        apiUrl,
        apiProvider: 'Other',
        defaultModel: modelName,
      },
      secrets: {
        apiKey: 'local-eval',
      },
    },
  };

  return Buffer.from(JSON.stringify(config)).toString('base64');
}

/**
 * Set the environment variables needed to run evals against a local model.
 */
export function setLocalConnectorEnv(endpoint: string, modelName: string): void {
  process.env.KIBANA_TESTING_AI_CONNECTORS = createLocalConnector(endpoint, modelName);
  process.env.EVALUATION_CONNECTOR_ID = LOCAL_CONNECTOR_ID;
}

export function getLocalConnectorId(): string {
  return LOCAL_CONNECTOR_ID;
}
