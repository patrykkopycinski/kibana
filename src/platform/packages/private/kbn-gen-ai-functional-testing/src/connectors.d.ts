/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * The environment variable that is used by the CI to load the connectors configuration
 */
export declare const AI_CONNECTORS_VAR_ENV = 'KIBANA_TESTING_AI_CONNECTORS';
export interface AvailableConnector {
  name: string;
  actionTypeId: string;
  config: Record<string, unknown>;
  secrets?: Record<string, unknown>;
}
export interface AvailableConnectorWithId extends AvailableConnector {
  id: string;
}
/**
 * Retrieve the list of preconfigured connectors that should be used when defining the
 * FTR configuration of suites using the connectors.
 *
 * @example
 * ```ts
 * import { getPreconfiguredConnectorConfig } from '@kbn/gen-ai-functional-testing'
 *
 * export default async function ({ readConfigFile }: FtrConfigProviderContext) {
 *   const xpackFunctionalConfig = {...};
 *   const preconfiguredConnectors = getPreconfiguredConnectorConfig();
 *
 *   return {
 *     ...xpackFunctionalConfig.getAll(),
 *     kbnTestServer: {
 *       ...xpackFunctionalConfig.get('kbnTestServer'),
 *       serverArgs: [
 *         ...xpackFunctionalConfig.get('kbnTestServer.serverArgs'),
 *         `--xpack.actions.preconfigured=${JSON.stringify(preconfiguredConnectors)}`,
 *       ],
 *     },
 *   };
 * }
 * ```
 */
export declare const getPreconfiguredConnectorConfig: () => Record<string, AvailableConnector>;
export declare const getAvailableConnectors: () => AvailableConnectorWithId[];
