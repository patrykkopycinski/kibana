/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ServiceParams, SubActionConnector } from '@kbn/actions-plugin/server';
import type { AxiosError } from 'axios';
import { SubActionRequestParams } from '@kbn/actions-plugin/server/sub_action_framework/types';
import type {
  SentinelOneConfig,
  SentinelOneSecrets,
  SentinelOneStoriesActionResponse,
} from '../../../common/sentinelone/types';
import { SentinelOneBaseApiResponseSchema } from './api_schema';
import type { SentinelOneBaseApiResponse } from './api_schema';
import { SUB_ACTION } from '../../../common/sentinelone/constants';

export const API_MAX_RESULTS = 1000;
export const API_PATH = '/web/api/v2.1';

export class SentinelOneConnector extends SubActionConnector<
  SentinelOneConfig,
  SentinelOneSecrets
> {
  private urls: {
    remoteScripts: string;
    agents: string;
    remoteScriptsExecute: string;
  };

  constructor(params: ServiceParams<SentinelOneConfig, SentinelOneSecrets>) {
    super(params);

    this.urls = {
      isolateAgent: `${this.config.url}${API_PATH}/agents/actions/disconnect`,
      releaseAgent: `${this.config.url}${API_PATH}/agents/actions/connect`,
      remoteScripts: `${this.config.url}${API_PATH}/remote-scripts`,
      remoteScriptStatus: `${this.config.url}${API_PATH}/remote-scripts/status`,
      remoteScriptsExecute: `${this.config.url}${API_PATH}/remote-scripts/execute`,
      agents: `${this.config.url}${API_PATH}/agents`,
    };

    this.registerSubActions();
  }

  private registerSubActions() {
    this.registerSubAction({
      name: SUB_ACTION.GET_REMOTE_SCRIPTS,
      method: 'getRemoteScripts',
      schema: SentinelOneBaseApiResponseSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.GET_REMOTE_SCRIPT_STATUS,
      method: 'getRemoteScriptStatus',
      schema: SentinelOneBaseApiResponseSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.GET_AGENTS,
      method: 'getAgents',
      schema: SentinelOneBaseApiResponseSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.ISOLATE_AGENT,
      method: 'isolateAgent',
      schema: SentinelOneBaseApiResponseSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.RELEASE_AGENT,
      method: 'releaseAgent',
      schema: SentinelOneBaseApiResponseSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.KILL_PROCESS,
      method: 'killProcess',
      schema: SentinelOneBaseApiResponseSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.EXECUTE_SCRIPT,
      method: 'executeScript',
      schema: SentinelOneBaseApiResponseSchema,
    });
  }

  public async executeScript(payload) {
    console.error('executeScript payload: ', payload);

    return this.sentinelOneApiRequest({
      url: this.urls.remoteScriptsExecute,
      method: 'post',
      data: {
        data: {
          outputDestination: 'SentinelCloud',
          ...payload.script,
        },
        filter: {
          computerName: payload.hostname,
        },
      },
      responseSchema: SentinelOneBaseApiResponseSchema,
    });
  }

  public async killProcess(payload) {
    console.error('killProcess payload: ', payload);

    const agentData = await this.sentinelOneApiRequest({
      url: this.urls.agents,
      params: {
        computerName: payload.hostname,
      },
      responseSchema: SentinelOneBaseApiResponseSchema,
    });

    const terminateScriptResponse = await this.sentinelOneApiRequest({
      url: this.urls.remoteScripts,
      params: {
        query: 'terminate',
        osTypes: agentData?.data[0]?.osType,
      },
      responseSchema: SentinelOneBaseApiResponseSchema,
    });

    if (!payload.processName) {
      throw new Error('No process name provided');
    }

    return this.sentinelOneApiRequest({
      url: this.urls.remoteScriptsExecute,
      method: 'post',
      data: {
        data: {
          outputDestination: 'SentinelCloud',
          scriptId: terminateScriptResponse.data[0].id,
          scriptRuntimeTimeoutSeconds: terminateScriptResponse.data[0].scriptRuntimeTimeoutSeconds,
          taskDescription: terminateScriptResponse.data[0].scriptName,
          inputParams: `--terminate --processes ${payload.processName}`,
        },
        filter: {
          computerName: payload.hostname,
        },
      },
      responseSchema: SentinelOneBaseApiResponseSchema,
    });
  }

  public async isolateAgent(payload) {
    const response = await this.sentinelOneApiRequest({
      url: this.urls.agents,
      params: {
        computerName: payload.hostname,
      },
      responseSchema: SentinelOneBaseApiResponseSchema,
    });

    console.error('isolateAgent response: ', response);

    if (response.data.length === 0) {
      throw new Error('No agents found');
    }

    if (response.data[0].networkStatus === 'disconnected') {
      throw new Error('Agent already isolated');
    }

    const agentId = response.data[0].id;

    return this.sentinelOneApiRequest({
      url: this.urls.isolateAgent,
      method: 'post',
      data: {
        filter: {
          ids: agentId,
        },
      },
      responseSchema: SentinelOneBaseApiResponseSchema,
    });
  }

  public async releaseAgent(payload) {
    const response = await this.sentinelOneApiRequest({
      url: this.urls.agents,
      params: {
        computerName: payload.hostname,
      },
      responseSchema: SentinelOneBaseApiResponseSchema,
    });

    // console.error('releaseAgent response: ', response);

    if (response.data.length === 0) {
      throw new Error('No agents found');
    }

    if (response.data[0].networkStatus !== 'disconnected') {
      throw new Error('Agent not isolated');
    }

    const agentId = response.data[0].id;

    return this.sentinelOneApiRequest({
      url: this.urls.releaseAgent,
      method: 'post',
      data: {
        filter: {
          ids: agentId,
        },
      },
      responseSchema: SentinelOneBaseApiResponseSchema,
    });
  }

  public async getAgents(payload) {
    return this.sentinelOneApiRequest({
      url: this.urls.agents,
      params: {
        ...payload,
      },
    });
  }

  public async getRemoteScriptStatus(payload) {
    console.error('getRemoteScriptStatus payload: ', payload);

    return this.sentinelOneApiRequest({
      url: this.urls.remoteScriptStatus,
      params: {
        parent_task_id: payload.parentTaskId,
      },
    });
  }

  private async sentinelOneApiRequest<R extends SentinelOneBaseApiResponse, T>(
    req: SubActionRequestParams<R>
  ): Promise<T & { incompleteResponse: boolean }> {
    const response = await this.request<R>({
      ...req,
      responseSchema: SentinelOneBaseApiResponseSchema,
      params: {
        ...req.params,
        APIToken:
          //  this.secrets.token
          'UqWuy281YioTN11dK5mEejpprE3qjURFSKZt2FXv1xTrDgbFrdIa454BnJm7y1w4EjqWr0vOXaZP7hjJ',
      },
    });

    // console.error('response: ', response.data);

    return response.data;
  }

  protected getResponseErrorMessage(error: AxiosError): string {
    if (!error.response?.status) {
      return 'Unknown API Error';
    }
    if (error.response.status === 401) {
      return 'Unauthorized API Error';
    }
    console.log('error.response', error.response, JSON.stringify(error.response.data));
    return `API Error: ${error.response?.statusText}`;
  }

  public async getRemoteScripts(): Promise<SentinelOneStoriesActionResponse> {
    return this.sentinelOneApiRequest({
      url: this.urls.remoteScripts,
      params: {
        limit: API_MAX_RESULTS,
      },
    });
  }
}
