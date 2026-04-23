/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { ADVERSARIAL_CORPUS, CORPUS_VERSION, type AdversarialCase } from './corpus';
import {
  DEFAULT_ADVERSARIAL_THRESHOLDS,
  computeAdversarialAggregate,
  computeAdversarialGate,
  type AdversarialAggregate,
  type AdversarialThresholds,
} from './evaluators';
import {
  createHeuristicAdversarialJudge,
  scoreAllAdversarialCases,
  type AdversarialJudge,
  type AdversarialScore,
} from './judge';
import type { ReasoningGateDecision } from '../evaluators';

/**
 * R2 orchestrator — feeds the adversarial corpus through an Argus-under-test
 * callback (`runActor`) when provided, or falls back to the case's canned
 * response so the CLI/test path stays self-contained.
 *
 * The result row is indexed into the same `.soc-reasoning-eval-runs` index
 * as the reasoning vertical (with `suite_id='argus-adversarial-vertical'`)
 * so trust-tier assessor queries only have to watch one stream.
 */

export interface EvaluateAdversarialDeps {
  esClient: Client;
  judge?: AdversarialJudge;
  log?: ToolingLog;
  /**
   * Optional hook that runs the real Argus actor against a case payload
   * and returns the text response. When absent, we fall back to the
   * case's `canned_response.content` (offline mode).
   */
  runActor?: (kase: AdversarialCase) => Promise<string>;
}

export interface EvaluateAdversarialOptions {
  runsIndex?: string;
  thresholds?: AdversarialThresholds;
  suiteId?: string;
  overrideRunId?: string;
  /** Subset of corpus to run (by case id). Defaults to the whole corpus. */
  caseIds?: readonly string[];
  /**
   * Skip the unsafe baseline cases (adv-99-*). Unsafe cases exist to
   * exercise the judge's fail branch in unit tests — they should not
   * count toward live Argus evaluations.
   */
  includeUnsafeBaselines?: boolean;
}

export interface AdversarialEvalRow {
  run_id: string;
  suite_id: string;
  suite_kind: 'adversarial';
  corpus_version: string;
  runs_index: string;
  aggregate: AdversarialAggregate;
  per_case: Array<{ id: string; family: string; score: AdversarialScore }>;
  gate_decision: ReasoningGateDecision;
  thresholds: AdversarialThresholds;
  cases_evaluated: number;
  '@timestamp': string;
}

const DEFAULT_RUNS_INDEX = '.soc-reasoning-eval-runs';
const DEFAULT_SUITE_ID = 'argus-adversarial-vertical';

const selectCases = (opts: EvaluateAdversarialOptions): AdversarialCase[] => {
  let cases: AdversarialCase[] = [...ADVERSARIAL_CORPUS];
  if (!opts.includeUnsafeBaselines) {
    cases = cases.filter((c) => !c.id.startsWith('adv-99-'));
  }
  if (opts.caseIds && opts.caseIds.length > 0) {
    const set = new Set(opts.caseIds);
    cases = cases.filter((c) => set.has(c.id));
  }
  return cases;
};

export const evaluateAdversarial = async (
  deps: EvaluateAdversarialDeps,
  options: EvaluateAdversarialOptions = {}
): Promise<AdversarialEvalRow> => {
  const {
    runsIndex = DEFAULT_RUNS_INDEX,
    thresholds = DEFAULT_ADVERSARIAL_THRESHOLDS,
    suiteId = DEFAULT_SUITE_ID,
    overrideRunId,
  } = options;

  const judge = deps.judge ?? createHeuristicAdversarialJudge();
  const cases = selectCases(options);

  const pairs = await Promise.all(
    cases.map(async (kase) => {
      const response = deps.runActor ? await deps.runActor(kase) : kase.canned_response.content;
      return { kase, response };
    })
  );

  const scores = await scoreAllAdversarialCases(judge, pairs);
  const aggregate = computeAdversarialAggregate(scores);
  const gateDecision = computeAdversarialGate(aggregate, thresholds);

  const perCase = pairs.map((pair, idx) => ({
    id: pair.kase.id,
    family: pair.kase.family,
    score: scores[idx],
  }));

  const evalRunId =
    overrideRunId ?? `argus-adversarial-${new Date().toISOString().replace(/[:.]/g, '-')}`;

  const row: AdversarialEvalRow = {
    run_id: evalRunId,
    suite_id: suiteId,
    suite_kind: 'adversarial',
    corpus_version: CORPUS_VERSION,
    runs_index: runsIndex,
    aggregate,
    per_case: perCase,
    gate_decision: gateDecision,
    thresholds,
    cases_evaluated: aggregate.cases_evaluated,
    '@timestamp': new Date().toISOString(),
  };

  await deps.esClient.index({
    index: runsIndex,
    document: row,
    refresh: 'wait_for',
  });

  deps.log?.info?.(
    `[argus-adversarial-eval] run=${evalRunId} cases=${aggregate.cases_evaluated} gate=${gateDecision}`
  );

  return row;
};
