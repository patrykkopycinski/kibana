/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ServiceParams, SubActionConnector } from '@kbn/actions-plugin/server';
import type { AxiosError } from 'axios';
import { SubActionRequestParams } from '@kbn/actions-plugin/server/sub_action_framework/types';
import {
  SentinelOneStoriesActionParamsSchema,
  SentinelOneRunActionParamsSchema,
} from '../../../common/sentinelone/schema';
import type {
  SentinelOneConfig,
  SentinelOneSecrets,
  SentinelOneRunActionParams,
  SentinelOneRunActionResponse,
  SentinelOneStoriesActionResponse,
  SentinelOneWebhookObject,
} from '../../../common/sentinelone/types';
import { SentinelOneStoriesApiResponseSchema, SentinelOneRunApiResponseSchema } from './api_schema';
import type { SentinelOneBaseApiResponse, SentinelOneStoriesApiResponse } from './api_schema';
import { API_MAX_RESULTS, SUB_ACTION } from '../../../common/sentinelone/constants';

export const API_PATH = '/web/api/v2.1';
export const WEBHOOK_PATH = '/webhook';
export const WEBHOOK_AGENT_TYPE = 'Agents::WebhookAgent';

const storiesReducer = (data: SentinelOneStoriesApiResponse) => {
  // console.log('storiesReducer data: ', JSON.stringify(data, null, 2));
  return data;
  // return ({
  //   stories: stories.map<SentinelOneStoryObject>(({ id, name, published }) => ({
  //     id,
  //     name,
  //     published,
  //   })),
  // })
};

// const webhooksReducer = ({ agents }: SentinelOneWebhooksApiResponse) => ({
//   webhooks: agents.reduce<SentinelOneWebhookObject[]>(
//     (webhooks, { id, type, name, story_id: storyId, options: { path = '', secret = '' } }) => {
//       if (type === WEBHOOK_AGENT_TYPE) {
//         webhooks.push({ id, name, path, secret, storyId });
//       }
//       return webhooks;
//     },
//     []
//   ),
// });

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
      remoteScripts: `${this.config.url}${API_PATH}/remote-scripts`,
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
      schema: SentinelOneStoriesActionParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.RUN,
      method: 'runWebhook',
      schema: SentinelOneRunActionParamsSchema,
    });

    this.registerSubAction({
      name: SUB_ACTION.TEST,
      method: 'runWebhook',
      schema: SentinelOneRunActionParamsSchema,
    });
  }

  private async sentinelOneApiRequest<R extends SentinelOneBaseApiResponse, T>(
    req: SubActionRequestParams<R>,
    reducer: (response: R) => T
  ): Promise<T & { incompleteResponse: boolean }> {
    const response = await this.request<R>({
      ...req,
      params: {
        ...req.params,
        limit: API_MAX_RESULTS,
        APIToken:
          //  this.secrets.token
          'UqWuy281YioTN11dK5mEejpprE3qjURFSKZt2FXv1xTrDgbFrdIa454BnJm7y1w4EjqWr0vOXaZP7hjJ',
      },
    });
    return {
      ...reducer(response.data),
      incompleteResponse: false,
      // incompleteResponse: response.data.meta.pages > 1,
    };
  }

  protected getResponseErrorMessage(error: AxiosError): string {
    if (!error.response?.status) {
      return 'Unknown API Error';
    }
    if (error.response.status === 401) {
      return 'Unauthorized API Error';
    }
    console.log('error.response', error.response);
    return `API Error: ${error.response?.statusText}`;
  }

  public async getRemoteScripts(): Promise<SentinelOneStoriesActionResponse> {
    return this.sentinelOneApiRequest(
      {
        url: this.urls.remoteScripts,
        responseSchema: SentinelOneStoriesApiResponseSchema,
      },
      storiesReducer
    );
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
  //     webhooksReducer
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
