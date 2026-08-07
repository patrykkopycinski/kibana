/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  MatrixColumnConfig,
  MatrixCompositeConfig,
  MatrixConfig,
  MatrixModelConfig,
} from './load_matrix_config';
import type { AggregatedModelScores } from './query_matrix_scores';

/** A single matrix cell: either a numeric 0-10 score or "Not recommended". */
export type MatrixCell =
  | { kind: 'score'; value: number }
  | { kind: 'not-recommended' }
  | { kind: 'missing' };

/** Synthetic id for the legacy single "Overall" column. */
export const OVERALL_COLUMN_ID = '__overall__';

/** A column as rendered, left-to-right, including derived composite columns. */
export interface MatrixDisplayColumn {
  id: string;
  label: string;
  group?: string;
  kind: 'base' | 'composite' | 'overall';
}

export interface MatrixRow {
  modelId: string;
  modelLabel: string;
  openSource: boolean;
  /** Column/composite id -> cell. */
  cells: Record<string, MatrixCell>;
  overall: MatrixCell;
}

/** Aggregated token magnitudes for one (model, column) pair, in native units. */
export interface TokenCostCell {
  /** Base column id (matches `MatrixDisplayColumn.id`). */
  columnId: string;
  inputTokens?: TokenStat;
  outputTokens?: TokenStat;
  /** Sum of the input + output means; `undefined` when neither is present. */
  totalMean?: number;
}

export interface TokenStat {
  mean: number;
  min: number;
  max: number;
  count: number;
}

export interface TokenCostModel {
  modelId: string;
  modelLabel: string;
  openSource: boolean;
  cells: TokenCostCell[];
}

export interface Matrix {
  columns: Array<{ id: string; label: string; group?: string }>;
  composites?: Array<{ id: string; label: string; group?: string }>;
  /** Full ordered render list (base + composite + legacy overall). */
  displayColumns?: MatrixDisplayColumn[];
  overallLabel: string;
  proprietary: MatrixRow[];
  openSource: MatrixRow[];
  /** Present only when the config opts into the token axis. */
  tokenCost?: { models: TokenCostModel[] };
}

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const matchesModel = (modelConfig: MatrixModelConfig, modelId: string): boolean =>
  modelConfig.id === modelId || (modelConfig.matchIds?.includes(modelId) ?? false);

/** True when an evaluator name matches any exclusion entry by prefix. */
const isExcludedEvaluator = (evaluatorName: string, excluded: readonly string[]): boolean =>
  excluded.some((entry) => evaluatorName === entry || evaluatorName.startsWith(entry));

/**
 * Computes the weighted mean (by sample count) of the evaluator scores that map
 * to a column for a given model. Returns `undefined` when no scores contribute.
 */
const computeColumnMean = (
  modelScores: AggregatedModelScores,
  column: MatrixColumnConfig,
  excludeEvaluators: readonly string[]
): number | undefined => {
  const suiteSet = new Set(column.suites);
  const datasetSet = column.datasetIds ? new Set(column.datasetIds) : undefined;
  const evaluatorSet = column.evaluators ? new Set(column.evaluators) : undefined;

  let weightedSum = 0;
  let totalCount = 0;
  let contributing = 0;

  for (const suite of modelScores.suites) {
    if (!suiteSet.has(suite.suiteId)) {
      continue;
    }
    for (const dataset of suite.datasets) {
      if (datasetSet && !datasetSet.has(dataset.datasetId)) {
        continue;
      }
      for (const evaluator of dataset.evaluators) {
        if (evaluatorSet && !evaluatorSet.has(evaluator.evaluatorName)) {
          continue;
        }
        // A column may opt into an explicit evaluator allowlist; otherwise the
        // global exclusion list (observability-tier evaluators by default) drops
        // raw-magnitude evaluators that would blow out the 0-10 scale.
        if (!evaluatorSet && isExcludedEvaluator(evaluator.evaluatorName, excludeEvaluators)) {
          continue;
        }
        // Weight by sample count so larger datasets dominate, but fall back to an
        // unweighted contribution when a dataset reports a zero count.
        const weight = evaluator.count > 0 ? evaluator.count : 1;
        weightedSum += evaluator.mean * weight;
        totalCount += weight;
        contributing += 1;
      }
    }
  }

  if (contributing === 0 || totalCount === 0) {
    return undefined;
  }

  return weightedSum / totalCount;
};

const buildCell = (
  mean: number | undefined,
  column: MatrixColumnConfig,
  config: MatrixConfig
): MatrixCell => {
  if (mean === undefined) {
    return { kind: 'missing' };
  }

  const scale = column.scale ?? config.defaultScale;
  const scaled = roundTo(mean * scale, config.decimals);

  if (scaled <= config.notRecommendedBelow) {
    return { kind: 'not-recommended' };
  }

  return { kind: 'score', value: scaled };
};

const computeOverall = (cells: Record<string, MatrixCell>, config: MatrixConfig): MatrixCell => {
  let weightedSum = 0;
  let totalWeight = 0;
  let hasAnyData = false;

  for (const column of config.columns) {
    const cell = cells[column.id];
    if (!cell || cell.kind === 'missing') {
      continue;
    }

    hasAnyData = true;
    const weight = config.overall.mode === 'weighted' ? column.weight : 1;

    if (cell.kind === 'not-recommended') {
      if (config.notRecommendedCountsAsZeroInOverall) {
        totalWeight += weight;
      }
      continue;
    }

    weightedSum += cell.value * weight;
    totalWeight += weight;
  }

  if (!hasAnyData || totalWeight === 0) {
    return { kind: 'missing' };
  }

  const value = roundTo(weightedSum / totalWeight, config.decimals);
  if (value <= config.notRecommendedBelow) {
    return { kind: 'not-recommended' };
  }
  return { kind: 'score', value };
};

/**
 * Computes a composite cell as the equal-weighted mean of its referenced cells.
 * Mirrors {@link computeOverall}: "Not recommended" sources contribute 0 (when
 * configured) and missing sources are skipped, so a composite reflects the data
 * that exists rather than being dragged to "missing" by not-yet-wired columns.
 */
const computeComposite = (
  cells: Record<string, MatrixCell>,
  composite: MatrixCompositeConfig,
  config: MatrixConfig
): MatrixCell => {
  let sum = 0;
  let count = 0;
  let hasAnyData = false;

  for (const refId of composite.from) {
    const cell = cells[refId];
    if (!cell || cell.kind === 'missing') {
      continue;
    }

    hasAnyData = true;

    if (cell.kind === 'not-recommended') {
      if (config.notRecommendedCountsAsZeroInOverall) {
        count += 1;
      }
      continue;
    }

    sum += cell.value;
    count += 1;
  }

  if (!hasAnyData || count === 0) {
    return { kind: 'missing' };
  }

  const value = roundTo(sum / count, config.decimals);
  if (value <= config.notRecommendedBelow) {
    return { kind: 'not-recommended' };
  }
  return { kind: 'score', value };
};

/** Resolves the left-to-right render order of base + composite (+ overall) columns. */
const buildDisplayColumns = (config: MatrixConfig): MatrixDisplayColumn[] => {
  const baseById = new Map(config.columns.map((column) => [column.id, column]));
  const compositeById = new Map(config.composites.map((composite) => [composite.id, composite]));

  let ordered: MatrixDisplayColumn[];
  if (config.layout) {
    ordered = config.layout.map((id): MatrixDisplayColumn => {
      const base = baseById.get(id);
      if (base) {
        return { id, label: base.label, group: base.group, kind: 'base' };
      }
      const composite = compositeById.get(id);
      if (composite) {
        return { id, label: composite.label, group: composite.group, kind: 'composite' };
      }
      throw new Error(`Matrix config "layout" references unknown column/composite id: "${id}"`);
    });
  } else {
    ordered = [
      ...config.columns.map(
        (column): MatrixDisplayColumn => ({
          id: column.id,
          label: column.label,
          group: column.group,
          kind: 'base',
        })
      ),
      ...config.composites.map(
        (composite): MatrixDisplayColumn => ({
          id: composite.id,
          label: composite.label,
          group: composite.group,
          kind: 'composite',
        })
      ),
    ];
  }

  if (config.showOverall) {
    ordered.push({ id: OVERALL_COLUMN_ID, label: config.overall.label, kind: 'overall' });
  }

  return ordered;
};

/**
 * Aggregates the raw-magnitude token evaluators for one (model, column) pair.
 *
 * Deliberately parallel to {@link computeColumnMean} rather than reusing it: the
 * quality path scales its mean by `defaultScale` and collapses everything into a
 * single number, whereas the token axis must stay in native units and preserve
 * the observed min/max spread. Values are weighted by sample count so a column
 * spanning suites of unequal size reports a true per-task mean.
 */
const computeTokenStat = (
  modelScores: AggregatedModelScores,
  column: MatrixColumnConfig,
  evaluatorPrefix: string
): TokenStat | undefined => {
  const suiteSet = new Set(column.suites);
  const datasetSet = column.datasetIds ? new Set(column.datasetIds) : undefined;

  let weightedSum = 0;
  let totalCount = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let contributing = 0;

  for (const suite of modelScores.suites) {
    if (!suiteSet.has(suite.suiteId)) {
      continue;
    }
    for (const dataset of suite.datasets) {
      if (datasetSet && !datasetSet.has(dataset.datasetId)) {
        continue;
      }
      for (const evaluator of dataset.evaluators) {
        if (
          evaluator.evaluatorName !== evaluatorPrefix &&
          !evaluator.evaluatorName.startsWith(evaluatorPrefix)
        ) {
          continue;
        }
        const weight = evaluator.count > 0 ? evaluator.count : 1;
        weightedSum += evaluator.mean * weight;
        totalCount += weight;
        // `min`/`max` are the per-experiment extremes reported by the stats API;
        // fall back to the mean when a stats payload omits them.
        min = Math.min(min, evaluator.min ?? evaluator.mean);
        max = Math.max(max, evaluator.max ?? evaluator.mean);
        contributing += 1;
      }
    }
  }

  if (contributing === 0 || totalCount === 0) {
    return undefined;
  }

  return { mean: weightedSum / totalCount, min, max, count: totalCount };
};

/**
 * Pure transform from aggregated eval scores + config into a renderable matrix.
 * Models are emitted in config order; models absent from the data are skipped.
 */
export const buildMatrix = (aggregated: AggregatedModelScores[], config: MatrixConfig): Matrix => {
  const byModelId = new Map(aggregated.map((entry) => [entry.modelId, entry]));

  const proprietary: MatrixRow[] = [];
  const openSource: MatrixRow[] = [];

  for (const modelConfig of config.models) {
    const modelScores =
      byModelId.get(modelConfig.id) ??
      aggregated.find((entry) => matchesModel(modelConfig, entry.modelId));

    if (!modelScores) {
      continue;
    }

    const cells: Record<string, MatrixCell> = {};
    for (const column of config.columns) {
      cells[column.id] = buildCell(
        computeColumnMean(modelScores, column, config.excludeEvaluators),
        column,
        config
      );
    }

    // Composites are computed in declared order so a later composite can
    // reference the cell of an earlier one (e.g. Overall Score <- Agent Builder
    // Score). References resolve against base cells plus composites computed so
    // far; an unresolved reference simply contributes nothing (treated missing).
    for (const composite of config.composites) {
      cells[composite.id] = computeComposite(cells, composite, config);
    }

    const row: MatrixRow = {
      modelId: modelConfig.id,
      modelLabel: modelConfig.label,
      openSource: modelConfig.openSource,
      cells,
      overall: computeOverall(cells, config),
    };

    (modelConfig.openSource ? openSource : proprietary).push(row);
  }

  // Rank by the final composite (e.g. Overall Score) when composites exist,
  // otherwise by the legacy Overall column.
  const primaryId =
    config.composites.length > 0
      ? config.composites[config.composites.length - 1].id
      : OVERALL_COLUMN_ID;

  const sortValue = (row: MatrixRow): number => {
    const cell = primaryId === OVERALL_COLUMN_ID ? row.overall : row.cells[primaryId];
    return cell && cell.kind === 'score' ? cell.value : -1;
  };

  const sortByPrimaryDesc = (a: MatrixRow, b: MatrixRow): number => sortValue(b) - sortValue(a);

  // Token axis: opt-in, computed over base columns only (composites are derived
  // quality scores and have no meaningful token aggregate).
  let tokenCost: { models: TokenCostModel[] } | undefined;
  if (config.tokenCost) {
    const tokenColumnIds = config.tokenCost.columns;
    const tokenColumns = tokenColumnIds
      ? config.columns.filter((column) => tokenColumnIds.includes(column.id))
      : config.columns;

    const models: TokenCostModel[] = [];
    for (const modelConfig of config.models) {
      const modelScores =
        byModelId.get(modelConfig.id) ??
        aggregated.find((entry) => matchesModel(modelConfig, entry.modelId));
      if (!modelScores) {
        continue;
      }

      const cells: TokenCostCell[] = [];
      for (const column of tokenColumns) {
        const inputTokens = computeTokenStat(modelScores, column, config.tokenCost.inputEvaluator);
        const outputTokens = computeTokenStat(
          modelScores,
          column,
          config.tokenCost.outputEvaluator
        );
        if (!inputTokens && !outputTokens) {
          continue;
        }
        cells.push({
          columnId: column.id,
          inputTokens,
          outputTokens,
          totalMean: (inputTokens?.mean ?? 0) + (outputTokens?.mean ?? 0),
        });
      }

      if (cells.length > 0) {
        models.push({
          modelId: modelConfig.id,
          modelLabel: modelConfig.label,
          openSource: modelConfig.openSource,
          cells,
        });
      }
    }
    tokenCost = { models };
  }

  return {
    columns: config.columns.map((column) => ({
      id: column.id,
      label: column.label,
      group: column.group,
    })),
    composites: config.composites.map((composite) => ({
      id: composite.id,
      label: composite.label,
      group: composite.group,
    })),
    displayColumns: buildDisplayColumns(config),
    overallLabel: config.overall.label,
    proprietary: proprietary.sort(sortByPrimaryDesc),
    openSource: openSource.sort(sortByPrimaryDesc),
    ...(tokenCost ? { tokenCost } : {}),
  };
};
