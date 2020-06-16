/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { getOr } from 'lodash/fp';
import React from 'react';
import { Query } from 'react-apollo';
import { useSelector } from 'react-redux';

import { DEFAULT_INDEX_KEY } from '../../../../common/constants';
import { GetOverviewNetworkQuery, OverviewNetworkData } from '../../../graphql/types';
import { useUiSetting } from '../../../common/lib/kibana';
import { State } from '../../../common/store';
import { inputsModel, inputsSelectors } from '../../../common/store/inputs';
import { createFilter, getDefaultFetchPolicy } from '../../../common/containers/helpers';
import { QueryTemplateProps } from '../../../common/containers/query_template';

import { overviewNetworkQuery } from './index.gql_query';

export const ID = 'overviewNetworkQuery';

export interface OverviewNetworkArgs {
  id: string;
  inspect: inputsModel.InspectQuery;
  overviewNetwork: OverviewNetworkData;
  loading: boolean;
  refetch: inputsModel.Refetch;
}

export interface OverviewNetworkProps extends QueryTemplateProps {
  children: (args: OverviewNetworkArgs) => React.ReactNode;
  sourceId: string;
  endDate: number;
  startDate: number;
}

export const OverviewNetworkComponentQuery = React.memo<OverviewNetworkProps>(
  ({ id = ID, children, filterQuery, sourceId, startDate, endDate }) => {
    const { isInspected } = useSelector((state) =>
      inputsSelectors.globalQueryByIdSelector()(state, id)
    );
    return (
      <Query<GetOverviewNetworkQuery.Query, GetOverviewNetworkQuery.Variables>
        query={overviewNetworkQuery}
        fetchPolicy={getDefaultFetchPolicy()}
        notifyOnNetworkStatusChange
        variables={{
          sourceId,
          timerange: {
            interval: '12h',
            from: startDate,
            to: endDate,
          },
          filterQuery: createFilter(filterQuery),
          defaultIndex: useUiSetting<string[]>(DEFAULT_INDEX_KEY),
          inspect: isInspected,
        }}
      >
        {({ data, loading, refetch }) => {
          const overviewNetwork = getOr({}, `source.OverviewNetwork`, data);
          return children({
            id,
            inspect: getOr(null, 'source.OverviewNetwork.inspect', data),
            overviewNetwork,
            loading,
            refetch,
          });
        }}
      </Query>
    );
  }
);

OverviewNetworkComponentQuery.displayName = 'OverviewNetworkComponentQuery';

export const OverviewNetworkQuery = React.memo(OverviewNetworkComponentQuery);

OverviewNetworkQuery.displayName = 'OverviewNetworkQuery';
