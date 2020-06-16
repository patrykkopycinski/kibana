/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import deepEqual from 'fast-deep-equal';

import { networkActions, networkModel, networkSelectors } from '../../store';
import {
  Direction,
  NetworkDnsEdges,
  NetworkDnsFields,
  NetworkDnsSortField,
} from '../../../graphql/types';
import { State } from '../../../common/store';
import { Criteria, ItemsPerRow, PaginatedTable } from '../../../common/components/paginated_table';

import { getNetworkDnsColumns } from './columns';
import { IsPtrIncluded } from './is_ptr_included';
import * as i18n from './translations';

const tableType = networkModel.NetworkTableType.dns;

interface OwnProps {
  data: NetworkDnsEdges[];
  fakeTotalCount: number;
  id: string;
  isInspect: boolean;
  loading: boolean;
  loadPage: (newActivePage: number) => void;
  showMorePagesIndicator: boolean;
  totalCount: number;
  type: networkModel.NetworkType;
}

type NetworkDnsTableProps = OwnProps & PropsFromRedux;

const rowItems: ItemsPerRow[] = [
  {
    text: i18n.ROWS_5,
    numberOfRow: 5,
  },
  {
    text: i18n.ROWS_10,
    numberOfRow: 10,
  },
];

export const NetworkDnsTableComponent = React.memo<NetworkDnsTableProps>(
  ({
    activePage,
    data,
    fakeTotalCount,
    id,
    isInspect,
    isPtrIncluded,
    limit,
    loading,
    loadPage,
    showMorePagesIndicator,
    sort,
    totalCount,
    type,
    updateNetworkTable,
  }) => {
    const dispatch = useDispatch();
    const stateProps = useSelector(networkSelectors.dnsSelector);

    const updateLimitPagination = useCallback(
      (newLimit) =>
        dispatch(
          networkActions.updateNetworkTable({
            networkType: type,
            tableType,
            updates: { limit: newLimit },
          })
        ),
      [dispatch, type]
    );

    const updateActivePage = useCallback(
      (newPage) =>
        dispatch(
          networkActions.updateNetworkTable({
            networkType: type,
            tableType,
            updates: { activePage: newPage },
          })
        ),
      [dispatch, type]
    );

    const onChange = useCallback(
      (criteria: Criteria) => {
        if (criteria.sort != null) {
          const newDnsSortField: NetworkDnsSortField = {
            field: criteria.sort.field.split('.')[1] as NetworkDnsFields,
            direction: criteria.sort.direction as Direction,
          };
          if (!deepEqual(newDnsSortField, sort)) {
            dispatch(
              networkActions.updateNetworkTable({
                networkType: type,
                tableType,
                updates: { sort: newDnsSortField },
              })
            );
          }
        }
      },
      [dispatch, sort, type]
    );

    const onChangePtrIncluded = useCallback(
      () =>
        dispatch(
          networkActions.updateNetworkTable({
            networkType: type,
            tableType,
            updates: { isPtrIncluded: !isPtrIncluded },
          })
        ),
      [dispatch, type, isPtrIncluded]
    );

    const columns = useMemo(() => getNetworkDnsColumns(), []);

    return (
      <PaginatedTable
        activePage={activePage}
        columns={columns}
        dataTestSubj={`table-${tableType}`}
        headerCount={totalCount}
        headerSupplement={
          <IsPtrIncluded isPtrIncluded={isPtrIncluded} onChange={onChangePtrIncluded} />
        }
        headerTitle={i18n.TOP_DNS_DOMAINS}
        headerTooltip={i18n.TOOLTIP}
        headerUnit={i18n.UNIT(totalCount)}
        id={id}
        itemsPerRow={rowItems}
        isInspect={isInspect}
        limit={limit}
        loading={loading}
        loadPage={loadPage}
        onChange={onChange}
        pageOfItems={data}
        showMorePagesIndicator={showMorePagesIndicator}
        sorting={{
          field: `node.${sort.field}`,
          direction: sort.direction,
        }}
        totalCount={fakeTotalCount}
        updateActivePage={updateActivePage}
        updateLimitPagination={updateLimitPagination}
      />
    );
  }
);

NetworkDnsTableComponent.displayName = 'NetworkDnsTableComponent';

export const NetworkDnsTable = React.memo(NetworkDnsTableComponent);

NetworkDnsTable.displayName = 'NetworkDnsTable';
