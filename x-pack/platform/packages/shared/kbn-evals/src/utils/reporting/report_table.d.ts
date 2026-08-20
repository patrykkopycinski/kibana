/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluatorStats } from '../evals_client';
interface StatsDisplay {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  count: number;
}
export interface EvaluatorDisplayOptions {
  decimalPlaces?: number;
  unitSuffix?: string;
  statsToInclude?: Array<keyof StatsDisplay>;
}
export interface EvaluatorDisplayGroup {
  evaluatorNames: string[];
  combinedColumnName: string;
}
export interface EvaluationTableOptions {
  firstColumnHeader?: string;
  styleRowName?: (name: string) => string;
  evaluatorDisplayOptions?: Map<string, EvaluatorDisplayOptions>;
  evaluatorDisplayGroups?: EvaluatorDisplayGroup[];
}
export declare function createTable(
  stats: EvaluatorStats[],
  repetitions: number,
  options?: EvaluationTableOptions
): string;
export {};
