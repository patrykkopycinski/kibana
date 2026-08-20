/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { ScoutTestConfig } from '../../../types';
/**
 * Saves Scout server configuration to the disk.
 * @param testServersConfig configuration to be saved
 * @param log Logger instance to report errors or debug information.
 */
export declare const saveScoutTestConfigOnDisk: (
  testServersConfig: ScoutTestConfig,
  log: ToolingLog
) => void;
