/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createServerStepDefinition,
  getOutboundEventChainHeaders,
  X_ELASTIC_INTERNAL_ORIGIN_REQUEST,
} from '@kbn/workflows-extensions/server';
import type { KibanaRequest } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import {
  retryWithBackoffInputSchema,
  retryWithBackoffStepCommonDefinition,
} from '../../../../common/workflows/step_types/retry_with_backoff_step';

export { retryWithBackoffInputSchema };

const applySpacePrefix = (path: string, spaceId: string): string => {
  if (spaceId !== 'default' && path.startsWith('/') && !path.startsWith('/s/')) {
    return `/s/${spaceId}${path}`;
  }
  return path;
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (typeof error === 'object' && error !== null) {
    const withStatus = error as { status?: number; meta?: { statusCode?: number } };
    if (typeof withStatus.status === 'number') {
      return withStatus.status;
    }
    if (typeof withStatus.meta?.statusCode === 'number') {
      return withStatus.meta.statusCode;
    }
  }
  return undefined;
};

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isRetryable = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  if (status === 429 || status === 502 || status === 503) {
    return true;
  }
  const msg = formatError(error).toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('econnrefused') ||
    msg.includes('network error')
  );
};

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    const onAbort = () => {
      clearTimeout(tid);
      reject(new Error('Aborted'));
    };
    const tid = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort);
  });

const readJsonResponse = async (response: Response): Promise<unknown> => {
  if (response.status === 204 || response.status === 304) {
    return {};
  }
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const runKibanaOperation = async (params: {
  kibanaUrl: string;
  spaceId: string;
  fakeRequest: KibanaRequest;
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}): Promise<unknown> => {
  const {
    kibanaUrl,
    spaceId,
    fakeRequest,
    method,
    path,
    body,
    query,
    headers: headerOverrides = {},
  } = params;
  const authHeader = fakeRequest.headers.authorization;
  if (!authHeader) {
    throw new Error('Missing authorization on workflow request; cannot call Kibana APIs');
  }
  const normalizedPath = applySpacePrefix(path, spaceId);
  let url = `${kibanaUrl.replace(/\/$/, '')}${normalizedPath}`;
  if (query && Object.keys(query).length > 0) {
    url = `${url}?${new URLSearchParams(query).toString()}`;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'kbn-xsrf': 'true',
    Authorization: authHeader.toString(),
    [X_ELASTIC_INTERNAL_ORIGIN_REQUEST]: 'Kibana',
    ...getOutboundEventChainHeaders(fakeRequest),
    ...headerOverrides,
  };
  const response = await fetch(url, {
    method,
    headers,
    body:
      body === undefined || method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD'
        ? undefined
        : JSON.stringify(body),
  });
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 512)}`);
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }
  return readJsonResponse(response);
};

export const retryWithBackoffStepDefinition = createServerStepDefinition({
  ...retryWithBackoffStepCommonDefinition,
  handler: async (context) => {
    const { operation, max_retries: maxRetries, initial_delay_ms: initialDelayMs, backoff_multiplier: backoffMultiplier } =
      context.input;
    const esClient = context.contextManager.getScopedEsClient();
    const fakeRequest = context.contextManager.getFakeRequest();
    const stepContext = context.contextManager.getContext();
    const kibanaUrl = stepContext.kibanaUrl;
    const spaceId = stepContext.workflow.spaceId;

    let attempts = 0;
    let lastError: string | undefined;

    const maxAttempts = maxRetries + 1;

    try {
      while (attempts < maxAttempts) {
        attempts += 1;
        try {
          if (operation.type === 'elasticsearch') {
            const result = await esClient.transport.request({
              method: operation.method,
              path: operation.path,
              body: operation.body,
            });
            return { output: { success: true, attempts, result } };
          }

          const kibanaOp = operation;
          const result = await runKibanaOperation({
            kibanaUrl,
            spaceId,
            fakeRequest,
            method: kibanaOp.method,
            path: kibanaOp.path,
            body: kibanaOp.body,
            query: kibanaOp.query,
            headers: kibanaOp.headers,
          });
          return { output: { success: true, attempts, result } };
        } catch (error) {
          lastError = formatError(error);
          const canRetry = isRetryable(error) && attempts < maxAttempts;
          if (!canRetry) {
            return {
              output: {
                success: false,
                attempts,
                error: lastError,
              },
            };
          }
          const delayMs = Math.round(initialDelayMs * Math.pow(backoffMultiplier, attempts - 1));
          await sleep(delayMs, context.abortSignal);
        }
      }

      return {
        output: {
          success: false,
          attempts,
          error: lastError ?? 'Exceeded retry limit',
        },
      };
    } catch (error) {
      context.logger.error(
        i18n.translate('xpack.securitySolution.workflows.steps.retryWithBackoff.errorLog', {
          defaultMessage: 'Retry with backoff step failed',
        }),
        error instanceof Error ? error : new Error(String(error))
      );
      return {
        error: new Error(error instanceof Error ? error.message : 'Retry with backoff step failed'),
      };
    }
  },
});
