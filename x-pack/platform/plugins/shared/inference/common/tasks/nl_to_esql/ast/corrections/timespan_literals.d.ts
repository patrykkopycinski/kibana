/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLAstQueryExpression } from '@elastic/esql/types';
import type { QueryCorrection } from './types';
/**
 * Correct timespan literal grammar mistakes, and returns the list of corrections that got applied.
 *
 * E.g.
 * `DATE_TRUNC("YEAR", @timestamp)` => `DATE_TRUNC(1 year, @timestamp)`
 * `BUCKET(@timestamp, "1 week")` => `BUCKET(@timestamp, 1 week)`
 *
 */
export declare const correctTimespanLiterals: (query: ESQLAstQueryExpression) => QueryCorrection[];
