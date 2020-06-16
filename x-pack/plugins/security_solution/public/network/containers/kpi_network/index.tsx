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
import { GetKpiNetworkQuery, KpiNetworkData } from '../../../graphql/types';
import { inputsModel, inputsSelectors, State } from '../../../common/store';
import { useUiSetting } from '../../../common/lib/kibana';
import { createFilter, getDefaultFetchPolicy } from '../../../common/containers/helpers';
import { QueryTemplateProps } from '../../../common/containers/query_template';

import { kpiNetworkQuery } from './index.gql_query';

const ID = 'kpiNetworkQuery';

export interface KpiNetworkArgs {
  id: string;
  inspect: inputsModel.InspectQuery;
  kpiNetwork: KpiNetworkData;
  loading: boolean;
  refetch: inputsModel.Refetch;
}

export interface KpiNetworkProps extends QueryTemplateProps {
  children: (args: KpiNetworkArgs) => React.ReactNode;
}

const KpiNetworkComponentQuery: React.FC<KpiNetworkProps> = ({
  id = ID,
  children,
  filterQuery,
  isInspected,
  skip,
  sourceId,
  startDate,
  endDate,
}) => {
  const { isInspected } = useSelector((state) =>
    inputsSelectors.globalQueryByIdSelector()(state, id)
  );
  return (
    <Query<GetKpiNetworkQuery.Query, GetKpiNetworkQuery.Variables>
      query={kpiNetworkQuery}
      fetchPolicy={getDefaultFetchPolicy()}
      notifyOnNetworkStatusChange
      skip={skip}
      variables={{
        sourceId,
        timerange: {
          interval: '12h',
          from: startDate!,
          to: endDate!,
        },
        filterQuery: createFilter(filterQuery),
        defaultIndex: useUiSetting<string[]>(DEFAULT_INDEX_KEY),
        inspect: isInspected,
      }}
    >
      {({ data, loading, refetch }) => {
        const kpiNetwork = getOr({}, `source.KpiNetwork`, data);
        return children({
          id,
          inspect: getOr(null, 'source.KpiNetwork.inspect', data),
          kpiNetwork,
          loading,
          refetch,
        });
      }}
    </Query>
  );
};

KpiNetworkComponentQuery.displayName = 'KpiNetworkComponentQuery';

export const KpiNetworkQuery = React.memo(KpiNetworkComponentQuery);
