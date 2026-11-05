/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { McNemarResult, RateWithCi } from '../lib/stats';
import {
  assertRate,
  assertRateFields,
  binaryMetrics,
  mcnemar,
  noiseBandCount,
  percentile,
  rateWithCi,
  rocAuc,
  sweepThresholds,
} from '../lib/stats';
import type { CatalogSkill, RoutingView } from './catalog';
import type { ArmKind, RoutedPrediction, RoutingItem } from './cascade';
import { ARM_KINDS, ARMS, DEFAULT_GATE_THRESHOLD } from './cascade';

export const TOP_K = [1, 3, 5] as const;
/** The incumbent pre-selection surfaces at most this many skills (select_relevant_skills). */
export const INCUMBENT_MAX_SKILLS = 5;

type ErrorClass = 'wrongSkill' | 'falseAbstain' | 'falseRoute';

export interface ArmMetrics {
  arm: string;
  kind: ArmKind;
  /** Rows with an expected skill: correct when not abstained and the skill is in the top k. */
  routed: Record<`top${(typeof TOP_K)[number]}`, RateWithCi>;
  /** Rows where no skill should load: correct when the arm abstains. */
  abstain: RateWithCi;
  /** All headline rows: top-1 routing or correct abstention. */
  endToEnd: RateWithCi;
  ambiguousTop1?: RateWithCi;
  ambiguousTop3?: RateWithCi;
  errors: {
    total: number;
    byClass: Record<ErrorClass, number>;
    dominant?: ErrorClass;
    dominantShare?: number;
    /** Wrong-skill errors whose pick sits in the expected skill's domain. */
    wrongSkillSameDomain: number;
  };
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

export interface GateSweepRow {
  threshold: number;
  balancedAccuracy: number;
  /** Gate scores within +/-0.05 of the threshold: they can flip between runs. */
  noiseBand: number;
}

export interface GateAnalysis {
  arm: string;
  /** Mean gate score and share above the default threshold, per query class. */
  firing: Record<string, { n: number; meanScore: number; fireRate: number }>;
  auc?: number;
  sweep: GateSweepRow[];
  /** Thresholds where the best balanced accuracy is within one noise band of the top. */
  bestRange: { low: number; high: number; balancedAccuracy: number };
  /** Rule 20: a gate that fires on most no-skill queries carries no signal. */
  degenerate: boolean;
}

export interface Comparison {
  a: string;
  b: string;
  metric: 'endToEnd' | 'routedTop1';
  result: McNemarResult;
}

export interface PathDecision {
  path: string;
  adopted: boolean;
  metric: 'endToEnd';
  value: number;
  baseline: string;
  baselineValue: number;
  failureMode?: string;
}

export interface ViewReport {
  view: RoutingView;
  answerSpace: number;
  candidateListSizes: number[];
  population: {
    headline: number;
    routed: number;
    abstain: number;
    abstainFromBenchmark: number;
    ambiguous: number;
  };
  arms: ArmMetrics[];
  gates: GateAnalysis[];
  comparisons: Comparison[];
  decisions: PathDecision[];
}

const isHeadline = ({ ambiguous }: RoutingItem) => !ambiguous;

const hit = (prediction: RoutedPrediction, expected: string, k: number) =>
  !prediction.abstained && prediction.ranked.slice(0, k).includes(expected);

const endToEndCorrect = (prediction: RoutedPrediction, item: RoutingItem) =>
  item.expected === null ? prediction.abstained : hit(prediction, item.expected, 1);

const classify = (prediction: RoutedPrediction, item: RoutingItem): ErrorClass | undefined => {
  if (endToEndCorrect(prediction, item)) return undefined;
  if (item.expected === null) return 'falseRoute';
  return prediction.abstained ? 'falseAbstain' : 'wrongSkill';
};

const indexPredictions = (
  arm: string,
  items: readonly RoutingItem[],
  predictions: readonly RoutedPrediction[]
) => {
  const byId = new Map(predictions.map((prediction) => [prediction.id, prediction]));
  if (byId.size !== items.length || items.some(({ id }) => !byId.has(id))) {
    throw new Error(`arm [${arm}] covers ${byId.size} items, view has ${items.length}`);
  }
  return (id: string) => byId.get(id) as RoutedPrediction;
};

export const buildArmMetrics = (
  arm: string,
  items: readonly RoutingItem[],
  predictions: readonly RoutedPrediction[],
  skills: readonly CatalogSkill[]
): ArmMetrics => {
  const get = indexPredictions(arm, items, predictions);
  const domains = new Map(skills.map(({ id, domain }) => [id, domain]));
  const headline = items.filter(isHeadline);
  const routedItems = headline.filter(({ expected }) => expected !== null);
  const abstainItems = headline.filter(({ expected }) => expected === null);
  const ambiguousItems = items.filter(({ ambiguous, expected }) => ambiguous && expected !== null);
  const countHits = (subset: readonly RoutingItem[], k: number) =>
    subset.filter((item) => hit(get(item.id), item.expected as string, k)).length;

  const byClass: Record<ErrorClass, number> = { wrongSkill: 0, falseAbstain: 0, falseRoute: 0 };
  let wrongSkillSameDomain = 0;
  for (const item of headline) {
    const prediction = get(item.id);
    const errorClass = classify(prediction, item);
    if (!errorClass) continue;
    byClass[errorClass]++;
    if (
      errorClass === 'wrongSkill' &&
      domains.get(prediction.ranked[0]) === domains.get(item.expected as string)
    ) {
      wrongSkillSameDomain++;
    }
  }
  const total = byClass.wrongSkill + byClass.falseAbstain + byClass.falseRoute;
  const [dominant, dominantCount] = (Object.entries(byClass) as Array<[ErrorClass, number]>).sort(
    ([a, ca], [b, cb]) => cb - ca || a.localeCompare(b)
  )[0];

  const latencies = predictions.map(({ latencyMs }) => latencyMs).filter((ms) => ms > 0);
  const totals = predictions.reduce(
    (sum, { inputTokens, outputTokens, costUsd }) => ({
      inputTokens: sum.inputTokens + inputTokens,
      outputTokens: sum.outputTokens + outputTokens,
      costUsd: sum.costUsd + costUsd,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 }
  );
  const calls = predictions.filter(
    ({ costUsd, inputTokens }) => costUsd > 0 || inputTokens > 0
  ).length;

  return {
    arm,
    kind: ARM_KINDS[arm] ?? 'model',
    routed: {
      top1: rateWithCi(countHits(routedItems, 1), routedItems.length, `${arm}.top1`),
      top3: rateWithCi(countHits(routedItems, 3), routedItems.length, `${arm}.top3`),
      top5: rateWithCi(countHits(routedItems, 5), routedItems.length, `${arm}.top5`),
    },
    abstain: rateWithCi(
      abstainItems.filter(({ id }) => get(id).abstained).length,
      abstainItems.length,
      `${arm}.abstain`
    ),
    endToEnd: rateWithCi(
      headline.filter((item) => endToEndCorrect(get(item.id), item)).length,
      headline.length,
      `${arm}.endToEnd`
    ),
    ...(ambiguousItems.length > 0
      ? {
          ambiguousTop1: rateWithCi(
            countHits(ambiguousItems, 1),
            ambiguousItems.length,
            `${arm}.ambiguousTop1`
          ),
          ambiguousTop3: rateWithCi(
            countHits(ambiguousItems, 3),
            ambiguousItems.length,
            `${arm}.ambiguousTop3`
          ),
        }
      : {}),
    errors: {
      total,
      byClass,
      ...(total > 0
        ? { dominant, dominantShare: assertRate(dominantCount / total, `${arm}.dominantShare`) }
        : {}),
      wrongSkillSameDomain,
    },
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

/** Above this share of no-skill queries passing the gate, the gate is not a signal. */
export const DEGENERATE_GATE_FIRE_RATE = 0.8;

export const analyseGate = (
  arm: string,
  items: readonly RoutingItem[],
  predictions: readonly RoutedPrediction[]
): GateAnalysis | undefined => {
  const get = indexPredictions(arm, items, predictions);
  const headline = items.filter(isHeadline);
  const scored = headline.map((item) => ({ item, score: get(item.id).gateScore }));
  if (scored.some(({ score }) => score === undefined)) return undefined;
  const scores = scored as Array<{ item: RoutingItem; score: number }>;

  const classOf = ({ source, queryType, expected }: RoutingItem) =>
    source === 'control'
      ? 'control (no skill)'
      : expected === null
      ? 'benchmark no-skill'
      : queryType;
  const firing: GateAnalysis['firing'] = {};
  for (const { item, score } of scores) {
    const key = classOf(item);
    const entry = firing[key] ?? { n: 0, meanScore: 0, fireRate: 0 };
    entry.meanScore += score;
    entry.fireRate += score >= DEFAULT_GATE_THRESHOLD ? 1 : 0;
    entry.n++;
    firing[key] = entry;
  }
  for (const [key, entry] of Object.entries(firing)) {
    firing[key] = {
      n: entry.n,
      meanScore: entry.meanScore / entry.n,
      fireRate: assertRate(entry.fireRate / entry.n, `${arm}.firing.${key}`),
    };
  }

  const labels = scores.map(({ item }) => item.expected !== null);
  const values = scores.map(({ score }) => score);
  const sweep = sweepThresholds().map((threshold) => ({
    threshold,
    balancedAccuracy: binaryMetrics(
      values.map((value) => value >= threshold),
      labels
    ).balancedAccuracy,
    noiseBand: noiseBandCount(values, threshold),
  }));
  const best = Math.max(...sweep.map(({ balancedAccuracy }) => balancedAccuracy));
  // A threshold is indistinguishable from the best when the gap is smaller than the share of
  // cases inside its own noise band (an approximation: those are the cases a re-run can flip).
  const near = sweep.filter(
    ({ balancedAccuracy, noiseBand }) =>
      best - balancedAccuracy <= noiseBand / Math.max(1, values.length) + 1e-12
  );
  const negatives = scores.filter(({ item }) => item.expected === null);
  const negativeFireRate =
    negatives.length === 0
      ? 0
      : negatives.filter(({ score }) => score >= DEFAULT_GATE_THRESHOLD).length / negatives.length;

  return {
    arm,
    firing,
    auc: rocAuc(
      scores.filter(({ item }) => item.expected !== null).map(({ score }) => score),
      negatives.map(({ score }) => score)
    ),
    sweep,
    bestRange: {
      low: Math.min(...near.map(({ threshold }) => threshold)),
      high: Math.max(...near.map(({ threshold }) => threshold)),
      balancedAccuracy: best,
    },
    degenerate: negativeFireRate > DEGENERATE_GATE_FIRE_RATE,
  };
};

const correctness = (
  arm: string,
  items: readonly RoutingItem[],
  predictions: readonly RoutedPrediction[],
  metric: Comparison['metric']
) => {
  const get = indexPredictions(arm, items, predictions);
  const subset = items.filter(
    (item) => isHeadline(item) && (metric === 'endToEnd' || item.expected !== null)
  );
  return subset.map((item) =>
    metric === 'endToEnd'
      ? endToEndCorrect(get(item.id), item)
      : hit(get(item.id), item.expected as string, 1)
  );
};

const describeFailure = ({ errors, abstain, routed }: ArmMetrics): string => {
  const parts = [
    `${errors.total} errors, ${errors.byClass.wrongSkill} wrong skill ` +
      `(${errors.wrongSkillSameDomain} in the expected domain), ${errors.byClass.falseAbstain} false abstain, ` +
      `${errors.byClass.falseRoute} routed a no-skill query`,
    `top-1 ${routed.top1.k}/${routed.top1.n}, abstain ${abstain.k}/${abstain.n}`,
  ];
  if (errors.dominant && (errors.dominantShare ?? 0) > 0.5) {
    parts.push(`dominant error class: ${errors.dominant}`);
  }
  return parts.join('; ');
};

/**
 * Rule 20: every model path is either adopted (beats the lexical baseline end to end) or
 * recorded as rejected with its number, the baseline's, and how it fails.
 */
export const decidePaths = (arms: readonly ArmMetrics[], baseline = ARMS.bm25): PathDecision[] => {
  const base = arms.find(({ arm }) => arm === baseline);
  const baselineValue = base?.endToEnd.rate;
  if (baselineValue === undefined) return [];
  return arms
    .filter(({ kind }) => kind === 'model')
    .map((metrics) => {
      const value = metrics.endToEnd.rate ?? 0;
      const adopted = value > baselineValue;
      return {
        path: metrics.arm,
        adopted,
        metric: 'endToEnd' as const,
        value,
        baseline,
        baselineValue,
        ...(adopted ? {} : { failureMode: describeFailure(metrics) }),
      };
    });
};

/** Re-derives each decision from the arm numbers, so a hand-edited report cannot pass. */
export const assertDecisions = (report: ViewReport): void => {
  for (const decision of report.decisions) {
    const arm = report.arms.find(({ arm: name }) => name === decision.path);
    const base = report.arms.find(({ arm: name }) => name === decision.baseline);
    if (!arm || !base) throw new Error(`[${report.view}] decision ${decision.path} has no arm`);
    if (arm.endToEnd.rate !== decision.value || base.endToEnd.rate !== decision.baselineValue) {
      throw new Error(`[${report.view}] decision ${decision.path} does not match its arms`);
    }
    if (!decision.adopted && !(decision.value <= decision.baselineValue)) {
      throw new Error(`[${report.view}] ${decision.path} is rejected but beats the baseline`);
    }
    if (decision.adopted && !(decision.value > decision.baselineValue)) {
      throw new Error(
        `[${report.view}] ${decision.path} is adopted but does not beat the baseline`
      );
    }
  }
};

export const buildViewReport = ({
  view,
  items,
  skills,
  armPredictions,
}: {
  view: RoutingView;
  items: readonly RoutingItem[];
  skills: readonly CatalogSkill[];
  armPredictions: Record<string, readonly RoutedPrediction[]>;
}): ViewReport => {
  const arms = Object.entries(armPredictions).map(([arm, predictions]) =>
    buildArmMetrics(arm, items, predictions, skills)
  );
  const gates = Object.entries(armPredictions)
    .map(([arm, predictions]) => analyseGate(arm, items, predictions))
    .filter((gate): gate is GateAnalysis => gate !== undefined);

  const compared = arms.filter(({ kind }) => kind !== 'oracle').map(({ arm }) => arm);
  const comparisons: Comparison[] = [];
  compared.forEach((a, i) => {
    compared.slice(i + 1).forEach((b) => {
      for (const metric of ['endToEnd', 'routedTop1'] as const) {
        comparisons.push({
          a,
          b,
          metric,
          result: mcnemar(
            correctness(a, items, armPredictions[a], metric),
            correctness(b, items, armPredictions[b], metric)
          ),
        });
      }
    });
  });

  const headline = items.filter(isHeadline);
  const report: ViewReport = {
    view,
    answerSpace: skills.length,
    candidateListSizes: [...TOP_K],
    population: {
      headline: headline.length,
      routed: headline.filter(({ expected }) => expected !== null).length,
      abstain: headline.filter(({ expected }) => expected === null).length,
      abstainFromBenchmark: headline.filter(
        ({ expected, source }) => expected === null && source === 'benchmark'
      ).length,
      ambiguous: items.filter(({ ambiguous }) => ambiguous).length,
    },
    arms,
    gates,
    comparisons,
    decisions: decidePaths(arms),
  };
  assertRateFields(report);
  assertDecisions(report);
  return report;
};

/**
 * Zero-cost numbers frozen from a run of this script. BM25 and the oracle rows depend only on
 * the dataset, the catalog and the ranker; a drift means one of those changed.
 */
export type FrozenBaselines = Record<string, Record<string, { k: number; n: number }>>;

export const assertFrozenBaselines = (reports: readonly ViewReport[], frozen: FrozenBaselines) => {
  for (const report of reports) {
    for (const [arm, expected] of Object.entries(frozen[report.view] ?? {})) {
      const actual = report.arms.find(({ arm: name }) => name === arm)?.endToEnd;
      if (!actual || actual.k !== expected.k || actual.n !== expected.n) {
        throw new Error(
          `[${report.view}] ${arm} end-to-end is ${actual?.k}/${actual?.n}, frozen ${expected.k}/${expected.n}; ` +
            'the dataset, catalog or ranker changed — re-freeze deliberately'
        );
      }
    }
  }
};

export const freezeBaselines = (reports: readonly ViewReport[]): FrozenBaselines =>
  Object.fromEntries(
    reports.map((report) => [
      report.view,
      Object.fromEntries(
        report.arms
          .filter(({ kind }) => kind !== 'model')
          .map(({ arm, endToEnd: { k, n } }) => [arm, { k, n }])
      ),
    ])
  );

const pct = (value: number | undefined) =>
  value === undefined ? 'n/a' : `${(value * 100).toFixed(1)}%`;
const withCi = ({ k, n, rate, ci }: RateWithCi) =>
  `${k}/${n} ${pct(rate)} [${pct(ci.low)}, ${pct(ci.high)}]`;
const ms = (value: number | undefined) => (value === undefined ? 'n/a' : `${Math.round(value)}`);

export const renderViewMarkdown = (report: ViewReport): string => {
  const { view, population, arms, gates, comparisons, decisions } = report;
  return [
    `## View: ${view} (${report.answerSpace} skills)`,
    '',
    `Headline: ${population.headline} rows = ${population.routed} with an expected skill + ` +
      `${population.abstain} where no skill should load (${population.abstainFromBenchmark} from the benchmark, ` +
      `the rest synthetic controls). ${population.ambiguous} AMBIGUOUS rows reported separately. ` +
      `Incumbent pre-selection surfaces up to ${INCUMBENT_MAX_SKILLS} skills, so compare it on top-5.`,
    '',
    '| arm | kind | end-to-end (95% Wilson) | top-1 | top-3 | top-5 | abstain on no-skill | in tok/call | $/call | $ total | p50 ms | p95 ms |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...arms.map(
      ({ arm, kind, endToEnd, routed, abstain, usage }) =>
        `| ${[
          arm,
          kind,
          withCi(endToEnd),
          withCi(routed.top1),
          withCi(routed.top3),
          withCi(routed.top5),
          withCi(abstain),
          usage.inputTokensPerCall.toFixed(0),
          usage.costUsdPerCall.toFixed(6),
          usage.costUsdTotal.toFixed(4),
          ms(usage.latencyP50Ms),
          ms(usage.latencyP95Ms),
        ].join(' | ')} |`
    ),
    '',
    '### Errors by class (headline rows)',
    '',
    '| arm | errors | wrong skill | same domain | false abstain | routed a no-skill query | dominant |',
    '|---|---|---|---|---|---|---|',
    ...arms.map(
      ({ arm, errors }) =>
        `| ${arm} | ${errors.total} | ${errors.byClass.wrongSkill} | ${errors.wrongSkillSameDomain} | ` +
        `${errors.byClass.falseAbstain} | ${errors.byClass.falseRoute} | ${
          errors.dominant ? `${errors.dominant} (${pct(errors.dominantShare)})` : 'n/a'
        } |`
    ),
    '',
    ...gates.flatMap((gate) => [
      `### Gate: ${gate.arm}`,
      '',
      `AUC ${gate.auc === undefined ? 'n/a' : gate.auc.toFixed(3)}; best balanced accuracy ` +
        `${pct(gate.bestRange.balancedAccuracy)} anywhere in [${gate.bestRange.low.toFixed(
          2
        )}, ${gate.bestRange.high.toFixed(2)}]${
          gate.degenerate ? '; DEGENERATE: fires on most no-skill queries' : ''
        }.`,
      '',
      '| class | n | mean gate score | fires at 0.5 |',
      '|---|---|---|---|',
      ...Object.entries(gate.firing).map(
        ([name, { n, meanScore, fireRate }]) =>
          `| ${name} | ${n} | ${meanScore.toFixed(3)} | ${pct(fireRate)} |`
      ),
      '',
      '| threshold | balanced acc | cases within +/-0.05 |',
      '|---|---|---|',
      ...gate.sweep.map(
        ({ threshold, balancedAccuracy, noiseBand }) =>
          `| ${threshold.toFixed(2)} | ${pct(balancedAccuracy)} | ${noiseBand} |`
      ),
      '',
    ]),
    '### Ambiguous rows (not in the headline)',
    '',
    '| arm | top-1 | top-3 |',
    '|---|---|---|',
    ...arms.map(
      ({ arm, ambiguousTop1, ambiguousTop3 }) =>
        `| ${arm} | ${ambiguousTop1 ? withCi(ambiguousTop1) : 'n/a'} | ${
          ambiguousTop3 ? withCi(ambiguousTop3) : 'n/a'
        } |`
    ),
    '',
    '### Paired comparisons (McNemar, headline rows)',
    '',
    '| A | B | metric | only A right | only B right | exact p |',
    '|---|---|---|---|---|---|',
    ...comparisons.map(
      ({ a, b, metric, result }) =>
        `| ${a} | ${b} | ${metric} | ${result.onlyA} | ${result.onlyB} | ${result.exactP.toFixed(
          4
        )} |`
    ),
    '',
    '### Path decisions (baseline: bm25, end-to-end)',
    '',
    '| path | adopted | value | baseline | failure mode |',
    '|---|---|---|---|---|',
    ...decisions.map(
      ({ path, adopted, value, baselineValue, failureMode }) =>
        `| ${path} | ${adopted} | ${pct(value)} | ${pct(baselineValue)} | ${failureMode ?? ''} |`
    ),
    '',
  ].join('\n');
};
