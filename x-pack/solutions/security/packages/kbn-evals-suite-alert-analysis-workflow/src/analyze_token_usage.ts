/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Pure-function core of the post-run token/latency analyzer. Kept separate from
 * the `scripts/analyze-token-usage.mjs` CLI so `validation_results.test.ts` can
 * feed the measured ratios straight into `buildScorecard` without re-implementing
 * the math or shelling out to node.
 *
 * Reads the JSONL produced by `token_usage_exporter.ts`, groups rows by
 * connectorId, computes per-model means, and derives the cross-model cost (C2)
 * and latency (C3) ratios the scorecard consumes. A cross-model reducer is the
 * one shape a per-example `@kbn/evals` evaluator cannot express (a CODE
 * evaluator sees one example at a time and has no view into the other model's
 * runs), which is why this lives as a post-hoc analyzer rather than another
 * entry in `evaluators.ts`.
 */

export interface TokenUsageRow {
  connectorId: string;
  alertId?: string | null;
  stratum?: string | null;
  executionStatus?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  totalTokens?: number | null;
  latencyMs?: number | null;
  agentLatencyMs?: number | null;
}

export interface PriceBasis {
  input: number;
  output: number;
  cached: number;
}

export type PriceBasisMap = Record<string, PriceBasis>;

export const DEFAULT_PRICE_BASIS: PriceBasisMap = {
  'eis-anthropic-claude-4-5-haiku': { input: 1.0, output: 5.0, cached: 0.1 },
  'eis-anthropic-claude-4-5-sonnet': { input: 3.0, output: 15.0, cached: 0.3 },
};

export interface PerModelStats {
  runs: number;
  runsFailed: number;
  meanInputTokens: number | null;
  meanOutputTokens: number | null;
  meanCachedTokens: number | null;
  meanTotalTokens: number | null;
  meanLatencyMs: number | null;
  meanAgentLatencyMs: number | null;
  costPerRunUsd: number | null;
}

export interface Ratios {
  costRatio?: number;
  dearerModel?: string;
  cheaperModel?: string;
  latencyRatio?: number;
  slowerModel?: string;
  fasterModel?: string;
}

export interface StratifiedStats {
  count: number;
  meanLatencyMs: number | null;
}

export interface AnalysisResult {
  totalRows: number;
  priceBasis: PriceBasisMap;
  perModel: Record<string, PerModelStats>;
  ratios: Ratios;
  stratified: Record<string, Record<string, StratifiedStats>>;
}

const mean = (arr: TokenUsageRow[], key: keyof TokenUsageRow): number | null =>
  arr.length === 0
    ? null
    : arr.reduce((sum, r) => sum + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0) /
      arr.length;

export const parseJsonl = (contents: string): TokenUsageRow[] =>
  contents
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as TokenUsageRow);

export const computeTokenUsageAnalysis = (
  rows: TokenUsageRow[],
  priceBasis: PriceBasisMap = DEFAULT_PRICE_BASIS
): AnalysisResult => {
  const byModel = new Map<string, TokenUsageRow[]>();
  for (const r of rows) {
    if (r.totalTokens == null && r.latencyMs == null) continue;
    if (!byModel.has(r.connectorId)) byModel.set(r.connectorId, []);
    byModel.get(r.connectorId)!.push(r);
  }

  const perModel: Record<string, PerModelStats> = {};
  for (const [modelId, modelRows] of byModel) {
    const used = modelRows.filter((r) => r.totalTokens != null);
    const latRows = modelRows.filter((r) => r.latencyMs != null);
    const inT = mean(used, 'inputTokens');
    const outT = mean(used, 'outputTokens');
    const cachedT = mean(used, 'cachedTokens');
    const totalT = mean(used, 'totalTokens');
    const latency = mean(latRows, 'latencyMs');
    const agentLatency = mean(latRows, 'agentLatencyMs');
    const p = priceBasis[modelId];
    let costPerRun: number | null = null;
    if (p && inT != null && outT != null) {
      costPerRun =
        (inT / 1e6) * p.input +
        (outT / 1e6) * p.output +
        ((cachedT ?? 0) / 1e6) * p.cached;
    }
    perModel[modelId] = {
      runs: modelRows.length,
      runsFailed: modelRows.filter((r) => r.executionStatus !== 'succeeded').length,
      meanInputTokens: inT,
      meanOutputTokens: outT,
      meanCachedTokens: cachedT,
      meanTotalTokens: totalT,
      meanLatencyMs: latency,
      meanAgentLatencyMs: agentLatency,
      costPerRunUsd: costPerRun,
    };
  }

  const ratios: Ratios = {};
  const modelIds = Object.keys(perModel);
  if (modelIds.length === 2) {
    const [a, b] = modelIds;
    const costA = perModel[a].costPerRunUsd;
    const costB = perModel[b].costPerRunUsd;
    if (costA != null && costB != null) {
      const dearer = costA >= costB ? a : b;
      const cheaper = dearer === a ? b : a;
      ratios.costRatio = perModel[dearer].costPerRunUsd! / perModel[cheaper].costPerRunUsd!;
      ratios.dearerModel = dearer;
      ratios.cheaperModel = cheaper;
    }
    const latA = perModel[a].meanLatencyMs;
    const latB = perModel[b].meanLatencyMs;
    if (latA != null && latB != null) {
      const faster = latA! <= latB! ? a : b;
      const slower = faster === a ? b : a;
      ratios.latencyRatio = perModel[slower].meanLatencyMs! / perModel[faster].meanLatencyMs!;
      ratios.slowerModel = slower;
      ratios.fasterModel = faster;
    }
  }

  const stratified: Record<string, Record<string, StratifiedStats>> = {};
  for (const [modelId, modelRows] of byModel) {
    const byStrat: Record<string, TokenUsageRow[]> = {};
    for (const r of modelRows) {
      const s = r.stratum ?? 'unknown';
      if (!byStrat[s]) byStrat[s] = [];
      byStrat[s].push(r);
    }
    stratified[modelId] = {};
    for (const [stratum, sRows] of Object.entries(byStrat)) {
      stratified[modelId][stratum] = {
        count: sRows.length,
        meanLatencyMs: mean(sRows, 'latencyMs'),
      };
    }
  }

  return { totalRows: rows.length, priceBasis, perModel, ratios, stratified };
};
