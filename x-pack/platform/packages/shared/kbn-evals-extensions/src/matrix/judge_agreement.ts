/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Judge-agreement analysis: does a matrix score describe the model, or the
 * judge that graded it?
 *
 * Every persona-matrix score doc carries the judge in `evaluator_model` (per
 * request) and `evaluator.model` (per score). When the same task model, example
 * and evaluator have been graded by more than one judge, the disagreement
 * between those judges is a lower bound on how much of the published number is
 * an artefact of judge choice rather than model capability.
 *
 * Measured context (2026-08-23, golden cluster, 916 multi-rep cells): judge-graded
 * evaluators change across mere repetitions on 84.1% of cells, versus 15.8% for
 * contract evaluators. Judge *identity* is a second, independent source of
 * variance on top of that, and it is invisible in a single-judge sweep.
 */

/** One score as stored on the golden cluster, narrowed to what this analysis reads. */
export interface JudgedScore {
  taskModelId: string;
  exampleId: string;
  evaluatorName: string;
  /** The judge that produced this score. */
  judgeModelId: string;
  score: number;
}

export interface JudgeDisagreement {
  taskModelId: string;
  exampleId: string;
  evaluatorName: string;
  /** Mean score per judge, keyed by judge model id. */
  scoreByJudge: Record<string, number>;
  /** max - min across judges. */
  spread: number;
}

export interface JudgeAgreementReport {
  /** Judges seen anywhere in the input. */
  judges: string[];
  /** Cells (task model × example × evaluator) graded by >1 judge. */
  comparableCells: number;
  /** Comparable cells where judges did not agree exactly. */
  disagreeingCells: number;
  /** disagreeingCells / comparableCells, or 0 when nothing is comparable. */
  disagreementRate: number;
  /** Mean spread across comparable cells. */
  meanSpread: number;
  /** Worst offenders first. */
  disagreements: JudgeDisagreement[];
  /**
   * Per-evaluator disagreement rate, worst first. Judge choice does not affect
   * every evaluator equally — contract evaluators should be near zero, and a
   * high rate there indicates a broken evaluator rather than judge subjectivity.
   */
  byEvaluator: Array<{ evaluatorName: string; cells: number; disagreeing: number; rate: number }>;
}

const cellKey = (s: JudgedScore) => `${s.taskModelId}\u0000${s.exampleId}\u0000${s.evaluatorName}`;

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Groups scores into cells, keeps those graded by more than one judge, and
 * reports how often — and how far — the judges disagree.
 *
 * A cell graded by a single judge is not evidence of agreement, so it is
 * excluded from every rate rather than counted as agreeing.
 */
export function analyzeJudgeAgreement(scores: JudgedScore[]): JudgeAgreementReport {
  const byCell = new Map<string, Map<string, number[]>>();

  for (const score of scores) {
    if (!Number.isFinite(score.score)) {
      continue;
    }
    const key = cellKey(score);
    const perJudge = byCell.get(key) ?? new Map<string, number[]>();
    const samples = perJudge.get(score.judgeModelId) ?? [];
    samples.push(score.score);
    perJudge.set(score.judgeModelId, samples);
    byCell.set(key, perJudge);
  }

  const judges = [...new Set(scores.map((s) => s.judgeModelId))].sort();
  const disagreements: JudgeDisagreement[] = [];
  const evaluatorTally = new Map<string, { cells: number; disagreeing: number }>();
  let comparableCells = 0;
  let spreadTotal = 0;

  for (const [key, perJudge] of byCell) {
    if (perJudge.size < 2) {
      continue;
    }
    const [taskModelId, exampleId, evaluatorName] = key.split('\u0000');
    const scoreByJudge = Object.fromEntries(
      [...perJudge.entries()].map(([judge, samples]) => [judge, mean(samples)])
    );
    const values = Object.values(scoreByJudge);
    const spread = Math.max(...values) - Math.min(...values);

    comparableCells += 1;
    spreadTotal += spread;

    const tally = evaluatorTally.get(evaluatorName) ?? { cells: 0, disagreeing: 0 };
    tally.cells += 1;
    if (spread > 0) {
      tally.disagreeing += 1;
      disagreements.push({ taskModelId, exampleId, evaluatorName, scoreByJudge, spread });
    }
    evaluatorTally.set(evaluatorName, tally);
  }

  disagreements.sort((a, b) => b.spread - a.spread);

  const byEvaluator = [...evaluatorTally.entries()]
    .map(([evaluatorName, { cells, disagreeing }]) => ({
      evaluatorName,
      cells,
      disagreeing,
      rate: disagreeing / cells,
    }))
    .sort((a, b) => b.rate - a.rate || b.cells - a.cells);

  return {
    judges,
    comparableCells,
    disagreeingCells: disagreements.length,
    disagreementRate: comparableCells === 0 ? 0 : disagreements.length / comparableCells,
    meanSpread: comparableCells === 0 ? 0 : spreadTotal / comparableCells,
    disagreements,
    byEvaluator,
  };
}
