/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetResponse } from '@elastic/elasticsearch/lib/api/types';

/** Security Knowledge Indicator type taxonomy. */
export type SkiType = 'technology' | 'vulnerability' | 'threat' | 'coverage_gap';

/** Spike-owned Security Knowledge Indicator document for Dark Watch ingestion. */
export interface SecurityKnowledgeIndicatorProperties {
  id: string;
  type: SkiType;
  normalizedName: string;
  source: string;
  collectedAt: string;
  confidence: number;
  scope: string;
  supportingEvidence: string[];
  /** Related CVE, KEV, or TTP reference strings. */
  relatedRefs: string[];
  expiresAt?: string;
  sourceWatch?: string;
  space?: string;
}

export type SkiDocument = Pick<GetResponse<SecurityKnowledgeIndicatorProperties>, '_source' | '_id'>;
