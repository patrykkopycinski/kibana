/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KbnClient, ScoutLogger } from '../../../../../../common';
import type {
  AgentPolicyCreateOptions,
  AgentPolicyUpdateOptions,
  BulkGetBody,
  FleetOutputBody,
  FleetServerHostCreateBody,
  PackagePolicyCreateBody,
} from './types';
export interface FleetApiService {
  internal: {
    setup: () => Promise<any>;
  };
  integration: {
    install: (name: string) => Promise<any>;
    installPackage: (
      name: string,
      version: string,
      opts?: {
        force?: boolean;
      }
    ) => Promise<any>;
    getPackage: (name: string) => Promise<any>;
    delete: (name: string) => Promise<any>;
  };
  package_policies: {
    get: (queryParams?: Record<string, any>) => Promise<any>;
    getById: (id: string) => Promise<any>;
    create: (body: PackagePolicyCreateBody, queryParams?: Record<string, string>) => Promise<any>;
    delete: (id: string) => Promise<any>;
    bulkDelete: (ids: [string]) => Promise<any>;
  };
  agent_policies: {
    get: (queryParams?: Record<string, any>) => Promise<any>;
    create: (options: AgentPolicyCreateOptions) => Promise<any>;
    update: (options: AgentPolicyUpdateOptions) => Promise<any>;
    bulkGet: (
      bulkGetIds: string[],
      params?: BulkGetBody,
      queryParams?: Record<string, string>
    ) => Promise<any>;
    delete: (id: string, isForceSet?: boolean) => Promise<any>;
  };
  outputs: {
    getOutputs: () => Promise<any>;
    getOutput: (id: string) => Promise<any>;
    create: (
      outputName: string,
      outputHosts: string[],
      outputType: string,
      params?: FleetOutputBody
    ) => Promise<any>;
    delete: (outputId: string) => Promise<any>;
  };
  server_hosts: {
    get: () => Promise<any>;
    create: (
      hostName: string,
      hostUrls: string[],
      params?: FleetServerHostCreateBody
    ) => Promise<any>;
    delete: (id: string) => Promise<any>;
  };
  agent: {
    setup: () => Promise<any>;
    get: (queryParams: Record<string, any>) => Promise<any>;
    delete: (agentId: string) => Promise<any>;
  };
}
export declare const getFleetApiHelper: (log: ScoutLogger, kbnClient: KbnClient) => FleetApiService;
