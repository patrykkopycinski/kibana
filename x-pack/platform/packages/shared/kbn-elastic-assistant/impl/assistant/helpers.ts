/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Replacements } from '@kbn/elastic-assistant-common';
import {
  removeContentReferences,
  replaceAnonymizedValuesWithOriginalValues,
} from '@kbn/elastic-assistant-common';
import type { SettingsStart } from '@kbn/core-ui-settings-browser';
import { GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR } from '@kbn/management-settings-ids';
import type { AIConnector } from '../connectorland/connector_selector';
import type { FetchConnectorExecuteResponse } from './api';
import type { ClientMessage } from '../assistant_context/types';
import { OpenAiProviderType } from '../connectorland/helpers';

export const getMessageFromRawResponse = (
  rawResponse: FetchConnectorExecuteResponse
): ClientMessage => {
  const { response, isStream, isError } = rawResponse;
  const dateTimeString = new Date().toISOString(); // TODO: Pull from response
  if (rawResponse) {
    return {
      role: 'assistant',
      ...(isStream
        ? { reader: response as ReadableStreamDefaultReader<Uint8Array> }
        : { content: response as string }),
      timestamp: dateTimeString,
      isError,
      traceData: rawResponse.traceData,
      metadata: rawResponse.metadata,
    };
  } else {
    return {
      role: 'assistant',
      content: 'Error: Response from LLM API is empty or undefined.',
      timestamp: dateTimeString,
      isError: true,
    };
  }
};

const ELASTIC_LLM_CONNECTOR_IDS = ['Elastic-Managed-LLM', 'Anthropic-Claude-Sonnet-3-7'];

/**
 * Returns a default connector if there is only one connector
 * @param connectors
 */
export const getDefaultConnector = (
  connectors: AIConnector[] | undefined,
  settings: SettingsStart
): AIConnector | undefined => {
  const defaultAiConnectorId = settings.client.get<string>(
    GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR,
    undefined
  );

  const validConnectors = connectors?.filter((connector) => !connector.isMissingSecrets);
  const defaultConnector = validConnectors?.find(
    (connector) => connector.id === defaultAiConnectorId
  );

  if (defaultConnector) {
    // If the user has set a default connector setting, and that connector exists, use it
    return defaultConnector;
  }

  if (validConnectors?.length) {
    // In case the default connector is not set or is invalid, return the prioritized connector
    const prioritizedConnectors = [...validConnectors].sort((a, b) => {
      const priority = (connector: (typeof validConnectors)[number]) => {
        if (ELASTIC_LLM_CONNECTOR_IDS.includes(connector.id)) return 0;
        if (
          connector.apiProvider === OpenAiProviderType.OpenAi ||
          connector.apiProvider === OpenAiProviderType.AzureAi
        ) {
          return 1;
        }
        return 2;
      };

      return priority(a) - priority(b);
    });

    return prioritizedConnectors[0];
  }

  // If no valid connectors are available, return undefined
  return undefined;
};

interface OptionalRequestParams {
  alertsIndexPattern?: string;
  size?: number;
}

export const getOptionalRequestParams = ({
  alertsIndexPattern,
  size,
}: {
  alertsIndexPattern?: string;
  size?: number;
}): OptionalRequestParams => {
  const optionalAlertsIndexPattern = alertsIndexPattern ? { alertsIndexPattern } : undefined;
  const optionalSize = size ? { size } : undefined;

  return {
    ...optionalAlertsIndexPattern,
    ...optionalSize,
  };
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Plain text of the latest reply, as the user sees it, for screen reader announcements.
 * Returns undefined while the last message is not a finished assistant reply (e.g. it is
 * the user's prompt or a reply that is still streaming), so an earlier turn is never announced.
 */
export const getLastReplyText = ({
  messages,
  replacements,
  showAnonymizedValues,
}: {
  messages: ClientMessage[];
  replacements: Replacements | null | undefined;
  showAnonymizedValues: boolean;
}): string | undefined => {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role !== 'assistant' || !lastMessage.content) {
    return undefined;
  }
  const content = removeContentReferences(lastMessage.content).trim();
  return showAnonymizedValues
    ? content
    : replaceAnonymizedValuesWithOriginalValues({ messageContent: content, replacements });
};
