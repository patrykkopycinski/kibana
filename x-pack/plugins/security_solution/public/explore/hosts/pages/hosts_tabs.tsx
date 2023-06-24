/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { Routes, Route } from '@kbn/shared-ux-router';

import { TableId } from '@kbn/securitysolution-data-table';
import type { HostsTabsProps } from './types';
import { HostsTableType } from '../store/model';
import { AnomaliesQueryTabBody } from '../../../common/containers/anomalies/anomalies_query_tab_body';
import { AnomaliesHostTable } from '../../../common/components/ml/tables/anomalies_host_table';
import { EventsQueryTabBody } from '../../../common/components/events_tab';
import { HOSTS_PATH, SecurityPageName } from '../../../../common/constants';

import {
  HostsQueryTabBody,
  HostRiskScoreQueryTabBody,
  UncommonProcessQueryTabBody,
  SessionsTabBody,
} from './navigation';
import { fieldNameExistsFilter } from '../../../common/components/visualization_actions/utils';

export const HostsTabs = React.memo<HostsTabsProps>(
  ({ deleteQuery, filterQuery, from, indexNames, isInitializing, setQuery, to, type }) => {
    const tabProps = {
      deleteQuery,
      endDate: to,
      filterQuery,
      indexNames,
      skip: isInitializing || filterQuery === undefined,
      setQuery,
      startDate: from,
      type,
    };

    const hostNameExistsFilter = useMemo(() => fieldNameExistsFilter(SecurityPageName.hosts), []);

    return (
      <Routes legacySwitch={false}>
        <Route
          path={`${HOSTS_PATH}/:tabName(${HostsTableType.hosts})`}
          element={<HostsQueryTabBody {...tabProps} />}
        />
        <Route
          path={`${HOSTS_PATH}/:tabName(${HostsTableType.risk})`}
          element={<HostRiskScoreQueryTabBody {...tabProps} />}
        />
        <Route
          path={`${HOSTS_PATH}/:tabName(${HostsTableType.uncommonProcesses})`}
          element={<UncommonProcessQueryTabBody {...tabProps} />}
        />
        <Route
          path={`${HOSTS_PATH}/:tabName(${HostsTableType.anomalies})`}
          element={
            <AnomaliesQueryTabBody {...tabProps} AnomaliesTableComponent={AnomaliesHostTable} />
          }
        />
        <Route
          path={`${HOSTS_PATH}/:tabName(${HostsTableType.events})`}
          element={
            <EventsQueryTabBody
              additionalFilters={hostNameExistsFilter}
              tableId={TableId.hostsPageEvents}
              {...tabProps}
            />
          }
        />
        <Route
          path={`${HOSTS_PATH}/:tabName(${HostsTableType.sessions})`}
          element={<SessionsTabBody {...tabProps} />}
        />
      </Routes>
    );
  }
);

HostsTabs.displayName = 'HostsTabs';
