/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { AlertAnalysisVerdict } from './workflow_task';

/**
 * Per-run token/latency row exported to local JSONL so C2 (cost ratio) and C3 (latency ratio)
 * can be computed post-hoc without read access to the golden cluster's `.evaluation-scores`
 * (the dev-vault ES key is write-only). Append-only so concurrent repetitions never serialize
 * over each other destructively; each row is one JSON object per line.
 *
 * Output path: the value of env `ALERT_ANALYSIS_TOKEN_USAGE_PATH` if set, else
 * `/tmp/alert-analysis-token-usage-<TEST_RUN_ID>.jsonl`. Writes are line-buffered (one
 * appendFileSync per row) — simple and safe for the suite's ~5-wide concurrency.
 */
export const exportTokenUsageRow = (params: {
  connectorId: string;
  alertId: string;
  stratum: string;
  verdict: AlertAnalysisVerdict;
}): void => {
  const { connectorId, alertId, stratum, verdict } = params;
  const usage = verdict.usage;
  const outPath =
    process.env.ALERT_ANALYSIS_TOKEN_USAGE_PATH ||
    `/tmp/alert-analysis-token-usage-${process.env.TEST_RUN_ID ?? 'unknown'}.jsonl`;
  const dir = path.dirname(outPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const row = {
    timestamp: new Date().toISOString(),
    testRunId: process.env.TEST_RUN_ID ?? null,
    connectorId,
    alertId,
    stratum,
    executionStatus: verdict.executionStatus ?? null,
    predicted: verdict.classification ?? null,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    cachedTokens: usage?.cachedTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    latencyMs: verdict.latencyMs ?? null,
    agentLatencyMs: verdict.agentLatencyMs ?? null,
  };
  // ponytail: appendFileSync with newline per record. Ceiling: O(runs) appends per suite,
  // negligible vs the workflow execution cost. Upgrade path: batch + flush in afterAll.
  appendFileSync(outPath, `${JSON.stringify(row)}\n`);
};
