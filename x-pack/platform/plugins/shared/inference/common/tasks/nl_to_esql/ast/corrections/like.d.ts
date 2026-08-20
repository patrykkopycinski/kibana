/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLAstQueryExpression } from '@elastic/esql/types';
import type { QueryCorrection } from './types';
/**
 * Correct wrong LIKE wildcard mistakes.
 * The LLM can make mistake and use SQL wildcards for LIKE operators.
 *
 * E.g.
 * `column LIKE "ba_"` => `column LIKE "ba?"`
 * `column LIKE "ba%"` => `column LIKE "ba*"`
 */
export declare const correctLikeWildcards: (query: ESQLAstQueryExpression) => QueryCorrection[];
