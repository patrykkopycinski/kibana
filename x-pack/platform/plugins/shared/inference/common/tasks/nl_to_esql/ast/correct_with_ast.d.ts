/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type QueryCorrection } from './corrections';
interface CorrectWithAstResult {
  output: string;
  corrections: QueryCorrection[];
}
export declare const correctQueryWithAst: (query: string) => CorrectWithAstResult;
export {};
