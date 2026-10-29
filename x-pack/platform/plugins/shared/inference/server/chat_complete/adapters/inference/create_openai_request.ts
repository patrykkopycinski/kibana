/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { wrapWithSimulatedFunctionCalling } from '../../simulated_function_calling';
import { InferenceEndpointProvider } from '@kbn/inference-common';
import type { InferenceEndpointRequest } from '../inference_endpoint/types';
import { messagesToOpenAI, toolChoiceToOpenAI, toolsToOpenAI } from '../openai';
import type { CreateOpenAIRequestOptions } from './types';
import { applyProviderTransforms } from './providers';
import { getTemperatureIfValid } from '../../utils/get_temperature';
import { resolveChatCompletionReasoning } from '../../utils/resolve_chat_completion_reasoning';
import { getModelId, getProvider } from './utils';

export const createRequest = (options: CreateOpenAIRequestOptions): InferenceEndpointRequest => {
  const {
    system,
    messages,
    toolChoice,
    tools,
    simulatedFunctionCalling,
    temperature = 0,
    modelName,
    reasoning,
    cacheControl,
    sessionId,
  } = applyProviderTransforms(options);

  // Preconfigured EIS connectors carry no model_id, so fall back to the inference endpoint id.
  const model = modelName ?? getModelId(options.connector) ?? options.connector.config?.inferenceId;

  // Prompt caching is an EIS feature: other providers reject unknown body fields.
  const eisFields: Pick<InferenceEndpointRequest, 'cache_control' | 'session_id'> = {};
  if (getProvider(options.connector) === InferenceEndpointProvider.Elastic) {
    if (cacheControl !== undefined) {
      eisFields.cache_control = cacheControl;
    }
    if (sessionId !== undefined) {
      eisFields.session_id = sessionId;
    }
  }

  let request: InferenceEndpointRequest;
  if (simulatedFunctionCalling) {
    const wrapped = wrapWithSimulatedFunctionCalling({
      system,
      messages,
      toolChoice,
      tools,
    });
    const resolvedReasoning = resolveChatCompletionReasoning({
      reasoning,
      hasNativeTools: false,
      model,
    });
    request = {
      ...getTemperatureIfValid(temperature, { connector: options.connector, modelName }),
      ...eisFields,
      model: modelName,
      messages: messagesToOpenAI({ system: wrapped.system, messages: wrapped.messages }),
      ...(resolvedReasoning ? { reasoning: resolvedReasoning } : {}),
    };
  } else {
    const openAiTools = toolsToOpenAI(tools);
    const hasTools = Array.isArray(openAiTools) && openAiTools.length > 0;
    const resolvedReasoning = resolveChatCompletionReasoning({
      reasoning,
      hasNativeTools: hasTools,
      model,
    });

    request = {
      ...getTemperatureIfValid(temperature, { connector: options.connector, modelName }),
      ...eisFields,
      model: modelName,
      messages: messagesToOpenAI({ system, messages }),
      ...(hasTools
        ? {
            tool_choice: toolChoiceToOpenAI(toolChoice),
            tools: openAiTools,
          }
        : {}),
      ...(resolvedReasoning ? { reasoning: resolvedReasoning } : {}),
    };
  }

  return request;
};
