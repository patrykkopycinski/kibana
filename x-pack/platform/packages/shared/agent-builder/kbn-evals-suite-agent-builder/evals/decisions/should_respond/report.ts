/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BinaryMetrics, McNemarResult, SweepRow } from '../lib/stats';
import { binaryMetrics, mcnemar, percentile, pickThreshold, thresholdSweep } from '../lib/stats';
import type { Split } from './dataset';

/** The shipped `agentBuilder.decisionModel.triggerThreshold` default. */
export const DEFAULT_TRIGGER_THRESHOLD = 0.5;

export interface ArmPrediction {
  id: string;
  /** Probability that the agent should respond. Constants use exactly 0 or 1. */
  probability: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  /** Model the provider reports it served; absent for constants. */
  servedModel?: string;
}

export interface ReportItem {
  id: string;
  label: boolean;
  split: Split;
  ambiguous: boolean;
}

export interface ArmReport {
  arm: string;
  /** False for constants: they have no threshold to fit. */
  fitted: boolean;
  fittedThreshold: number;
  trainSweep: SweepRow[];
  testAtDefault: BinaryMetrics;
  testAtFitted: BinaryMetrics;
  ambiguousAtFitted?: BinaryMetrics;
  usage: {
    calls: number;
    inputTokensPerCall: number;
    outputTokensPerCall: number;
    costUsdTotal: number;
    costUsdPerCall: number;
    latencyP50Ms?: number;
    latencyP95Ms?: number;
  };
}

export interface PairedComparison {
  a: string;
  b: string;
  result: McNemarResult;
}

export interface ShouldRespondReport {
  population: { train: number; test: number; ambiguous: number; testPositives: number };
  majorityControl: { label: boolean; testAccuracy: BinaryMetrics };
  arms: ArmReport[];
  /** Every pair of arms on the held-out test items, each at its own fitted threshold. */
  comparisons: PairedComparison[];
}

const CONSTANT_PROBABILITIES = new Set([0, 1]);

const select = (
  items: readonly ReportItem[],
  byId: Map<string, ArmPrediction>,
  filter: (item: ReportItem) => boolean,
  arm: string
) => {
  const selected = items.filter(filter);
  const probabilities = selected.map(({ id }) => {
    const prediction = byId.get(id);
    if (!prediction) {
      throw new Error(`arm [${arm}] has no prediction for [${id}]; arms must cover one population`);
    }
    return prediction.probability;
  });
  return { labels: selected.map(({ label }) => label), probabilities };
};

const isHeadlineTest = ({ split, ambiguous }: ReportItem) => split === 'test' && !ambiguous;
const isHeadlineTrain = ({ split, ambiguous }: ReportItem) => split === 'train' && !ambiguous;

export const buildArmReport = (
  arm: string,
  items: readonly ReportItem[],
  predictions: readonly ArmPrediction[]
): ArmReport => {
  const byId = new Map(predictions.map((prediction) => [prediction.id, prediction]));
  if (byId.size !== items.length) {
    throw new Error(`arm [${arm}] covers ${byId.size} items, dataset has ${items.length}`);
  }
  const train = select(items, byId, isHeadlineTrain, arm);
  const test = select(items, byId, isHeadlineTest, arm);
  const ambiguous = select(items, byId, ({ ambiguous: isAmbiguous }) => isAmbiguous, arm);

  const fitted = !predictions.every(({ probability }) => CONSTANT_PROBABILITIES.has(probability));
  const trainSweep = thresholdSweep(train.probabilities, train.labels);
  const fittedThreshold = fitted
    ? pickThreshold(trainSweep, DEFAULT_TRIGGER_THRESHOLD).threshold
    : DEFAULT_TRIGGER_THRESHOLD;
  const at = (threshold: number, probabilities: number[]) =>
    probabilities.map((probability) => probability >= threshold);

  const latencies = predictions.map(({ latencyMs }) => latencyMs).filter((ms) => ms > 0);
  const totals = predictions.reduce(
    (sum, { inputTokens, outputTokens, costUsd }) => ({
      inputTokens: sum.inputTokens + inputTokens,
      outputTokens: sum.outputTokens + outputTokens,
      costUsd: sum.costUsd + costUsd,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 }
  );
  const calls = predictions.length;

  return {
    arm,
    fitted,
    fittedThreshold,
    trainSweep,
    testAtDefault: binaryMetrics(at(DEFAULT_TRIGGER_THRESHOLD, test.probabilities), test.labels),
    testAtFitted: binaryMetrics(at(fittedThreshold, test.probabilities), test.labels),
    ...(ambiguous.labels.length > 0
      ? {
          ambiguousAtFitted: binaryMetrics(
            at(fittedThreshold, ambiguous.probabilities),
            ambiguous.labels
          ),
        }
      : {}),
    usage: {
      calls,
      inputTokensPerCall: calls ? totals.inputTokens / calls : 0,
      outputTokensPerCall: calls ? totals.outputTokens / calls : 0,
      costUsdTotal: totals.costUsd,
      costUsdPerCall: calls ? totals.costUsd / calls : 0,
      latencyP50Ms: percentile(latencies, 50),
      latencyP95Ms: percentile(latencies, 95),
    },
  };
};

const testCorrectness = (
  items: readonly ReportItem[],
  predictions: readonly ArmPrediction[],
  threshold: number
): boolean[] => {
  const byId = new Map(predictions.map((prediction) => [prediction.id, prediction]));
  return items.filter(isHeadlineTest).map((item) => {
    const probability = byId.get(item.id)?.probability;
    if (probability === undefined) throw new Error(`missing prediction for [${item.id}]`);
    return probability >= threshold === item.label;
  });
};

export const buildShouldRespondReport = (
  items: readonly ReportItem[],
  armPredictions: Record<string, readonly ArmPrediction[]>
): ShouldRespondReport => {
  const arms = Object.entries(armPredictions).map(([arm, predictions]) =>
    buildArmReport(arm, items, predictions)
  );

  const trainItems = items.filter(isHeadlineTrain);
  const testItems = items.filter(isHeadlineTest);
  const trainPositives = trainItems.filter(({ label }) => label).length;
  const majorityLabel = trainPositives * 2 > trainItems.length;
  const testLabels = testItems.map(({ label }) => label);

  const comparisons: PairedComparison[] = [];
  arms.forEach((a, i) => {
    arms.slice(i + 1).forEach((b) => {
      comparisons.push({
        a: a.arm,
        b: b.arm,
        result: mcnemar(
          testCorrectness(items, armPredictions[a.arm], a.fittedThreshold),
          testCorrectness(items, armPredictions[b.arm], b.fittedThreshold)
        ),
      });
    });
  });

  return {
    population: {
      train: trainItems.length,
      test: testItems.length,
      ambiguous: items.filter(({ ambiguous }) => ambiguous).length,
      testPositives: testLabels.filter(Boolean).length,
    },
    majorityControl: {
      label: majorityLabel,
      testAccuracy: binaryMetrics(
        testLabels.map(() => majorityLabel),
        testLabels
      ),
    },
    arms,
    comparisons,
  };
};

const pct = (value: number | undefined) =>
  value === undefined ? 'n/a' : `${(value * 100).toFixed(1)}%`;
const ci = ({ accuracyCi }: BinaryMetrics) => `[${pct(accuracyCi.low)}, ${pct(accuracyCi.high)}]`;
const ms = (value: number | undefined) => (value === undefined ? 'n/a' : `${Math.round(value)}`);

export const renderShouldRespondMarkdown = (
  report: ShouldRespondReport,
  { title, provenance }: { title: string; provenance: string[] }
): string => {
  const { population, majorityControl, arms, comparisons } = report;
  const lines = [
    `# ${title}`,
    '',
    ...provenance.map((line) => `- ${line}`),
    '',
    `Population: ${population.train} train / ${population.test} test (${population.testPositives} positive), ` +
      `ambiguous items reported separately (${population.ambiguous}). Thresholds fit on train only, ` +
      `0.05 grid, ties toward ${DEFAULT_TRIGGER_THRESHOLD}.`,
    '',
    `Majority control (train majority = ${majorityControl.label ? 'respond' : 'silent'}): ` +
      `test accuracy ${pct(majorityControl.testAccuracy.accuracy)} ${ci(
        majorityControl.testAccuracy
      )}.`,
    '',
    '## Held-out test',
    '',
    '| arm | threshold | n | pass | accuracy (95% Wilson) | balanced acc | recall | specificity | acc @0.5 | in tok/call | out tok/call | $/call | $ total | p50 ms | p95 ms |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...arms
      .map(({ arm, fitted, fittedThreshold, testAtFitted: m, testAtDefault, usage }) =>
        [
          arm,
          fitted ? fittedThreshold.toFixed(2) : 'constant',
          m.n,
          m.tp + m.tn,
          `${pct(m.accuracy)} ${ci(m)}`,
          pct(m.balancedAccuracy),
          pct(m.recall),
          pct(m.specificity),
          pct(testAtDefault.accuracy),
          usage.inputTokensPerCall.toFixed(0),
          usage.outputTokensPerCall.toFixed(0),
          usage.costUsdPerCall.toFixed(6),
          usage.costUsdTotal.toFixed(4),
          ms(usage.latencyP50Ms),
          ms(usage.latencyP95Ms),
        ].join(' | ')
      )
      .map((row) => `| ${row} |`),
    '',
    '## Paired comparisons (McNemar on test, each arm at its fitted threshold)',
    '',
    '| A | B | only A right | only B right | chi2 (cc) | exact p |',
    '|---|---|---|---|---|---|',
    ...comparisons.map(
      ({ a, b, result }) =>
        `| ${a} | ${b} | ${result.onlyA} | ${result.onlyB} | ${result.chi2.toFixed(
          3
        )} | ${result.exactP.toFixed(4)} |`
    ),
    '',
    '## Ambiguous items (not in the headline)',
    '',
    '| arm | n | accuracy |',
    '|---|---|---|',
    ...arms.map(
      ({ arm, ambiguousAtFitted }) =>
        `| ${arm} | ${ambiguousAtFitted?.n ?? 0} | ${pct(ambiguousAtFitted?.accuracy)} |`
    ),
    '',
    '## Train threshold sweep (balanced accuracy)',
    '',
    `| threshold | ${arms
      .filter(({ fitted }) => fitted)
      .map(({ arm }) => arm)
      .join(' | ')} |`,
    `|---|${arms
      .filter(({ fitted }) => fitted)
      .map(() => '---')
      .join('|')}|`,
    ...(arms.find(({ fitted }) => fitted)?.trainSweep ?? []).map(
      ({ threshold }, index) =>
        `| ${threshold.toFixed(2)} | ${arms
          .filter(({ fitted }) => fitted)
          .map(({ trainSweep }) => pct(trainSweep[index].metrics.balancedAccuracy))
          .join(' | ')} |`
    ),
    '',
  ];
  return lines.join('\n');
};
