/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { find } from 'lodash/fp';
import React, { Fragment, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiBasicTableProps,
  EuiTableSelectionType,
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiModalBody,
  EuiModalFooter,
  EuiOverlayMask,
  EuiSelectable,
  EuiSelectableOption,
  EuiButton,
  EuiButtonEmpty,
  EuiHealth,
} from '@elastic/eui';

import { useAllAgents } from './use_all_agents';
import { useAgentGroups, ALL_AGENTS_GROUP_KEY } from './use_agent_groups';
import { Direction } from '../../common/search_strategy';
import { Agent } from '../../common/shared_imports';

interface AgentsTableProps {
  selectedAgents: string[];
  onChange: (payload: string[]) => void;
}

type GroupOption = EuiSelectableOption<{}>;

const AgentsTableComponent: React.FC<AgentsTableProps> = ({ selectedAgents, onChange }) => {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [sortField, setSortField] = useState<keyof Agent>('upgraded_at');
  const [sortDirection, setSortDirection] = useState<Direction>(Direction.asc);
  const [selectedItems, setSelectedItems] = useState([]);
  const tableRef = useRef<EuiBasicTable<Agent>>(null);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const closeModal = useCallback(() => setIsModalVisible(false), [setIsModalVisible]);
  const showModal = useCallback(() => setIsModalVisible(true), [setIsModalVisible]);

  const onTableChange: EuiBasicTableProps<Agent>['onChange'] = useCallback(
    ({ page = {}, sort = {} }) => {
      const { index: newPageIndex, size: newPageSize } = page;

      const { field: newSortField, direction: newSortDirection } = sort;

      setPageIndex(newPageIndex);
      setPageSize(newPageSize);
      setSortField(newSortField);
      setSortDirection(newSortDirection);
    },
    []
  );

  const renderStatus = (online: string) => {
    const color = online ? 'success' : 'danger';
    const label = online ? 'Online' : 'Offline';
    return <EuiHealth color={color}>{label}</EuiHealth>;
  };

  const { loading: groupsLoading, groups } = useAgentGroups();
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [allAgentsSelected, setAllAgentsSelected] = useState<boolean>(false);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  useEffect(() => {
    const opts: GroupOption[] = [{ label: ALL_AGENTS_GROUP_KEY }];
    if (!allAgentsSelected) {
      const selectedSet = new Set<string|undefined>(selectedGroups);
      const generateOption = (name: string) => {
        const platformOption: GroupOption = { label: name };
        if (selectedSet.has(name)) {
          platformOption.checked = 'on';
        }
        return platformOption;
      }
      const platformOptions = groups.platforms.map(generateOption);
      opts.push(...platformOptions);
      const policyOptions = groups.policies.map(generateOption);
      opts.push(...policyOptions);
    } else {
      opts[0].checked = 'on';
    }
    setGroupOptions(opts);
    // TODO: implement policy picking
  }, [groups.policies, groups.platforms, selectedGroups]);

  const onGroupChange = useCallback((newOptions: GroupOption[]) => {
    const selected = newOptions.filter(el => el.checked === 'on').map(el => el.label)
    setSelectedGroups(selected)
    setAllAgentsSelected(selected.some(el => el === ALL_AGENTS_GROUP_KEY))
    onChange([])
  }, [onChange]);

  const { data = {} } = useAllAgents({
    activePage: pageIndex,
    limit: pageSize,
    direction: sortDirection,
    sortField,
  });

  const onSelectionChange: EuiTableSelectionType<{}>['onSelectionChange'] = useCallback(
    (newSelectedItems) => {
      setSelectedItems(newSelectedItems);
      onChange(newSelectedItems.map((item: {_id: string}) => item._id));
    },
    [onChange]
  );

  const columns: Array<EuiBasicTableColumn<{}>> = useMemo(
    () => [
      {
        field: 'local_metadata.elastic.agent.id',
        name: 'id',
        sortable: true,
        truncateText: true,
      },
      {
        field: 'local_metadata.os.family',
        name: 'platform',
        sortable: true,
        truncateText: true,
      },
      {
        field: 'local_metadata.host.name',
        name: 'hostname',
        truncateText: true,
      },

      {
        field: 'active',
        name: 'Online',
        dataType: 'boolean',
        render: (active: string) => renderStatus(active),
      },
    ],
    []
  );
  const searchProps = useMemo(
    () => ({
      'data-test-subj': 'selectableSearchHere',
    }),
    []
  );

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
      // @ts-expect-error update types
      totalItemCount: data.totalCount ?? 0,
      pageSizeOptions: [3, 5, 8],
    }),
    // @ts-expect-error update types
    [pageIndex, pageSize, data.totalCount]
  );

  const sorting = useMemo(
    () => ({
      sort: {
        field: sortField,
        direction: sortDirection,
      },
    }),
    [sortDirection, sortField]
  );

  const selection: EuiBasicTableProps<Agent>['selection'] = useMemo(
    () => ({
      selectable: (agent: Agent) => agent.active,
      selectableMessage: (selectable: boolean) => (!selectable ? 'User is currently offline' : ''),
      onSelectionChange,
      initialSelected: selectedItems,
    }),
    [onSelectionChange, selectedItems]
  );

  useEffect(() => {
    if (
      selectedAgents?.length &&
      // @ts-expect-error update types
      data.agents?.length &&
      selectedItems.length !== selectedAgents.length
    ) {
      tableRef?.current?.setSelection(
        // @ts-expect-error update types
        selectedAgents.map((agentId) => find({ _id: agentId }, data.agents))
      );
    }
    // @ts-expect-error update types
  }, [selectedAgents, data.agents, selectedItems.length]);

  // const onGroupChange = useCallback(
  //  (newOptions) => {
  //    const currentSelectedSet = new Set(selectedItems);
  //    for (let i = 0; i < platformOptions.length; ++i) {
  //      const newOp = newOptions[i];
  //      const oldOp = platformOptions[i];
  //      if (newOp.checked !== oldOp.checked) {
  //        const newAgents = platforms[newOp.label];
  //        const newAgentSet = new Set(newAgents);
  //        if (newOp.checked === 'on') {
  //          const agentDiff = newAgents.filter((a) => !currentSelectedSet.has(a));
  //          selectedItems.push(...agentDiff);
  //          tableRef.current.setSelection(selectedItems);
  //        } else {
  //          const newSelection = selectedItems.filter((a) => !newAgentSet.has(a));
  //          tableRef.current.setSelection(newSelection);
  //        }
  //        break;
  //      }
  //    }
  //    setPlatformOptions(newOptions);
  //  },
  //  [selectedItems, platformOptions, platforms]
  // );

  let modal;

  if (isModalVisible) {
    modal = (
      <EuiOverlayMask>
        <EuiModal onClose={closeModal} initialFocus="[name=popswitch]">
          <EuiModalHeader>
            <EuiModalHeaderTitle>Select Agents</EuiModalHeaderTitle>
          </EuiModalHeader>

          <EuiModalBody>
            {groupsLoading 
              ? null
              : <EuiSelectable
                aria-label="Searchable example"
                searchable
                searchProps={searchProps}
                options={groupOptions}
                onChange={onGroupChange}
              >
                {(list, search) => (
                  <Fragment>
                    {search}
                    {list}
                  </Fragment>
                )}
              </EuiSelectable>
            }
            {allAgentsSelected || selectedGroups?.length ? null : (
              <EuiBasicTable<Agent>
                ref={tableRef}
                // @ts-expect-error update types
                // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
                items={data.agents ?? []}
                itemId="_id"
                columns={columns}
                pagination={pagination}
                sorting={sorting}
                isSelectable={true}
                selection={selection}
                onChange={onTableChange}
                rowHeader="firstName"
              />
            )}
          </EuiModalBody>

          <EuiModalFooter>
            <EuiButtonEmpty onClick={closeModal}>Cancel</EuiButtonEmpty>

            <EuiButton onClick={closeModal} fill>
              Save
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      </EuiOverlayMask>
    );
  }

  let buttonText;
  if (allAgentsSelected) {
    buttonText = 'All Agents Selected';
  } else if (selectedGroups.length) {
    const numGroups = selectedGroups.length;
    buttonText = `${numGroups} Agent Group${numGroups > 1 ? 's' : ''} Selected`;
  } else if (selectedAgents.length > 0) {
    const numAgents = selectedAgents.length;
    buttonText = `${numAgents} Agent${numAgents > 1 ? 's' : ''} Selected`;
  } else {
    buttonText = 'Select Agents';
  }

  return (
    <div>
      <EuiButton onClick={showModal}>{buttonText}</EuiButton>
      {modal}
    </div>
  );
};

export const AgentsTable = React.memo(AgentsTableComponent);
