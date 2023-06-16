/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { pick } from 'lodash';
import React, { useCallback, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  EuiBadge,
  EuiButtonIcon,
  EuiComboBoxOptionOption,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiHighlight,
  EuiInMemoryTable,
  EuiScreenReaderOnly,
  EuiSuperSelect,
} from '@elastic/eui';
import {
  ActionConnectorMode,
  ActionParamsProps,
  TextAreaWithMessageVariables,
} from '@kbn/triggers-actions-ui-plugin/public';
import { useSubAction, useKibana } from '@kbn/triggers-actions-ui-plugin/public';
import { Random, EuiBasicTableColumn, EuiSearchBarProps, EuiLink } from '@elastic/eui';
import { SUB_ACTION } from '../../../common/sentinelone/constants';
import type {
  SentinelOneScriptObject,
  // SentinelOneWebhooksActionParams,
  SentinelOneScriptsActionResponse,
  // SentinelOneWebhooksActionResponse,
  SentinelOneScriptsActionParams,
} from '../../../common/sentinelone/types';
import type { SentinelOneExecuteActionParams, SentinelOneExecuteSubActionParams } from './types';
import * as i18n from './translations';

type ScriptOption = EuiComboBoxOptionOption<SentinelOneScriptObject>;

interface User {
  id: number;
  firstName: string | null | undefined;
  lastName: string;
  github: string;
  dateOfBirth: Date;
  online: boolean;
  location: {
    city: string;
    country: string;
  };
}

const random = new Random();

const noItemsFoundMsg = 'No users match search criteria';

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
> = ({ actionConnector, actionParams, editAction, index, executionMode, errors, ...rest }) => {
  console.error('actionParams', actionParams);
  const { toasts } = useKibana().notifications;
  const { subAction, subActionParams } = actionParams;
  const [selected, setSelected] = useState<User | undefined>();

  const [connectorId, setConnectorId] = useState<string | undefined>(actionConnector?.id);

  const isTest = useMemo(() => executionMode === ActionConnectorMode.Test, [executionMode]);

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

  useEffect(() => {
    if (scriptsError) {
      toasts.danger({ title: i18n.STORIES_ERROR, body: scriptsError.message });
    }
  }, [toasts, scriptsError]);

  const pagination = {
    initialPageSize: 10,
    pageSizeOptions: [10, 20, 50],
  };

  const search: EuiSearchBarProps = {
    defaultQuery: 'scriptType:action',
    box: {
      incremental: true,
    },
    filters: [
      {
        type: 'field_value_selection',
        field: 'scriptType',
        name: 'Script type',
        multiSelect: true,
        options: [
          {
            value: 'action',
          },
          { value: 'dataCollection' },
        ],
      },
      {
        type: 'field_value_selection',
        field: 'location',
        name: 'Location',
        multiSelect: false,
        options: [
          {
            value: 'Windows',
          },
          {
            value: 'macos',
          },
          {
            value: 'linux',
          },
        ],
      },
    ],
  };

  const [itemIdToExpandedRowMap, setItemIdToExpandedRowMap] = useState<Record<string, ReactNode>>(
    {}
  );

  const toggleDetails = (user: User) => {
    const itemIdToExpandedRowMapValues = { ...itemIdToExpandedRowMap };

    if (itemIdToExpandedRowMapValues[user.id]) {
      delete itemIdToExpandedRowMapValues[user.id];
    } else {
      itemIdToExpandedRowMapValues[user.id] = <>More details true</>;
    }
    setItemIdToExpandedRowMap(itemIdToExpandedRowMapValues);
  };

  const columns: Array<EuiBasicTableColumn<User>> = [
    {
      field: 'scriptName',
      name: 'Script name',
    },
    {
      field: 'scriptType',
      name: 'Script type',
    },
    {
      field: 'osTypes',
      name: 'OS types',
    },
    {
      actions: [
        {
          name: 'Choose',
          description: 'Choose this script',
          isPrimary: true,
          onClick: (item) => {
            console.error('item', item);
            setSelected(item);
            editAction(
              'subActionParams.script',
              {
                scriptId: item.id,
                scriptRuntimeTimeoutSeconds: 3600,
                taskDescription: item.scriptName,
                requiresApproval: item.requiresApproval ?? false,
              },
              index
            );
          },
        },
      ],
    },
    {
      align: 'right',
      width: '40px',
      isExpander: true,
      name: (
        <EuiScreenReaderOnly>
          <span>Expand rows</span>
        </EuiScreenReaderOnly>
      ),
      render: (user: User) => {
        const itemIdToExpandedRowMapValues = { ...itemIdToExpandedRowMap };

        return (
          <EuiButtonIcon
            onClick={() => toggleDetails(user)}
            aria-label={itemIdToExpandedRowMapValues[user.id] ? 'Collapse' : 'Expand'}
            iconType={itemIdToExpandedRowMapValues[user.id] ? 'arrowDown' : 'arrowRight'}
          />
        );
      },
    },
  ];

  const actionTypeOptions = [
    {
      value: 'killProcess',
      inputDisplay: 'Kill process',
    },
    {
      value: 'isolateAgent',
      inputDisplay: 'Isolate agent',
    },
    {
      value: 'releaseAgent',
      inputDisplay: 'Release agent',
    },
    {
      value: 'getFile',
      inputDisplay: 'Get file',
      disabled: true,
    },
    {
      value: 'executeScript',
      inputDisplay: 'Execute script',
    },
  ];

  return (
    <EuiFlexGroup direction="column">
      <EuiFlexItem>
        <EuiFormRow fullWidth label="Action type">
          <EuiSuperSelect
            fullWidth
            options={actionTypeOptions}
            valueOfSelected={subAction}
            onChange={(value) => editAction('subAction', value, index)}
          />
        </EuiFormRow>
      </EuiFlexItem>
      {subAction === 'executeScript' && (
        <>
          <EuiFlexItem>
            <EuiFormRow
              fullWidth
              error={errors.script}
              isInvalid={!!errors.script?.length}
              label={'Script'}
              labelAppend={
                selected ? (
                  <EuiLink onClick={() => setSelected(undefined)}>Change action</EuiLink>
                ) : null
              }
            >
              {selected ? (
                <EuiFieldText fullWidth value={selected.scriptName} />
              ) : (
                <EuiInMemoryTable
                  items={remoteScripts ?? []}
                  itemId="id"
                  loading={isLoadingScripts}
                  // message={message}
                  columns={columns}
                  search={search}
                  pagination={pagination}
                  sorting
                  hasActions
                  itemIdToExpandedRowMap={itemIdToExpandedRowMap}
                />
              )}
            </EuiFormRow>
          </EuiFlexItem>

          <>
            {selected && (
              <EuiFlexItem>
                <TextAreaWithMessageVariables
                  index={index}
                  editAction={editAction}
                  messageVariables={[]}
                  paramsProperty={'subActionParams.script.inputParams'}
                  label={'Command'}
                  inputTargetValue={subActionParams?.script?.inputParams ?? undefined}
                  helpText={
                    selected?.inputExample ? `Example: ${selected?.inputExample}` : undefined
                  }
                />
              </EuiFlexItem>
            )}
          </>
        </>
      )}
    </EuiFlexGroup>
  );
};

// eslint-disable-next-line import/no-default-export
export { SentinelOneParamsFields as default };
