/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PairedTTestResult } from '@kbn/evals-common';
export declare function formatMarkdownCompareReport({
  experimentIdA,
  experimentIdB,
  results,
  significanceThreshold,
  comparePageUrl,
  baselineTimestamp,
  baselineCommitSha,
  refreshBaselineUrl,
  skippedMissingPairs,
  skippedNullScores,
  baselineBranch,
}: {
  experimentIdA: string;
  experimentIdB: string;
  results: PairedTTestResult[];
  significanceThreshold?: number;
  comparePageUrl?: string;
  baselineTimestamp?: string;
  baselineCommitSha?: string;
  refreshBaselineUrl?: string;
  skippedMissingPairs?: number;
  skippedNullScores?: number;
  baselineBranch?: string;
}): string;
