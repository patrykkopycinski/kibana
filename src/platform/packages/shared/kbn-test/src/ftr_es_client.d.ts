/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type EsClientForTestingOptions } from '@kbn/test-es-server';
import type { Config } from './functional_test_runner';
export type { EsClientForTestingOptions };
export declare function createRemoteEsClientForFtrConfig(
  config: Config,
  overrides?: Omit<EsClientForTestingOptions, 'esUrl'>
): import('@elastic/elasticsearch').Client;
export declare function createEsClientForFtrConfig(
  config: Config,
  overrides?: Omit<EsClientForTestingOptions, 'esUrl'>
): import('@elastic/elasticsearch').Client;
