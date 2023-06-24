/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse, stringify } from 'query-string';
import React from 'react';

import { Navigate, useLocation, useParams } from 'react-router-dom-v5-compat';
import { Routes, Route } from '@kbn/shared-ux-router';

import { url as urlUtils } from '@kbn/kibana-utils-plugin/public';
import { addEntitiesToKql } from './add_entities_to_kql';
import { replaceKQLParts } from './replace_kql_parts';
import { emptyEntity, multipleEntities, getMultipleEntities } from './entity_helpers';
import { HostsTableType } from '../../../../explore/hosts/store/model';
import { HOSTS_PATH } from '../../../../../common/constants';
interface QueryStringType {
  '?_g': string;
  query: string | null;
  timerange: string | null;
}

const RedirectToHosts = React.memo(() => {
  const location = useLocation();

  const queryStringDecoded = parse(location.search.substring(1), {
    sort: false,
  }) as Required<QueryStringType>;

  if (queryStringDecoded.query != null) {
    queryStringDecoded.query = replaceKQLParts(queryStringDecoded.query);
  }
  const reEncoded = stringify(urlUtils.encodeQuery(queryStringDecoded), {
    sort: false,
    encode: false,
  });
  return <Navigate to={`${HOSTS_PATH}?${reEncoded}`} />;
});

RedirectToHosts.displayName = 'RedirectToHosts';

const RedirectToHost = React.memo(() => {
  const location = useLocation();
  const { hostName } = useParams();

  const queryStringDecoded = parse(location.search.substring(1), {
    sort: false,
  }) as Required<QueryStringType>;

  if (queryStringDecoded.query != null) {
    queryStringDecoded.query = replaceKQLParts(queryStringDecoded.query);
  }
  if (emptyEntity(hostName as string)) {
    const reEncoded = stringify(urlUtils.encodeQuery(queryStringDecoded), {
      sort: false,
      encode: false,
    });

    return <Navigate to={`${HOSTS_PATH}/${HostsTableType.anomalies}?${reEncoded}`} />;
  } else if (multipleEntities(hostName as string)) {
    const hosts: string[] = getMultipleEntities(hostName as string);
    queryStringDecoded.query = addEntitiesToKql(
      ['host.name'],
      hosts,
      queryStringDecoded.query || ''
    );
    const reEncoded = stringify(urlUtils.encodeQuery(queryStringDecoded), {
      sort: false,
      encode: false,
    });

    return <Navigate to={`${HOSTS_PATH}/${HostsTableType.anomalies}?${reEncoded}`} />;
  } else {
    const reEncoded = stringify(urlUtils.encodeQuery(queryStringDecoded), {
      sort: false,
      encode: false,
    });

    return (
      <Navigate to={`${HOSTS_PATH}/name/${hostName}/${HostsTableType.anomalies}?${reEncoded}`} />
    );
  }
});

RedirectToHost.displayName = 'RedirectToHost';

const RedirectToMLHosts = React.memo(() => {
  const { search = '' } = useLocation();

  return <Navigate to={`${HOSTS_PATH}/ml-hosts${search}`} replace />;
});

RedirectToMLHosts.displayName = 'RedirectToMLHosts';

export const MlHostConditionalContainer = React.memo(() => (
  <Routes legacySwitch={false}>
    <Route path="" element={<RedirectToHosts />} />
    <Route path=":hostName" element={<RedirectToHost />} />
    <Route path={`${HOSTS_PATH}/ml-hosts/`} element={<RedirectToMLHosts />} />
  </Routes>
));

MlHostConditionalContainer.displayName = 'MlHostConditionalContainer';
