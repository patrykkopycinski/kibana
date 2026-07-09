/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetResponse } from '@elastic/elasticsearch/lib/api/types';
import type { EvidenceProperties } from './storage';

/** Evidence document as returned by ES. */
export type EvidenceDocument = Pick<GetResponse<EvidenceProperties>, '_source' | '_id'>;
