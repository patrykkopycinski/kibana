/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KbnClient } from '@kbn/kbn-client';
import type { ScoutLogger } from './logger';
import type { ScoutTestConfig, EsClient } from '../../types';
export declare function getEsClient(config: ScoutTestConfig, log: ScoutLogger): EsClient;
export declare function getLinkedEsClient(config: ScoutTestConfig, log: ScoutLogger): EsClient;
export declare function getKbnClient(config: ScoutTestConfig, log: ScoutLogger): KbnClient;
