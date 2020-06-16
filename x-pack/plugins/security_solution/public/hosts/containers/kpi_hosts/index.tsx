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
import { GetKpiHostsQuery, KpiHostsData } from '../../../graphql/types';
import { inputsModel, inputsSelectors, State } from '../../../common/store';
import { useUiSetting } from '../../../common/lib/kibana';
import { createFilter, getDefaultFetchPolicy } from '../../../common/containers/helpers';
import { QueryTemplateProps } from '../../../common/containers/query_template';

import { kpiHostsQuery } from './index.gql_query';

const ID = 'kpiHostsQuery';

export interface KpiHostsArgs {
  id: string;
  inspect: inputsModel.InspectQuery;
  kpiHosts: KpiHostsData;
  loading: boolean;
  refetch: inputsModel.Refetch;
}

export interface KpiHostsProps extends QueryTemplateProps {
  children: (args: KpiHostsArgs) => React.ReactNode;
}

const KpiHostsComponentQuery = React.memo<KpiHostsProps & PropsFromRedux>(
  ({ id = ID, children, endDate, filterQuery, skip, sourceId, startDate }) => {
    const { isInspected } = useSelector((state) =>
      inputsSelectors.globalQueryByIdSelector()(state, id)
    );
    return (
      <Query<GetKpiHostsQuery.Query, GetKpiHostsQuery.Variables>
        query={kpiHostsQuery}
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
          const kpiHosts = getOr({}, `source.KpiHosts`, data);
          return children({
            id,
            inspect: getOr(null, 'source.KpiHosts.inspect', data),
            kpiHosts,
            loading,
            refetch,
          });
        }}
      </Query>
    );
  }
);

KpiHostsComponentQuery.displayName = 'KpiHostsComponentQuery';

export const KpiHostsQuery = React.memo(KpiHostsComponentQuery);

KpiHostsQuery.displayName = 'KpiHostsQuery';
