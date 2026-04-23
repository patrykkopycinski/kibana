/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  CoreLogger,
  ArgusMcpCoreDeps,
  ToolsCallError,
  ToolsCallResponse,
  ToolsListResponse,
} from './src/core';
export { ArgusMcpCore } from './src/core';

export type {
  DispatchRequest,
  DispatchResult,
  GovernanceClient,
  MutationIntentSummary,
  SkillDispatcher,
} from './src/types';

export {
  ARGUS_MCP_SERVER_NAME,
  ARGUS_MCP_SERVER_VERSION,
  createArgusMcpServer,
} from './src/mcp_server';
export type { ArgusMcpServerOptions } from './src/mcp_server';

export {
  RestGovernanceClient,
  type RestGovernanceClientConfig,
} from './src/rest_governance_client';
export { RestSkillDispatcher, type RestSkillDispatcherConfig } from './src/rest_skill_dispatcher';
