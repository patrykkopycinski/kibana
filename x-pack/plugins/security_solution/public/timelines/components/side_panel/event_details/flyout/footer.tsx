/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense, useCallback, useMemo, useState } from 'react';
import type { Criteria } from '@elastic/eui';
import {
  EuiFlyoutFooter,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiText,
  EuiTitle,
  EuiErrorBoundary,
  EuiLoadingSpinner,
  EuiBasicTable,
  EuiButton,
  EuiSpacer,
} from '@elastic/eui';
import { find } from 'lodash/fp';
import { useSelector } from 'react-redux';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useForm, Controller } from 'react-hook-form';
import { ActionConnectorMode, ActionParamsProps } from '@kbn/triggers-actions-ui-plugin/public';
import { isActiveTimeline } from '../../../../../helpers';
import { TakeActionDropdown } from '../../../../../detections/components/take_action_dropdown';
import type { TimelineEventsDetailsItem, User } from '../../../../../../common/search_strategy';
import { useExceptionFlyout } from '../../../../../detections/components/alerts_table/timeline_actions/use_add_exception_flyout';
import { AddExceptionFlyoutWrapper } from '../../../../../detections/components/alerts_table/timeline_actions/alert_context_menu';
import { EventFiltersFlyout } from '../../../../../management/pages/event_filters/view/components/event_filters_flyout';
import { useEventFilterModal } from '../../../../../detections/components/alerts_table/timeline_actions/use_event_filter_modal';
import { getFieldValue } from '../../../../../detections/components/host_isolation/helpers';
import type { Status } from '../../../../../../common/detection_engine/schemas/common/schemas';
import type { inputsModel, State } from '../../../../../common/store';
import { inputsSelectors } from '../../../../../common/store';
import { OsqueryFlyout } from '../../../../../detections/components/osquery/osquery_flyout';
import { useSubAction } from './use_sub_action';
import { useSubActionMutation } from './use_sub_action_mutation';

interface FlyoutFooterProps {
  detailsData: TimelineEventsDetailsItem[] | null;
  detailsEcsData: Ecs | null;
  expandedEvent: {
    eventId: string;
    indexName: string;
    refetch?: () => void;
  };
  handleOnEventClosed: () => void;
  isHostIsolationPanelOpen: boolean;
  isReadOnly?: boolean;
  loadingEventDetails: boolean;
  onAddIsolationStatusClick: (action: 'isolateHost' | 'unisolateHost') => void;
  scopeId: string;
  refetchFlyoutData: () => Promise<void>;
}

interface AddExceptionModalWrapperData {
  alertStatus: Status;
  eventId: string;
  ruleId: string;
  ruleRuleId: string;
  ruleName: string;
}

const connector = {
  actionTypeId: '.sentinelone',
  isPreconfigured: false,
  isDeprecated: false,
  referencedByCount: 0,
  isMissingSecrets: false,
  id: 'e071bf80-0569-11ee-9b17-2169d32fc705',
  name: 'Elastic sandbox',
  config: {
    url: 'https://usea1-partners.sentinelone.net/',
  },
  actionType: 'Sentinel One',
  compatibility: ['Alerting Rules'],
};

const SentinelOneScriptStatus = ({ connectorId, parentTaskId }) => {
  const subActionResults = useSubAction({
    connectorId,
    subAction: 'getRemoteScriptStatus',
    subActionParams: {
      parentTaskId,
    },
  });

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [showPerPageOptions, setShowPerPageOptions] = useState(true);

  const onTableChange = ({ page }: Criteria<User>) => {
    if (page) {
      const { index: pageIndex, size: pageSize } = page;
      setPageIndex(pageIndex);
      setPageSize(pageSize);
    }
  };

  console.error('xxx', subActionResults?.data?.data);

  const pagination = {
    pageIndex,
    pageSize,
    totalItemCount: subActionResults?.data?.data?.pagination?.totalItems ?? 0,
    pageSizeOptions: [10, 0],
    showPerPageOptions,
  };

  const columns = [
    {
      field: 'description',
      name: 'Description',
    },
    {
      field: 'agentComputerName',
      name: 'Target',
    },
    {
      field: 'status',
      name: 'Status',
    },
    {
      field: 'detailedStatus',
      name: 'Detailed Status',
    },
  ];

  return (
    <EuiBasicTable
      tableCaption="Demo for EuiBasicTable with pagination"
      items={subActionResults?.data?.data?.data ?? []}
      columns={columns}
      pagination={pagination}
      onChange={onTableChange}
    />
  );
};

const SentinelFlyout = ({ onClose, ecsData }) => {
  console.error('ecsData', ecsData);
  const kibana = useKibana();

  const actionTypeRegistry = kibana.services.triggersActionsUi.actionTypeRegistry;
  const actionTypeModel = actionTypeRegistry.get(connector.actionTypeId);
  const ParamsFieldsComponent = actionTypeModel.actionParamsFields;
  const [actionParams, setActionParams] = useState({
    subAction: '',
    subActionParams: {
      hostname: ecsData.host?.name?.[0],
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      data: {},
      filter: {
        computerName: ecsData.host?.name?.[0],
      },
    },
  });

  const formValues = watch();

  console.error('formValues', formValues);

  const sendSubAction = useSubActionMutation({
    connectorId: connector.id,
    subAction: actionParams.subAction,
    subActionParams: actionParams.subActionParams,
  });

  const onSubmit = (data) => {
    console.error('onSubmit data', data);
    sendSubAction.mutate();
  };

  const agentData = useSubAction({
    connectorId: connector.id,
    subAction: 'getAgents',
    subActionParams: {
      computerName: ecsData.host?.name?.[0],
    },
    refetchInterval: 5000,
  });

  console.error('agentData', agentData?.data?.data?.data?.[0]);

  const agentStatus = agentData?.data?.data?.data?.[0]?.networkStatus;

  console.error('sendSubAction', sendSubAction);

  return (
    <EuiFlyout onClose={onClose} size="m">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2>A typical flyout</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiText>Agent status: {agentStatus}</EuiText>
        <EuiText>
          <EuiErrorBoundary>
            <Suspense
              fallback={
                <EuiFlexGroup justifyContent="center">
                  <EuiFlexItem grow={false}>
                    <EuiLoadingSpinner size="m" />
                  </EuiFlexItem>
                </EuiFlexGroup>
              }
            >
              <form onSubmit={handleSubmit(onSubmit)}>
                {/* <Controller
                  name="data"
                  control={control}
                  render={(props) => {
                    console.error('props', props);
                    return ( */}
                <ParamsFieldsComponent
                  actionParams={actionParams}
                  index={0}
                  errors={{}}
                  editAction={(field, value) => {
                    console.error('editActions', field, value);
                    let newValue = value?.body ?? value;
                    if (
                      newValue?.contains &&
                      newValue?.contains('<processes-name-templates>') &&
                      ecsData.process?.name?.length
                    ) {
                      newValue = value.replace(
                        '<processes-name-templates>',
                        ecsData.process?.name?.[0]
                      );
                    }
                    console.error('newValue', newValue);
                    setActionParams((prevValue) => ({
                      ...prevValue,
                      [field]: newValue,
                    }));
                    sendSubAction.reset();
                  }}
                  messageVariables={[]}
                  actionConnector={connector}
                  executionMode={ActionConnectorMode.Manual}
                />
                <EuiSpacer />
                <EuiButton
                  type="submit"
                  fill
                  isLoading={
                    sendSubAction.isLoading ||
                    (actionParams.subAction === 'isolateAgent' &&
                      sendSubAction.isSuccess &&
                      agentStatus !== 'disconnected') ||
                    (actionParams.subAction === 'releaseAgent' &&
                      sendSubAction.isSuccess &&
                      agentStatus !== 'connected')
                  }
                >
                  {'Submit'}
                </EuiButton>
              </form>
            </Suspense>
          </EuiErrorBoundary>
        </EuiText>
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

const getGlobalQueries = inputsSelectors.globalQuery();
const getTimelineQuery = inputsSelectors.timelineQueryByIdSelector();

export const FlyoutFooterComponent = React.memo(
  ({
    detailsData,
    detailsEcsData,
    expandedEvent,
    handleOnEventClosed,
    isHostIsolationPanelOpen,
    isReadOnly,
    loadingEventDetails,
    onAddIsolationStatusClick,
    scopeId,
    refetchFlyoutData,
  }: FlyoutFooterProps) => {
    const globalQuery = useSelector(getGlobalQueries);
    const timelineQuery = useSelector<State, ReturnType<typeof getTimelineQuery>>((state) =>
      getTimelineQuery(state, scopeId)
    );

    const alertId = detailsEcsData?.kibana?.alert ? detailsEcsData?._id : null;
    const ruleIndexRaw = useMemo(
      () =>
        find({ category: 'signal', field: 'signal.rule.index' }, detailsData)?.values ??
        find({ category: 'kibana', field: 'kibana.alert.rule.parameters.index' }, detailsData)
          ?.values,
      [detailsData]
    );
    const ruleIndex = useMemo(
      (): string[] | undefined => (Array.isArray(ruleIndexRaw) ? ruleIndexRaw : undefined),
      [ruleIndexRaw]
    );
    const ruleDataViewIdRaw = useMemo(
      () =>
        find({ category: 'signal', field: 'signal.rule.data_view_id' }, detailsData)?.values ??
        find(
          { category: 'kibana', field: 'kibana.alert.rule.parameters.data_view_id' },
          detailsData
        )?.values,
      [detailsData]
    );
    const ruleDataViewId = useMemo(
      (): string | undefined =>
        Array.isArray(ruleDataViewIdRaw) ? ruleDataViewIdRaw[0] : undefined,
      [ruleDataViewIdRaw]
    );

    const addExceptionModalWrapperData = useMemo(
      () =>
        [
          { category: 'signal', field: 'signal.rule.id', name: 'ruleId' },
          { category: 'signal', field: 'signal.rule.rule_id', name: 'ruleRuleId' },
          { category: 'signal', field: 'signal.rule.name', name: 'ruleName' },
          { category: 'signal', field: 'kibana.alert.workflow_status', name: 'alertStatus' },
          { category: '_id', field: '_id', name: 'eventId' },
        ].reduce<AddExceptionModalWrapperData>(
          (acc, curr) => ({
            ...acc,
            [curr.name]: getFieldValue({ category: curr.category, field: curr.field }, detailsData),
          }),
          {} as AddExceptionModalWrapperData
        ),
      [detailsData]
    );

    const refetchQuery = (newQueries: inputsModel.GlobalQuery[]) => {
      newQueries.forEach((q) => q.refetch && (q.refetch as inputsModel.Refetch)());
    };

    const refetchAll = useCallback(() => {
      if (isActiveTimeline(scopeId)) {
        refetchQuery([timelineQuery]);
      } else {
        refetchQuery(globalQuery);
      }
    }, [scopeId, timelineQuery, globalQuery]);

    const {
      exceptionFlyoutType,
      openAddExceptionFlyout,
      onAddExceptionTypeClick,
      onAddExceptionCancel,
      onAddExceptionConfirm,
    } = useExceptionFlyout({
      refetch: refetchAll,
      isActiveTimelines: isActiveTimeline(scopeId),
    });
    const { closeAddEventFilterModal, isAddEventFilterModalOpen, onAddEventFilterClick } =
      useEventFilterModal();

    const [isOsqueryFlyoutOpenWithAgentId, setOsqueryFlyoutOpenWithAgentId] = useState<
      null | string
    >(null);

    const [isSentinelFlyoutOpen, setSentinelFlyoutOpen] = useState<boolean>(false);

    const handleSentinelClick = useCallback(() => setSentinelFlyoutOpen(true), []);

    const handleCloseSentinelFlyout = useCallback(() => setSentinelFlyoutOpen(false), []);

    const closeOsqueryFlyout = useCallback(() => {
      setOsqueryFlyoutOpenWithAgentId(null);
    }, [setOsqueryFlyoutOpenWithAgentId]);

    if (isReadOnly) {
      return null;
    }

    return (
      <>
        <EuiFlyoutFooter data-test-subj="side-panel-flyout-footer">
          <EuiFlexGroup justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              {detailsEcsData && (
                <TakeActionDropdown
                  detailsData={detailsData}
                  ecsData={detailsEcsData}
                  handleOnEventClosed={handleOnEventClosed}
                  isHostIsolationPanelOpen={isHostIsolationPanelOpen}
                  loadingEventDetails={loadingEventDetails}
                  onAddEventFilterClick={onAddEventFilterClick}
                  onAddExceptionTypeClick={onAddExceptionTypeClick}
                  onAddIsolationStatusClick={onAddIsolationStatusClick}
                  refetchFlyoutData={refetchFlyoutData}
                  refetch={refetchAll}
                  indexName={expandedEvent.indexName}
                  scopeId={scopeId}
                  onOsqueryClick={setOsqueryFlyoutOpenWithAgentId}
                  onSentinelClick={handleSentinelClick}
                />
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
        {/* This is still wrong to do render flyout/modal inside of the flyout
        We need to completely refactor the EventDetails  component to be correct
      */}
        {openAddExceptionFlyout &&
          addExceptionModalWrapperData.ruleId != null &&
          addExceptionModalWrapperData.ruleRuleId != null &&
          addExceptionModalWrapperData.eventId != null && (
            <AddExceptionFlyoutWrapper
              {...addExceptionModalWrapperData}
              ruleIndices={ruleIndex}
              ruleDataViewId={ruleDataViewId}
              exceptionListType={exceptionFlyoutType}
              onCancel={onAddExceptionCancel}
              onConfirm={onAddExceptionConfirm}
            />
          )}
        {isAddEventFilterModalOpen && detailsEcsData != null && (
          <EventFiltersFlyout data={detailsEcsData} onCancel={closeAddEventFilterModal} />
        )}
        {isOsqueryFlyoutOpenWithAgentId && detailsEcsData != null && (
          <OsqueryFlyout
            agentId={isOsqueryFlyoutOpenWithAgentId}
            defaultValues={alertId ? { alertIds: [alertId] } : undefined}
            onClose={closeOsqueryFlyout}
            ecsData={detailsEcsData}
          />
        )}
        {isSentinelFlyoutOpen && detailsEcsData != null && (
          <SentinelFlyout ecsData={detailsEcsData} onClose={handleCloseSentinelFlyout} />
        )}
      </>
    );
  }
);

export const FlyoutFooter = React.memo(FlyoutFooterComponent);
