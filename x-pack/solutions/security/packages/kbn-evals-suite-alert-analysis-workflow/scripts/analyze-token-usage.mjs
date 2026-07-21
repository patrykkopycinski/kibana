#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Post-run analyzer CLI. Mirrors the pure logic in `src/analyze_token_usage.ts`
 * (kept separate rather than imported because Node ESM cannot resolve `.ts`
 * directly; the TS module is the canonical, unit-tested version consumed by
 * `validation_results.test.ts`).
 *
 * Usage:
 *   yarn analyze <jsonl> [priceBasisJson]   (inside this package)
 *   node scripts/analyze-token-usage.mjs <jsonl> [priceBasisJson]
 *
 * priceBasisJson (optional): {"<connectorId>": {"input": <usd/1M>, "output": <usd/1M>, "cached": <usd/1M>}}
 * defaults to Anthropic-list per-1M-token prices:
 *   claude-4.5-haiku:  in $1.00, out $5.00, cached-read $0.10
 *   claude-4.5-sonnet: in $3.00, out $15.00, cached-read $0.30
 */

import { readFileSync } from 'node:fs';

const DEFAULT_PRICE_BASIS = {
  'eis-anthropic-claude-4-5-haiku': { input: 1.0, output: 5.0, cached: 0.1 },
  'eis-anthropic-claude-4-5-sonnet': { input: 3.0, output: 15.0, cached: 0.3 },
};

const [, , jsonlPath, priceBasisPath] = process.argv;
if (!jsonlPath) {
  console.error('Usage: yarn analyze <jsonl> [priceBasis.json]');
  process.exit(1);
}

const priceBasis = priceBasisPath
  ? JSON.parse(readFileSync(priceBasisPath, 'utf-8'))
  : DEFAULT_PRICE_BASIS;

const rows = readFileSync(jsonlPath, 'utf-8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length > 0)
  .map((l) => JSON.parse(l));

if (rows.length === 0) {
  console.error(`No rows found in ${jsonlPath}`);
  process.exit(1);
}

const byModel = new Map();
for (const r of rows) {
  if (r.totalTokens == null && r.latencyMs == null) continue;
  if (!byModel.has(r.connectorId)) byModel.set(r.connectorId, []);
  byModel.get(r.connectorId).push(r);
}

const mean = (arr, k) =>
  arr.length === 0 ? null : arr.reduce((s, r) => s + (typeof r[k] === 'number' ? r[k] : 0), 0) / arr.length;

const perModel = {};
for (const [modelId, modelRows] of byModel) {
  const used = modelRows.filter((r) => r.totalTokens != null);
  const latRows = modelRows.filter((r) => r.latencyMs != null);
  const inT = mean(used, 'inputTokens');
  const outT = mean(used, 'outputTokens');
  const cachedT = mean(used, 'cachedTokens');
  const latency = mean(latRows, 'latencyMs');
  const agentLatency = mean(latRows, 'agentLatencyMs');
  const p = priceBasis[modelId];
  let costPerRun = null;
  if (p && inT != null && outT != null) {
    costPerRun = (inT / 1e6) * p.input + (outT / 1e6) * p.output + ((cachedT ?? 0) / 1e6) * p.cached;
  }
  perModel[modelId] = {
    runs: modelRows.length,
    runsFailed: modelRows.filter((r) => r.executionStatus !== 'succeeded').length,
    meanInputTokens: inT,
    meanOutputTokens: outT,
    meanCachedTokens: cachedT,
    meanTotalTokens: mean(used, 'totalTokens'),
    meanLatencyMs: latency,
    meanAgentLatencyMs: agentLatency,
    costPerRunUsd: costPerRun,
  };
}

const ratios = {};
const modelIds = Object.keys(perModel);
if (modelIds.length === 2) {
  const [a, b] = modelIds;
  const costA = perModel[a].costPerRunUsd;
  const costB = perModel[b].costPerRunUsd;
  if (costA != null && costB != null) {
    const dearer = costA >= costB ? a : b;
    const cheaper = dearer === a ? b : a;
    ratios.costRatio = perModel[dearer].costPerRunUsd / perModel[cheaper].costPerRunUsd;
    ratios.dearerModel = dearer;
    ratios.cheaperModel = cheaper;
  }
  const latA = perModel[a].meanLatencyMs;
  const latB = perModel[b].meanLatencyMs;
  if (latA != null && latB != null) {
    const faster = latA <= latB ? a : b;
    const slower = faster === a ? b : a;
    ratios.latencyRatio = perModel[slower].meanLatencyMs / perModel[faster].meanLatencyMs;
    ratios.slowerModel = slower;
    ratios.fasterModel = faster;
  }
}

const stratified = {};
for (const [modelId, modelRows] of byModel) {
  const byStrat = {};
  for (const r of modelRows) {
    const s = r.stratum ?? 'unknown';
    if (!byStrat[s]) byStrat[s] = [];
    byStrat[s].push(r);
  }
  stratified[modelId] = {};
  for (const [stratum, sRows] of Object.entries(byStrat)) {
    stratified[modelId][stratum] = { count: sRows.length, meanLatencyMs: mean(sRows, 'latencyMs') };
  }
}

console.log(JSON.stringify({ jsonlPath, totalRows: rows.length, priceBasis, perModel, ratios, stratified }, null, 2));
