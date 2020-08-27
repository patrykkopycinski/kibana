/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { isEmpty } from 'lodash/fp';
import { EuiFlexItem, EuiPanel } from '@elastic/eui';
import numeral from '@elastic/numeral';
import { FormattedMessage } from '@kbn/i18n/react';
import React, { useMemo, useCallback } from 'react';

import { DEFAULT_NUMBER_FORMAT, APP_ID } from '../../../../common/constants';
import { ESQuery } from '../../../../common/typed_json';
import { ID as OverviewHostQueryId, useOverviewHost } from '../../containers/overview_host';
import { HeaderSection } from '../../../common/components/header_section';
import { useUiSetting$, useKibana } from '../../../common/lib/kibana';
import { getHostsUrl, useFormatUrl } from '../../../common/components/link_to';
import { getOverviewHostStats, OverviewHostStats } from '../overview_host_stats';
import { manageQuery } from '../../../common/components/page/manage_query';
import { InspectButtonContainer } from '../../../common/components/inspect';
import { GlobalTimeArgs } from '../../../common/containers/use_global_time';
import { SecurityPageName } from '../../../app/types';
import { LinkButton } from '../../../common/components/links';
import { Sourcerer } from '../../../common/components/sourcerer';

export interface OwnProps {
  startDate: GlobalTimeArgs['from'];
  endDate: GlobalTimeArgs['to'];
  filterQuery?: ESQuery | string;
  setQuery: GlobalTimeArgs['setQuery'];
}

const OverviewHostStatsManage = manageQuery(OverviewHostStats);
export type OverviewHostProps = OwnProps;

const OverviewHostComponent: React.FC<OverviewHostProps> = ({
  endDate,
  filterQuery,
  startDate,
  setQuery,
}) => {
  const { formatUrl, search: urlSearch } = useFormatUrl(SecurityPageName.hosts);
  const { navigateToApp } = useKibana().services.application;
  const [defaultNumberFormat] = useUiSetting$<string>(DEFAULT_NUMBER_FORMAT);

  const goToHost = useCallback(
    (ev) => {
      ev.preventDefault();
      navigateToApp(`${APP_ID}:${SecurityPageName.hosts}`, {
        path: getHostsUrl(urlSearch),
      });
    },
    [navigateToApp, urlSearch]
  );

  const hostPageButton = useMemo(
    () => (
      <LinkButton onClick={goToHost} href={formatUrl(getHostsUrl())}>
        <FormattedMessage
          id="xpack.securitySolution.overview.hostsAction"
          defaultMessage="View hosts"
        />
      </LinkButton>
    ),
    [goToHost, formatUrl]
  );

  const [loading, { overviewHost, id, inspect, refetch }] = useOverviewHost({
    endDate,
    filterQuery,
    startDate,
  });

  const formmatedMessageValues = useMemo(() => {
    const hostEventsCount = getOverviewHostStats(overviewHost).reduce(
      (total, stat) => total + stat.count,
      0
    );
    const formattedHostEventsCount = numeral(hostEventsCount).format(defaultNumberFormat);

    return {
      formattedHostEventsCount,
      hostEventsCount,
    };
  }, [defaultNumberFormat, overviewHost]);

  const title = useMemo(
    () => (
      <FormattedMessage
        id="xpack.securitySolution.overview.hostsTitle"
        defaultMessage="Host events"
      />
    ),
    []
  );

  const subtitle = useMemo(
    () =>
      !isEmpty(overviewHost) ? (
        <FormattedMessage
          defaultMessage="Showing: {formattedHostEventsCount} {hostEventsCount, plural, one {event} other {events}}"
          id="xpack.securitySolution.overview.overviewHost.hostsSubtitle"
          values={formmatedMessageValues}
        />
      ) : (
        <>{''}</>
      ),
    [formmatedMessageValues, overviewHost]
  );

  return (
    <EuiFlexItem>
      <InspectButtonContainer>
        <EuiPanel data-test-subj="overview-host-query">
          <>
            <HeaderSection id={OverviewHostQueryId} subtitle={subtitle} title={title}>
              <>
                <Sourcerer />
                {hostPageButton}
              </>
            </HeaderSection>

            <OverviewHostStatsManage
              loading={loading}
              data={overviewHost}
              setQuery={setQuery}
              id={id}
              inspect={inspect}
              refetch={refetch}
            />
          </>
        </EuiPanel>
      </InspectButtonContainer>
    </EuiFlexItem>
  );
};

export const OverviewHost = React.memo(OverviewHostComponent);
