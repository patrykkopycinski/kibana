/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PairedTTestResult } from '@kbn/evals-common';
export declare function formatPairedTTestReport({
  experimentIdA,
  experimentIdB,
  results,
  significanceThreshold,
}: {
  experimentIdA: string;
  experimentIdB: string;
  results: PairedTTestResult[];
  significanceThreshold?: number;
}): {
  header: string[];
  summary: string;
  tableOutput: string;
  significantCount: number;
};
