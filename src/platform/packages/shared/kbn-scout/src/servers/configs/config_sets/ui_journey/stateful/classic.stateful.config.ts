/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutServerConfig } from '../../../../../types';
import { defaultConfig } from '../../default/stateful/base.config';

/**
 * Custom Scout server configuration for the Daybreak `scout_ui_journey` suite
 * (`x-pack/solutions/security/plugins/daybreak/test/scout_ui_journey/ui`).
 *
 * This configuration enables:
 * - Daybreak (`xpack.daybreak.enabled`, default off — FR-009, NFR-2), so the
 *   plugin's `public/plugin.ts` registers the `daybreak` application route
 *   the journey test navigates to.
 */
export const servers: ScoutServerConfig = {
  ...defaultConfig,

  kbnTestServer: {
    ...defaultConfig.kbnTestServer,
    serverArgs: [...defaultConfig.kbnTestServer.serverArgs, `--xpack.daybreak.enabled=true`],
  },
};
