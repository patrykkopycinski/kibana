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
  SentinelOneRunActionParams,
  SentinelOneRunActionResponse,
  SentinelOneStoriesActionResponse,
  SentinelOneWebhookObject,
} from '../../../common/sentinelone/types';
import { SentinelOneBaseApiResponseSchema } from './api_schema';
import type { SentinelOneBaseApiResponse } from './api_schema';
import { SUB_ACTION } from '../../../common/sentinelone/constants';

export const API_PATH = '/web/api/v2.1';
export const WEBHOOK_PATH = '/webhook';
export const WEBHOOK_AGENT_TYPE = 'Agents::WebhookAgent';

export class SentinelOneConnector extends SubActionConnector<
  SentinelOneConfig,
  SentinelOneSecrets
> {
  private urls: {
    remoteScripts: string;
    agents: string;
    remoteScriptsExecute: string;
    getRunWebhookURL: (webhook: SentinelOneWebhookObject) => string;
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
      getRunWebhookURL: (webhook) =>
        `${this.config.url}${WEBHOOK_PATH}/${webhook.path}/${webhook.secret}`,
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
      name: SUB_ACTION.RUN,
      method: 'runWebhook',
      schema: SentinelOneBaseApiResponseSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.TEST,
      method: 'runWebhook',
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
  }

  public async killProcess(payload) {
    const terminateScriptResponse = await this.sentinelOneApiRequest({
      url: this.urls.remoteScripts,
      params: {
        query: 'terminate',
        osTypes: payload.osType,
      },
      responseSchema: SentinelOneBaseApiResponseSchema,
    });

    return this.this.sentinelOneApiRequest({
      url: this.urls.remoteScriptsExecute,
      method: 'post',
      params: {
        data: {
          outputDestination: 'SentinelCloud',
          scriptId: terminateScriptResponse.data.data[0].id,
          scriptRuntimeTimeoutSeconds:
            terminateScriptResponse.data.data[0].scriptRuntimeTimeoutSeconds,
          taskDescription: terminateScriptResponse.data.data[0].scriptName,
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

    console.error('releaseAgent response: ', response);

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
        // limit: API_MAX_RESULTS,
        APIToken:
          //  this.secrets.token
          'UqWuy281YioTN11dK5mEejpprE3qjURFSKZt2FXv1xTrDgbFrdIa454BnJm7y1w4EjqWr0vOXaZP7hjJ',
      },
    });

    console.error('response: ', response.data);

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
    });
  }

  // public async getWebhooks({
  //   storyId,
  // }: SentinelOneWebhooksActionParams): Promise<SentinelOneWebhooksActionResponse> {
  //   return this.sentinelOneApiRequest(
  //     {
  //       url: this.urls.agents,
  //       params: { story_id: storyId },
  //       headers: this.getAuthHeaders(),
  //       responseSchema: SentinelOneWebhooksApiResponseSchema,
  //     },
  //   );
  // }

  public async runWebhook(
    params: SentinelOneRunActionParams
  ): Promise<SentinelOneRunActionResponse> {
    console.log('------------------');
    // console.log('webhook: ', webhook);
    // console.log('webhookUrl: ', webhookUrl);
    // console.log('runWebhook body: ', JSON.stringify(body, null, 2));
    console.log('------------------');

    const response = await this.request({
      url: this.urls.remoteScriptsExecute,
      method: 'post',
      responseSchema: SentinelOneRunApiResponseSchema,
      params: {
        APIToken:
          'UqWuy281YioTN11dK5mEejpprE3qjURFSKZt2FXv1xTrDgbFrdIa454BnJm7y1w4EjqWr0vOXaZP7hjJ',
      },
      data: {
        filter: {},
        data: {
          outputDestination: 'SentinelCloud',
          taskDescription: 'Processessss list',
          scriptId: '1164327803034796041',
        },
      },
    });

    console.error('response: ', response.data);

    // if (!webhook && !webhookUrl) {
    //   throw Error('Invalid subActionsParams: [webhook] or [webhookUrl] expected but got none');
    // }
    // const response = await this.request({
    //   url: webhookUrl ? webhookUrl : this.urls.getRunWebhookURL(webhook!),
    //   method: 'post',
    //   responseSchema: SentinelOneRunApiResponseSchema,
    //   data: body,
    // });
    return response.data;
  }
}
