/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ClientOptions as ESClientOptions } from '@elastic/elasticsearch/lib/client';
import type { Client as ESClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Get an Elasticsearch client for which connectivity has been validated
 *
 * @param esClientOptions Elasticsearch client options
 * @param helperSettings Settings for this helper
 * @param helperSettings.log Logger instance
 * @param helperSettings.cli Set to `true` when invoked from a CLI context
 * @throws FailError if cluster information cannot be read from the target Elasticsearch instance
 */
export declare function getValidatedESClient(
  esClientOptions: ESClientOptions,
  helperSettings: {
    log?: ToolingLog;
    cli?: boolean;
  }
): Promise<ESClient>;
