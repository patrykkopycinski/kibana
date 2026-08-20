/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { Config } from './configs';
/**
 * Creates the default space NPRE (Named Project Routing Expression) for local Scout CPS setups.
 *
 * In real serverless, the control plane provisions NPREs during project setup. Locally there is
 * no control plane, so we manually `PUT /_project_routing/kibana_space_default_default` with
 * `_alias:*` to route across all projects. No-ops for non-CPS configurations.
 *
 * Throws on failure to prevent tests from running against a misconfigured environment.
 */
export declare function ensureDefaultSpaceNPRE(config: Config, log: ToolingLog): Promise<void>;
