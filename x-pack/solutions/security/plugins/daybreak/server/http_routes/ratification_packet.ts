/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { daybreakApiPath } from '../../common/http_api';
import { buildRatificationPacket } from '../common/contracts/ratification_packet';
import { daybreakRouteSecurity, type RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';

/** Serve the #17942 ratification packet built from spike-canonical builders. */
export const registerRatificationPacketRoute = ({ logger, router }: RouteDependencies) => {
  const wrapHandler = getHandlerWrapper({ logger });

  router.get(
    {
      path: `${daybreakApiPath}/ratification-packet`,
      security: daybreakRouteSecurity,
      validate: false,
    },
    wrapHandler(async () => buildRatificationPacket())
  );
};
