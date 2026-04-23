/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { InferenceConnector } from '@kbn/inference-common';
import { InferenceConnectorType } from '@kbn/inference-common';

const OPENAI_MODELS_WITHOUT_TEMPERATURE = ['o1', 'o3', 'gpt-5'];

// Anthropic Claude models that reject the `temperature` parameter (4.6+
// extended-thinking / reasoning variants).
// Matches on any segment containing these substrings so that provider-prefixed names like
// `us.anthropic.claude-opus-4-7` or `claude-opus-4-7-thinking` are handled.
// Keep this list in sync with
// `x-pack/platform/plugins/shared/stack_connectors/server/connector_types/bedrock/utils.ts`.
const ANTHROPIC_MODELS_WITHOUT_TEMPERATURE = [
  'opus-4-6',
  'opus-4-7',
  'opus-4-8',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-4-6',
  'claude-4-7',
  'claude-4-8',
];

export const getTemperatureIfValid = (
  temperature?: number,
  { connector, modelName }: { connector?: InferenceConnector; modelName?: string } = {}
) => {
  // Escape hatch: if user sets temperature in the connector config, use it by default (including 0).
  // This should take priority over any automatic model-based exclusions.
  const connectorTemperature = connector?.config?.temperature;
  if (
    typeof connectorTemperature === 'number' &&
    isFinite(connectorTemperature) &&
    connectorTemperature >= 0
  ) {
    return { temperature: connectorTemperature };
  }

  const model =
    modelName ?? connector?.config?.providerConfig?.model_id ?? connector?.config?.defaultModel;

  if (
    (connector?.type === InferenceConnectorType.OpenAI ||
      connector?.type === InferenceConnectorType.Inference) &&
    model
  ) {
    const normalizedModelName = model.toLowerCase();
    // Model names may include provider prefixes like `openai/gpt-5` or `llm-gateway/gpt-5.2-chat`.
    // Temperature support is determined by the base model name (segment after the last `/`).
    const baseModelName = normalizedModelName.split('/').pop() ?? normalizedModelName;

    const shouldExcludeTemperature = OPENAI_MODELS_WITHOUT_TEMPERATURE.some(
      // e.g `openai/gpt-5` or `gpt-5-xxx` or `llm-gateway/gpt-5.2-chat`
      (m) => baseModelName.startsWith(m) || baseModelName.endsWith(m)
    );
    if (shouldExcludeTemperature) {
      // Some models reject non-default temperature values (or reject the param entirely). Let the
      // provider default apply by omitting the parameter.
      return {};
    }
  }

  // Anthropic Claude models delivered via Bedrock or Inference-gateway ("opus-4-7" and newer) reject
  // `temperature`. Match on substring because names may be prefixed (e.g. `us.anthropic.claude-opus-4-7`).
  if (
    (connector?.type === InferenceConnectorType.Bedrock ||
      connector?.type === InferenceConnectorType.Inference) &&
    model
  ) {
    const normalizedModel = model.toLowerCase();
    if (ANTHROPIC_MODELS_WITHOUT_TEMPERATURE.some((m) => normalizedModel.includes(m))) {
      return {};
    }
  }

  if (temperature === undefined || temperature < 0) return {};

  // Else, use the temperature from the request
  return { temperature };
};
