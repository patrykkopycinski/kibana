/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { lazy } from 'react';
import { i18n } from '@kbn/i18n';
import type {
  ActionTypeModel as ConnectorTypeModel,
  GenericValidationResult,
} from '@kbn/triggers-actions-ui-plugin/public';
import { SENTINELONE_CONNECTOR_ID, SENTINELONE_TITLE } from '../../../common/sentinelone/constants';
import type { SentinelOneConfig, SentinelOneSecrets } from '../../../common/sentinelone/types';
import type { SentinelOneExecuteActionParams } from './types';

interface ValidationErrors {
  subAction: string[];
  story: string[];
  webhook: string[];
  webhookUrl: string[];
  body: string[];
}

export function getConnectorType(): ConnectorTypeModel<
  SentinelOneConfig,
  SentinelOneSecrets,
  SentinelOneExecuteActionParams
> {
  return {
    id: SENTINELONE_CONNECTOR_ID,
    actionTypeTitle: SENTINELONE_TITLE,
    iconClass: lazy(() => import('./logo')),
    selectMessage: i18n.translate(
      'xpack.stackConnectors.security.sentinelone.config.selectMessageText',
      {
        defaultMessage: 'Execute SentinelOne scripts',
      }
    ),
    validateParams: async (
      actionParams: SentinelOneExecuteActionParams
    ): Promise<GenericValidationResult<ValidationErrors>> => {
      return { errors: {} };
      // const translations = await import('./translations');
      // const errors: ValidationErrors = {
      //   subAction: [],
      //   story: [],
      //   webhook: [],
      //   webhookUrl: [],
      //   body: [],
      // };
      // const { subAction, subActionParams } = actionParams;

      // if (subActionParams?.webhookUrl) {
      //   try {
      //     const parsedUrl = new URL(subActionParams.webhookUrl);
      //     if (parsedUrl.protocol !== 'https:') {
      //       errors.webhookUrl.push(translations.INVALID_PROTOCOL_WEBHOOK_URL);
      //     }
      //   } catch (err) {
      //     errors.webhookUrl.push(translations.INVALID_WEBHOOK_URL);
      //   }
      // } else {
      //   if (!subActionParams?.webhook?.storyId) {
      //     errors.story.push(translations.STORY_REQUIRED);
      //   } else {
      //     if (!subActionParams?.webhook?.id) {
      //       errors.webhook.push(translations.WEBHOOK_REQUIRED);
      //     } else if (!subActionParams?.webhook?.path) {
      //       errors.webhook.push(translations.WEBHOOK_PATH_REQUIRED);
      //     } else if (!subActionParams?.webhook?.secret) {
      //       errors.webhook.push(translations.WEBHOOK_SECRET_REQUIRED);
      //     }
      //   }
      // }

      // if (subAction === SUB_ACTION.TEST) {
      //   if (!subActionParams?.body?.length) {
      //     errors.body.push(translations.BODY_REQUIRED);
      //   } else {
      //     try {
      //       JSON.parse(subActionParams.body);
      //     } catch {
      //       errors.body.push(translations.BODY_INVALID);
      //     }
      //   }
      // }

      // if (errors.story.length || errors.webhook.length || errors.body.length) return { errors };

      // // The internal "subAction" param should always be valid, ensure it is only if "subActionParams" are valid
      // if (!subAction) {
      //   errors.subAction.push(translations.ACTION_REQUIRED);
      // } else if (subAction !== SUB_ACTION.RUN && subAction !== SUB_ACTION.TEST) {
      //   errors.subAction.push(translations.INVALID_ACTION);
      // }
      // return { errors };
    },
    actionConnectorFields: lazy(() => import('./sentinelone_connector')),
    actionParamsFields: lazy(() => import('./sentinelone_params')),
  };
}
