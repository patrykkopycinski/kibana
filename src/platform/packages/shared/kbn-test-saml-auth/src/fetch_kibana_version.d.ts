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
 * Fetches Kibana version string in the same shape as @kbn/kbn-client KbnClientVersion.get()
 * (for use as the `kbn-version` header on SAML requests). Single GET to `/api/status`; no retries.
 */
export declare function fetchKibanaVersionHeaderString(
  kbnBaseUrl: string,
  username: string,
  password: string,
  log: ToolingLog
): Promise<string>;
