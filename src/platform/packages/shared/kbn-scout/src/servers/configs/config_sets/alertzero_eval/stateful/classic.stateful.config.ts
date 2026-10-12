/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutServerConfig } from '../../../../../types';
import { servers as e2eServers } from '../../alertzero_e2e/stateful/classic.stateful.config';

/**
 * Scout server config for the AlertZero token-usage eval (`test/scout_alertzero_eval`).
 *
 * The eval measures what each AlertZero Worker sweep costs in tokens, so it needs the same server
 * surface `alertzero_e2e` already builds: the EIS inference endpoint on Elasticsearch with the
 * preconfigured connectors from `KIBANA_TESTING_AI_CONNECTORS` / `config/kibana.dev.yml` /
 * `target/eis_models.json`, `alertzero` plus the `agenticInvestigations` and `proposals` plugins it
 * requires, service accounts (no managed workflow is installed without them), the
 * `securitySolution:enableAlertZero` override, and the Workflows UI / Agent Builder experimental
 * features the review workflows need. Those reasons are documented on the base config set and are
 * not repeated here.
 *
 * On top of that base, the eval differs in exactly one way: it measures **one model at a time**, so
 * the stack's default AI connector is pinned from `ALERTZERO_EVAL_AI_CONNECTOR` (falling back to
 * `ALERTZERO_E2E_AI_CONNECTOR` for runs that reuse the e2e harness). Without a pin the eval would
 * silently measure whatever `genAiSettings:defaultAIConnector` happens to resolve to, and two model
 * runs would not be comparable.
 *
 * It is a separate config set rather than an env var on the e2e one because the eval seeds at scale
 * (up to the Worker caps: 10 rules, 50 coverage gaps), drives the global sweeps by hand and leaves
 * artifacts behind; keeping it out of `alertzero_e2e` keeps long eval runs off the e2e suite's
 * stack, and lets the two evolve independently.
 *
 * Usage:
 *   ALERTZERO_EVAL_AI_CONNECTOR=eis-gpt-5-6-sol \
 *   node scripts/scout start-server --arch stateful --domain classic --serverConfigSet alertzero_eval
 */
const pinnedConnectorId = (
  process.env.ALERTZERO_EVAL_AI_CONNECTOR ??
  process.env.ALERTZERO_E2E_AI_CONNECTOR ??
  ''
).trim();

const DEFAULT_AI_CONNECTOR_ARG = '--uiSettings.overrides.genAiSettings:defaultAIConnector=';

/**
 * The eval measures tokens, so the token-usage rows must actually be written: the index
 * `.kibana-inference-token-usage` does not exist until `genAiSettings:tokenUsageTracking` is on
 * (default false), and every run failed at the first token read with `index_not_found_exception`
 * while the sweeps themselves ran (measured: smoke-e01d0215577b44e8).
 */
const TOKEN_USAGE_TRACKING_ARG = '--uiSettings.overrides.genAiSettings:tokenUsageTracking=true';

export const servers: ScoutServerConfig = {
  ...e2eServers,
  kbnTestServer: {
    ...e2eServers.kbnTestServer,
    // The base config set already handles a pin, so drop its argument before adding ours: Kibana
    // takes the last value for a repeated flag, but relying on that would make this set's
    // behaviour depend on the base's argument order.
    serverArgs: [
      ...e2eServers.kbnTestServer.serverArgs.filter(
        (arg) => !arg.startsWith(DEFAULT_AI_CONNECTOR_ARG)
      ),
      TOKEN_USAGE_TRACKING_ARG,
      ...(pinnedConnectorId ? [`${DEFAULT_AI_CONNECTOR_ARG}${pinnedConnectorId}`] : []),
    ],
  },
};
