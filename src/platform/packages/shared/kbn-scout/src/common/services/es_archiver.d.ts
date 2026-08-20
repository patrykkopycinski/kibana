/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsArchiver } from '@kbn/es-archiver';
import type { EsClient } from '../../types';
import type { ScoutLogger } from './logger';
export declare function getEsArchiver(esClient: EsClient, log: ScoutLogger): EsArchiver;
export declare function getLinkedEsArchiver(esClient: EsClient, log: ScoutLogger): EsArchiver;
