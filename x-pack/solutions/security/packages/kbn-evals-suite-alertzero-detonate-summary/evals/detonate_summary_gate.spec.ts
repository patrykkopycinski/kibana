/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * alertzero-detonate-summary: the conservative-summary gate (D9/O10).
 *
 * Rule under test: "malicious" only with hard evidence (production endpoint
 * alerts / detection rule hits); otherwise "suspicious" or "no malicious
 * behavior observed (not proof of benign)"; never a benign/safe/clean
 * conclusion.
 *
 * Corpus: recorded Detonate task results (scripts/generate_corpus.ts):
 * ≥300 known-good quiet runs, known-malware recordings, evasive/no-op runs.
 * No samples and no internal hostnames are stored.
 *
 * Gate, asserted in-spec so a violation fails the run:
 *   - false-"malicious" on known-good: 0 of ≥300 (one-sided 95% upper bound ≤1%)
 *   - unhedged false-"benign": 0 anywhere
 * The LLM judge (`--judge` connector) scores the per-label criteria alongside
 * the deterministic CODE gate; its pass rate is reported, not gated.
 *
 * Mutation check: the same quiet slice with the evidence rule dropped from
 * the prompt must turn the gate red (CODE violations or judge failures > 0).
 * A green mutation run means the suite cannot detect the regression it gates.
 */

import { expect } from '@playwright/test';
import {
  selectEvaluators,
  tags,
  type DatasetRunResult,
  type DefaultEvaluators,
  type EvaluationDataset,
  type EvalsExecutorClient,
} from '@kbn/evals';
import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';

import { evaluate as base } from '../src/evaluate';
import { loadDetonateCorpus, upperBound95 } from '../src/corpus';
import {
  createDetonateSummaryJudge,
  detonateSummaryGate,
  SUMMARY_CRITERIA,
} from '../src/evaluators';
import { renderTaskForPrompt, runDetonateSummary } from '../src/detonate_summary_task';
import type {
  DetonateCorpusEntry,
  DetonateGateMetadata,
  DetonateSummaryExample,
} from '../src/types';

const KNOWN_GOOD_MIN = 300;
const FALSE_MALICIOUS_MAX_UPPER_BOUND = 0.01;
const MUTATION_SLICE_SIZE = 40;
// Per-experiment example concurrency. Defaults to 8 (comfortable on a 16GB host);
// override per host with EVAL_CONCURRENCY (e.g. 1-2 on a 2-vCPU controller).
const TASK_CONCURRENCY = parseInt(process.env.EVAL_CONCURRENCY ?? '8', 10);

const toExamples = (entries: DetonateCorpusEntry[]): DetonateSummaryExample[] =>
  entries.map((entry) => ({
    input: { entryId: entry.id, taskContext: renderTaskForPrompt(entry) },
    output: { expected: SUMMARY_CRITERIA[entry.label].join(' ') },
    metadata: { label: entry.label },
  }));

// ── Fixture factory ───────────────────────────────────────────────────────────

function createEvaluateDetonateSummary({
  inferenceClient,
  executorClient,
  evaluators,
  log,
}: {
  inferenceClient: BoundInferenceClient;
  executorClient: EvalsExecutorClient;
  evaluators: DefaultEvaluators;
  log: ToolingLog;
}) {
  const judge = createDetonateSummaryJudge(evaluators.criteria);

  return async function evaluateDetonateSummary({
    name,
    description,
    entries,
    dropEvidenceRule = false,
  }: {
    name: string;
    description: string;
    entries: DetonateCorpusEntry[];
    dropEvidenceRule?: boolean;
  }): Promise<DatasetRunResult[]> {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const dataset = {
      name,
      description,
      examples: toExamples(entries),
    } satisfies EvaluationDataset;

    return executorClient.runExperiment(
      {
        name,
        datasets: [dataset],
        metadata: dropEvidenceRule ? { mutation: 'evidence-rule-dropped' } : {},
        concurrency: TASK_CONCURRENCY,
        task: async ({ input }) => {
          const entry = byId.get(input.entryId);
          if (!entry) throw new Error(`unknown corpus entry ${input.entryId}`);
          return runDetonateSummary({ inferenceClient, entry, log, dropEvidenceRule });
        },
      },
      selectEvaluators([detonateSummaryGate, judge])
    );
  };
}

type EvaluateDetonateSummary = ReturnType<typeof createEvaluateDetonateSummary>;

const evaluate = base.extend<{ evaluateDetonateSummary: EvaluateDetonateSummary }, {}>({
  evaluateDetonateSummary: [
    ({ inferenceClient, executorClient, evaluators, log }, use) => {
      use(createEvaluateDetonateSummary({ inferenceClient, executorClient, evaluators, log }));
    },
    { scope: 'test' },
  ],
});

// ── Gate computation ──────────────────────────────────────────────────────────

interface GateCounts {
  gated: number;
  knownGood: number;
  falseMalicious: number;
  falseBenign: number;
  judged: number;
  judgeFailures: number;
}

const sumGate = (results: DatasetRunResult[]): GateCounts => {
  const counts: GateCounts = {
    gated: 0,
    knownGood: 0,
    falseMalicious: 0,
    falseBenign: 0,
    judged: 0,
    judgeFailures: 0,
  };
  for (const { evaluationRuns } of results) {
    for (const { name, result } of evaluationRuns) {
      if (name === detonateSummaryGate.name) {
        const meta = result?.metadata as DetonateGateMetadata | undefined;
        // Empty summaries carry no metadata: count them as gate failures.
        counts.gated += 1;
        if (!meta) {
          counts.falseBenign += 1;
          continue;
        }
        if (meta.label === 'known_good_quiet') counts.knownGood += 1;
        if (meta.falseMalicious) counts.falseMalicious += 1;
        if (meta.falseBenign) counts.falseBenign += 1;
      } else if (name === 'DetonateSummaryJudge' && typeof result?.score === 'number') {
        counts.judged += 1;
        if (result.score < 1) counts.judgeFailures += 1;
      }
    }
  }
  return counts;
};

const report = (name: string, c: GateCounts, log: ToolingLog): number => {
  const fmHi = upperBound95(c.falseMalicious, c.knownGood);
  const fbHi = upperBound95(c.falseBenign, c.gated);
  log.info(
    `[detonate-summary] ${name}: gated=${c.gated} knownGood=${c.knownGood} ` +
      `false-malicious=${c.falseMalicious}/${c.knownGood} (95% upper ${fmHi.toFixed(4)}) ` +
      `false-benign=${c.falseBenign}/${c.gated} (95% upper ${fbHi.toFixed(4)}) ` +
      `judge-failures=${c.judgeFailures}/${c.judged}`
  );
  return fmHi;
};

// ── Eval spec ─────────────────────────────────────────────────────────────────

evaluate.describe(
  'alertzero-detonate-summary: conservative-summary gate',
  { tag: [...tags.serverless.security.complete] },
  () => {
    const corpus = loadDetonateCorpus();
    const knownGood = corpus.filter((e) => e.label === 'known_good_quiet');
    const evasive = corpus.filter((e) => e.label === 'evasive_no_alerts');
    const malicious = corpus.filter((e) => e.label === 'known_malicious');

    evaluate(
      'gate: conservative summaries across the full corpus',
      async ({ evaluateDetonateSummary, log }, testInfo) => {
        expect(knownGood.length).toBeGreaterThanOrEqual(KNOWN_GOOD_MIN);

        const results = await evaluateDetonateSummary({
          name: `alertzero: detonate-summary-gate-${testInfo.project.name}`,
          description:
            `Conservative-summary rule over recorded detonation results: ${knownGood.length} known-good, ` +
            `${malicious.length} known-malware, ${evasive.length} evasive. Gates false-"malicious" and unhedged false-"benign".`,
          entries: corpus,
        });

        const counts = sumGate(results);
        const fmUpper = report(`full corpus (${testInfo.project.name})`, counts, log);

        expect(counts.gated).toBe(corpus.length);
        expect(counts.knownGood).toBeGreaterThanOrEqual(KNOWN_GOOD_MIN);
        expect(counts.falseMalicious).toBe(0);
        expect(fmUpper).toBeLessThanOrEqual(FALSE_MALICIOUS_MAX_UPPER_BOUND);
        expect(counts.falseBenign).toBe(0);
      }
    );

    evaluate(
      'mutation: dropping the evidence rule turns the gate red',
      async ({ evaluateDetonateSummary, log }, testInfo) => {
        // Quiet runs are exactly the entries whose summaries the rule constrains.
        const slice = [...evasive, ...knownGood].slice(0, MUTATION_SLICE_SIZE);

        const results = await evaluateDetonateSummary({
          name: `alertzero: detonate-summary-mutation-${testInfo.project.name}`,
          description:
            'Mutation check: quiet recordings summarized with the evidence rule dropped from the prompt. ' +
            'The gate must report violations here.',
          entries: slice,
          dropEvidenceRule: true,
        });

        const counts = sumGate(results);
        report(`mutation, evidence rule dropped (${testInfo.project.name})`, counts, log);

        expect(counts.gated).toBe(slice.length);
        expect(counts.falseMalicious + counts.falseBenign + counts.judgeFailures).toBeGreaterThan(
          0
        );
      }
    );
  }
);
