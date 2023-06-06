/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// import yargs from 'yargs-parser';
import { find } from 'lodash';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiHighlight,
} from '@elastic/eui';
import { ActionConnectorMode, ActionParamsProps } from '@kbn/triggers-actions-ui-plugin/public';
import {
  JsonEditorWithMessageVariables,
  useSubAction,
  useKibana,
} from '@kbn/triggers-actions-ui-plugin/public';
import { SUB_ACTION } from '../../../common/sentinelone/constants';
import type {
  SentinelOneScriptObject,
  SentinelOneWebhookObject,
  // SentinelOneWebhooksActionParams,
  SentinelOneScriptsActionResponse,
  // SentinelOneWebhooksActionResponse,
  SentinelOneScriptsActionParams,
} from '../../../common/sentinelone/types';
import type { SentinelOneExecuteActionParams, SentinelOneExecuteSubActionParams } from './types';
import * as i18n from './translations';

type ScriptOption = EuiComboBoxOptionOption<SentinelOneScriptObject>;
type WebhookOption = EuiComboBoxOptionOption<SentinelOneWebhookObject>;

const createOption = <T extends SentinelOneScriptObject | SentinelOneWebhookObject>(
  item: T
): EuiComboBoxOptionOption<T> => ({
  key: item.id.toString(),
  value: item,
  label: item.name,
});

const renderScript = (
  { label, value }: ScriptOption,
  searchValue: string,
  contentClassName: string
) => (
  <EuiFlexGroup className={contentClassName} direction="row" alignItems="center">
    <EuiFlexItem grow={false}>
      <EuiHighlight search={searchValue}>{label}</EuiHighlight>
    </EuiFlexItem>
    {value?.published && (
      <EuiFlexItem grow={false}>
        <EuiBadge color="hollow">{i18n.STORY_PUBLISHED_BADGE_TEXT}</EuiBadge>
      </EuiFlexItem>
    )}
  </EuiFlexGroup>
);

const SentinelOneParamsFields: React.FunctionComponent<
  ActionParamsProps<SentinelOneExecuteActionParams>
> = ({ actionConnector, actionParams, editAction, index, executionMode, errors }) => {
  console.error('actionParams', actionParams);
  const { toasts } = useKibana().notifications;
  const { subAction, subActionParams } = actionParams;
  const { body, webhookUrl } = subActionParams ?? {};

  const [connectorId, setConnectorId] = useState<string | undefined>(actionConnector?.id);
  const [selectedScriptOption, setSelectedScriptOption] = useState<
    ScriptOption | null | undefined
  >();

  const isTest = useMemo(() => executionMode === ActionConnectorMode.Test, [executionMode]);

  useEffect(() => {
    if (!subAction) {
      editAction('subAction', isTest ? SUB_ACTION.TEST : SUB_ACTION.RUN, index);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTest, subAction]);

  if (connectorId !== actionConnector?.id) {
    // Script (and webhook) reset needed before requesting with a different connectorId
    setSelectedScriptOption(null);
    setConnectorId(actionConnector?.id);
  }

  const editSubActionParams = useCallback(
    (params: SentinelOneExecuteSubActionParams) => {
      editAction('subActionParams', { ...subActionParams, ...params }, index);
    },
    [editAction, index, subActionParams]
  );

  const {
    response: { data: remoteScripts } = {},
    isLoading: isLoadingScripts,
    error: scriptsError,
  } = useSubAction<SentinelOneScriptsActionParams, SentinelOneScriptsActionResponse>({
    connectorId,
    subAction: 'getRemoteScripts',
  });

  console.error('remoteScripts', remoteScripts);

  const scriptsOptions = useMemo(
    () =>
      remoteScripts?.map((item) => ({
        key: item.id.toString(),
        id: item.id,
        label: item.scriptName,
      })) ?? [],
    [remoteScripts]
  );

  useEffect(() => {
    if (scriptsError) {
      toasts.danger({ title: i18n.STORIES_ERROR, body: scriptsError.message });
    }
  }, [toasts, scriptsError]);

  // useEffect(() => {
  //   if (selectedScriptOption === undefined && webhook?.scriptId && scripts) {
  //     // Set the initial selected script option from saved scriptId when scripts are loaded
  //     const selectedScript = remoteScripts.find(({ id }) => id === webhook.scriptId);
  //     if (selectedScript) {
  //       setSelectedScriptOption(createOption(selectedScript));
  //     } else {
  //       toasts.warning({ title: i18n.STORY_NOT_FOUND_WARNING });
  //       editSubActionParams({ webhook: undefined });
  //     }
  //   }
  // }, [selectedScriptOption, webhook?.scriptId, remoteScripts, toasts, editSubActionParams]);

  const selectedScriptOptions = useMemo(
    () => (selectedScriptOption ? [selectedScriptOption] : []),
    [selectedScriptOption]
  );

  const selectedScriptArguments = useMemo(
    () => {
      const instructions = find(remoteScripts, { id: selectedScriptOption?.id })?.inputInstructions;

      // const args =
    },
    // () => yargs(find(remoteScripts, { id: selectedScriptOption?.id }?.inputInstructions).argv),
    [remoteScripts, selectedScriptOption?.id]
  );

  const onChangeScript = useCallback(([selected]: ScriptOption[]) => {
    setSelectedScriptOption(selected ?? null);
  }, []);

  // console.error(
  //   'selectedScriptOption',
  //   selectedScriptOption,
  //   find(remoteScripts, { id: selectedScriptOption?.id }),
  //   selectedScriptArguments
  // );

  return (
    <EuiFlexGroup direction="column">
      <EuiFlexItem>
        <EuiFormRow
          fullWidth
          error={errors.script}
          isInvalid={!!errors.script?.length && selectedScriptOption !== undefined}
          label={i18n.STORY_LABEL}
          helpText={i18n.STORY_HELP}
        >
          <EuiComboBox
            aria-label={i18n.STORY_PLACEHOLDER}
            placeholder={
              webhookUrl ? i18n.DISABLED_BY_WEBHOOK_URL_PLACEHOLDER : i18n.STORY_ARIA_LABEL
            }
            singleSelection={{ asPlainText: true }}
            options={scriptsOptions}
            selectedOptions={selectedScriptOptions}
            onChange={onChangeScript}
            isDisabled={isLoadingScripts || !!webhookUrl}
            isLoading={isLoadingScripts}
            renderOption={renderScript}
            fullWidth
            data-test-subj="sentinelone-scriptSelector"
          />
        </EuiFormRow>
      </EuiFlexItem>

      {isTest && (
        <EuiFlexItem>
          <JsonEditorWithMessageVariables
            paramsProperty={'body'}
            inputTargetValue={body}
            label={i18n.BODY_LABEL}
            aria-label={i18n.BODY_ARIA_LABEL}
            errors={errors.body as string[]}
            onDocumentsChange={(json: string) => {
              editSubActionParams({ body: json });
            }}
            onBlur={() => {
              if (!body) {
                editSubActionParams({ body: '' });
              }
            }}
            data-test-subj="sentinelone-bodyJsonEditor"
          />
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};

// eslint-disable-next-line import/no-default-export
export { SentinelOneParamsFields as default };
