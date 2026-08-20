/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

interface KQLSyntaxErrorData extends Error {
  found: string;
  expected: KQLSyntaxErrorExpected[] | null;
  location: any;
}
interface KQLSyntaxErrorExpected {
  description?: string;
  text?: string;
  type: string;
}
/**
 * A type of error indicating KQL syntax errors
 * @public
 */
export declare class KQLSyntaxError extends Error {
  shortMessage: string;
  constructor(error: KQLSyntaxErrorData, expression: any);
}
export {};
