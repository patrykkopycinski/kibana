/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Ensures the logs directory exists and logs where Kibana/ES output will be written.
 * Duplicated from @kbn/test so Scout does not depend on @kbn/test for CLI-only behavior.
 */
export declare function initLogsDir(log: ToolingLog, logsDir: string): Promise<void>;
