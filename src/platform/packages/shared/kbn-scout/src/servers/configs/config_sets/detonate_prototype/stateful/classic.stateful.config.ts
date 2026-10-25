/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutServerConfig } from '../../../../../types';
import { servers as defaultConfig } from '../../default/stateful/classic.stateful.config';
import { detonatePrototypeEsServerArgs, detonatePrototypeServerArgs } from '../shared';

/**
 * Scout server config for the detonate prototype suite, which needs the
 * `detonatePrototypeEnabled` experimental flag and a detonation service address
 * present when Kibana boots. The tests live under `test/scout_detonate_prototype`.
 *
 * With `DETONATE_EIS` set, ES also boots with the EIS QA inference gateway so
 * Agent Builder's LLM gate passes (see `../shared`).
 *
 * Usage:
 *   node scripts/scout.js start-server --arch stateful --domain classic --serverConfigSet detonate_prototype
 */
export const servers: ScoutServerConfig = {
  ...defaultConfig,
  esTestCluster: {
    ...defaultConfig.esTestCluster,
    serverArgs: [...defaultConfig.esTestCluster.serverArgs, ...detonatePrototypeEsServerArgs],
  },
  kbnTestServer: {
    ...defaultConfig.kbnTestServer,
    serverArgs: [...defaultConfig.kbnTestServer.serverArgs, ...detonatePrototypeServerArgs],
  },
};
