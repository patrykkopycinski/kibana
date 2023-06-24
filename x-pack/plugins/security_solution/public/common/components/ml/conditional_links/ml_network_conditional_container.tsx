/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse, stringify } from 'query-string';
import React from 'react';

import { Navigate } from 'react-router-dom-v5-compat';
import { Routes, Route } from '@kbn/shared-ux-router';
import { url as urlUtils } from '@kbn/kibana-utils-plugin/public';
import { addEntitiesToKql } from './add_entities_to_kql';
import { replaceKQLParts } from './replace_kql_parts';
import { emptyEntity, getMultipleEntities, multipleEntities } from './entity_helpers';

import { NETWORK_PATH } from '../../../../../common/constants';
interface QueryStringType {
  '?_g': string;
  query: string | null;
  timerange: string | null;
}

export const MlNetworkConditionalContainer = React.memo(() => {
  return (
    <Routes legacySwitch={false}>
      <Route
        strict
        exact
        path=""
        render={({ location }) => {
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

          return <Navigate to={`${NETWORK_PATH}?${reEncoded}`} />;
        }}
      />
      <Route
        path="ip/:ip"
        render={({
          location,
          match: {
            params: { ip },
          },
        }) => {
          const queryStringDecoded = parse(location.search.substring(1), {
            sort: false,
          }) as Required<QueryStringType>;

          if (queryStringDecoded.query != null) {
            queryStringDecoded.query = replaceKQLParts(queryStringDecoded.query);
          }

          if (emptyEntity(ip)) {
            const reEncoded = stringify(urlUtils.encodeQuery(queryStringDecoded), {
              sort: false,
              encode: false,
            });

            return <Navigate to={`${NETWORK_PATH}?${reEncoded}`} />;
          } else if (multipleEntities(ip)) {
            const ips: string[] = getMultipleEntities(ip);
            queryStringDecoded.query = addEntitiesToKql(
              ['source.ip', 'destination.ip'],
              ips,
              queryStringDecoded.query || ''
            );
            const reEncoded = stringify(urlUtils.encodeQuery(queryStringDecoded), {
              sort: false,
              encode: false,
            });
            return <Navigate to={`${NETWORK_PATH}?${reEncoded}`} />;
          } else {
            const reEncoded = stringify(urlUtils.encodeQuery(queryStringDecoded), {
              sort: false,
              encode: false,
            });
            return <Navigate to={`${NETWORK_PATH}/ip/${ip}?${reEncoded}`} />;
          }
        }}
      />
      <Route
        path={`${NETWORK_PATH}/ml-network/`}
        render={({ location: { search = '' } }) => (
          <Navigate
            from={`${NETWORK_PATH}/ml-network/`}
            to={{
              pathname: `${NETWORK_PATH}/ml-network`,
              search,
            }}
          />
        )}
      />
    </Routes>
  );
});

MlNetworkConditionalContainer.displayName = 'MlNetworkConditionalContainer';
