/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ClientOptions } from '@elastic/elasticsearch/lib/client';
import type { Client as EsClient } from '@elastic/elasticsearch';
/** options for creating es instances used in functional testing scenarios */
export interface EsClientForTestingOptions extends Omit<ClientOptions, 'node' | 'nodes' | 'tls'> {
  /** url of es instance */
  esUrl: string;
  /** overwrite the auth embedded in the url to use a different user in this client instance */
  authOverride?: {
    username: string;
    password: string;
  };
  /**
   * are we running tests against cloud? this is automatically determined
   * by checking for the TEST_CLOUD environment variable but can be overriden
   * for special cases
   */
  isCloud?: boolean;
}
export declare function createEsClientForTesting(options: EsClientForTestingOptions): EsClient;
