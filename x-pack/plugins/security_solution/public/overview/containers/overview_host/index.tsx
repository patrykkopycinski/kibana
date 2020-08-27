/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { getOr, noop } from 'lodash/fp';
import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import deepEqual from 'fast-deep-equal';

import { AbortError } from '../../../../../../../src/plugins/data/common';
import { ESQuery } from '../../../../common/typed_json';
import {
  HostOverviewRequestOptions,
  HostOverviewStrategyResponse,
  HostsQueries,
} from '../../../../common/search_strategy/security_solution/hosts';
import { DEFAULT_INDEX_KEY } from '../../../../common/constants';
import { OverviewHostData } from '../../../graphql/types';
import { useUiSetting, useKibana } from '../../../common/lib/kibana';
import { inputsModel, inputsSelectors } from '../../../common/store/inputs';
import { State } from '../../../common/store';
import { createFilter } from '../../../common/containers/helpers';

import { useManageSource } from '../../../common/containers/sourcerer';
import { SOURCERER_FEATURE_FLAG_ON } from '../../../common/containers/sourcerer/constants';

export const ID = 'overviewHostQuery';

export interface OverviewHostArgs {
  id: string;
  inspect: inputsModel.InspectQuery;
  overviewHost: OverviewHostData;
  refetch: inputsModel.Refetch;
}

export interface UseOverviewHostProps {
  id: string;
  filterQuery?: ESQuery | string;
  endDate: string;
  startDate: string;
}

export const useOverviewHost = ({
  id = ID,
  filterQuery,
  startDate,
  endDate,
}: UseOverviewHostProps): [boolean, OverviewHostArgs] => {
  const { data, notifications } = useKibana().services;
  const getQuery = inputsSelectors.globalQueryByIdSelector();
  const { isInspected } = useSelector((state: State) => getQuery(state, id));
  const { activeSourceGroupId, getManageSourceGroupById } = useManageSource();
  const { indexPatterns } = useMemo(() => getManageSourceGroupById(activeSourceGroupId), [
    getManageSourceGroupById,
    activeSourceGroupId,
  ]);
  const uiDefaultIndexPatterns = useUiSetting<string[]>(DEFAULT_INDEX_KEY);
  const defaultIndex = SOURCERER_FEATURE_FLAG_ON ? indexPatterns : uiDefaultIndexPatterns;

  const refetch = useRef<inputsModel.Refetch>(noop);
  const abortCtrl = useRef(new AbortController());
  const [loading, setLoading] = useState(false);
  const [overviewHostRequest, setOverviewHostRequest] = useState<HostOverviewRequestOptions>({
    timerange: {
      interval: '12h',
      from: startDate,
      to: endDate,
    },
    filterQuery: createFilter(filterQuery),
    defaultIndex,
    factoryQueryType: HostsQueries.hostOverview,
    // inspect: isInspected,
  });

  const [overviewHostResponse, setOverviewHostResponse] = useState<OverviewHostArgs>({
    id: ID,
    inspect: {
      dsl: [],
      response: [],
    },
    refetch: refetch.current,
    overviewHost: {},
  });

  const overviewHostSearch = useCallback(
    (request: HostOverviewRequestOptions) => {
      let didCancel = false;
      const asyncSearch = async () => {
        abortCtrl.current = new AbortController();
        setLoading(true);

        const searchSubscription$ = data.search
          .search<HostOverviewRequestOptions, HostOverviewStrategyResponse>(request, {
            strategy: 'securitySolutionSearchStrategy',
            signal: abortCtrl.current.signal,
          })
          .subscribe({
            next: (response) => {
              if (!response.isPartial && !response.isRunning) {
                if (!didCancel) {
                  setLoading(false);
                  setOverviewHostResponse((prevResponse) => ({
                    ...prevResponse,
                    hosts: response.edges,
                    inspect: response.inspect ?? prevResponse.inspect,
                    refetch: refetch.current,
                  }));
                }
                searchSubscription$.unsubscribe();
              } else if (response.isPartial && !response.isRunning) {
                if (!didCancel) {
                  setLoading(false);
                }
                // TODO: Make response error status clearer
                notifications.toasts.addWarning(i18n.ERROR_ALL_HOST);
                searchSubscription$.unsubscribe();
              }
            },
            error: (msg) => {
              if (!(msg instanceof AbortError)) {
                notifications.toasts.addDanger({ title: i18n.FAIL_ALL_HOST, text: msg.message });
              }
            },
          });
      };
      abortCtrl.current.abort();
      asyncSearch();
      refetch.current = asyncSearch;
      return () => {
        didCancel = true;
        abortCtrl.current.abort();
      };
    },
    [data.search, notifications.toasts]
  );

  useEffect(() => {
    setOverviewHostRequest((prevRequest) => {
      const myRequest = {
        ...prevRequest,
        defaultIndex,
        filterQuery: createFilter(filterQuery),
        timerange: {
          interval: '12h',
          from: startDate,
          to: endDate,
        },
      };
      if (!deepEqual(prevRequest, myRequest)) {
        return myRequest;
      }
      return prevRequest;
    });
  }, [defaultIndex, endDate, filterQuery, startDate]);

  useEffect(() => {
    overviewHostSearch(overviewHostRequest);
  }, [overviewHostRequest, overviewHostSearch]);

  return [loading, overviewHostResponse];
};
