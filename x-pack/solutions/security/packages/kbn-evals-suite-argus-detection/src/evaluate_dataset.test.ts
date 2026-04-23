/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  aggregateRuleRun,
  correctClassificationEvaluator,
  createEvaluateDetectionRules,
} from './evaluate_dataset';
import type { ReplayClient, ReplayRuleResult } from './replay_rule';
import { variantDocId } from './replay_rule';
import { MYTHOS_DETECTION_RULES } from '../datasets/rule_pack';

const silentLog = (): ToolingLog =>
  ({
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as ToolingLog);

const label = (
  primitiveId: string,
  axis: string,
  index: number,
  shouldFire: boolean,
  expectedRuleIds: string[] = []
) => ({
  variant_id: variantDocId(primitiveId, axis, index),
  corpus_id: 'argus-corpus-mythos-2026-04',
  primitive_id: primitiveId,
  variant_axis: axis,
  variant_index: index,
  should_fire: shouldFire,
  expected_rule_ids: expectedRuleIds,
  mutation_axes: [axis],
});

describe('aggregateRuleRun', () => {
  const rule = MYTHOS_DETECTION_RULES[0];
  const runArgs = {
    rule,
    corpusIndex: '.soc-eval-corpus-argus-corpus-mythos-2026-04',
    corpusId: 'argus-corpus-mythos-2026-04',
    runId: 'run-123',
    suiteId: 'argus-detection-vertical',
    nowIso: '2026-04-17T12:00:00Z',
  };

  it('counts TP/FP/FN/TN correctly and marks pass when all thresholds clear', () => {
    const labels = [
      label('T1003.001', 'command_args', 0, true),
      label('T1003.001', 'command_args', 1, true),
      label('T1003.001', 'process_ancestry', 0, true),
      label('T1003.001', 'encoding_layers', 0, true),
      label('T1003.001', '_negatives', 0, false),
      label('T1003.001', '_negatives', 1, false),
    ];
    const replay: ReplayRuleResult = {
      rule_id: rule.rule_id,
      fired_variant_ids: [
        variantDocId('T1003.001', 'command_args', 0),
        variantDocId('T1003.001', 'command_args', 1),
        variantDocId('T1003.001', 'process_ancestry', 0),
      ],
      fire_count: 3,
    };

    const row = aggregateRuleRun({ ...runArgs, replay, labels });

    expect(row.counts).toEqual({
      true_positives: 3,
      false_positives: 0,
      false_negatives: 1,
      true_negatives: 2,
    });
    expect(row.scores.precision).toBe(1);
    expect(row.scores.recall).toBeCloseTo(0.75);
    expect(row.scores.fp_rate_baseline).toBe(0);
    expect(row.scores.variant_coverage).toBeCloseTo(2 / 3);
    expect(row.variants.positive_total).toBe(4);
    expect(row.variants.positive_axes).toEqual([
      'command_args',
      'encoding_layers',
      'process_ancestry',
    ]);
    expect(row.variants.fired_axes).toEqual(['command_args', 'process_ancestry']);
    // precision=1, recall=0.75, fp_rate=0, coverage=0.66 → pass (coverage > 0.5)
    expect(row.gate_decision).toBe('pass');
  });

  it('marks a rule with a single false positive as fail on fp_rate', () => {
    const labels = [
      label('T1003.001', 'command_args', 0, true),
      label('T1003.001', '_negatives', 0, false),
      label('T1003.001', '_negatives', 1, false),
    ];
    const replay: ReplayRuleResult = {
      rule_id: rule.rule_id,
      fired_variant_ids: [
        variantDocId('T1003.001', 'command_args', 0),
        variantDocId('T1003.001', '_negatives', 0),
      ],
      fire_count: 2,
    };

    const row = aggregateRuleRun({ ...runArgs, replay, labels });

    expect(row.counts.false_positives).toBe(1);
    // fp_rate = 1/2 = 0.5, threshold is 0.02 → miss is 0.48 >> marginal_band (0.1) → fail
    expect(row.gate_decision).toBe('fail');
  });

  it('carries the replay error through to the row', () => {
    const replay: ReplayRuleResult = {
      rule_id: rule.rule_id,
      fired_variant_ids: [],
      fire_count: 0,
      error: 'connection refused',
    };
    const row = aggregateRuleRun({ ...runArgs, replay, labels: [] });
    expect(row.replay_error).toBe('connection refused');
  });
});

describe('correctClassificationEvaluator', () => {
  it('scores 1 when observed matches expected', async () => {
    const result = await correctClassificationEvaluator.evaluate({
      input: {
        rule_id: 'r',
        rule_version: '1',
        corpus_id: 'c',
        primitive_id: 'p',
        variant_index: 0,
        variant_axis: 'command_args',
      },
      output: { observed_fire: true, observed_rule_ids: ['r'], signals_produced: 1 },
      expected: { should_fire: true, expected_rule_ids: ['r'], mutation_axes: [] },
      metadata: null,
    });
    expect(result.score).toBe(1);
    expect(result.label).toBe('correct');
  });

  it('labels a missed positive as false-negative', async () => {
    const result = await correctClassificationEvaluator.evaluate({
      input: {
        rule_id: 'r',
        rule_version: '1',
        corpus_id: 'c',
        primitive_id: 'p',
        variant_index: 0,
        variant_axis: 'command_args',
      },
      output: { observed_fire: false, observed_rule_ids: [], signals_produced: 0 },
      expected: { should_fire: true, expected_rule_ids: ['r'], mutation_axes: [] },
      metadata: null,
    });
    expect(result.score).toBe(0);
    expect(result.label).toBe('false-negative');
  });

  it('labels a spurious fire as false-positive', async () => {
    const result = await correctClassificationEvaluator.evaluate({
      input: {
        rule_id: 'r',
        rule_version: '1',
        corpus_id: 'c',
        primitive_id: 'p',
        variant_index: 0,
        variant_axis: '_negatives',
      },
      output: { observed_fire: true, observed_rule_ids: ['r'], signals_produced: 1 },
      expected: { should_fire: false, expected_rule_ids: [], mutation_axes: [] },
      metadata: null,
    });
    expect(result.score).toBe(0);
    expect(result.label).toBe('false-positive');
  });
});

describe('createEvaluateDetectionRules', () => {
  it('loads corpus, replays each rule, and bulk-persists one row per rule', async () => {
    const loadHits = [
      {
        _source: {
          _argus: {
            corpus_id: 'c',
            primitive_id: 'T1003.001',
            variant_axis: 'command_args',
            variant_index: 0,
            should_fire: true,
            expected_rule_ids: ['mythos.cred-dumping.lsass'],
            mutation_axes: ['command_args'],
          },
        },
      },
      {
        _source: {
          _argus: {
            corpus_id: 'c',
            primitive_id: 'T1003.001',
            variant_axis: '_negatives',
            variant_index: 0,
            should_fire: false,
            expected_rule_ids: [],
            mutation_axes: [],
          },
        },
      },
    ];
    const search = jest
      .fn()
      .mockResolvedValue({ hits: { total: { value: loadHits.length }, hits: loadHits } });
    const bulk = jest.fn().mockResolvedValue({ errors: false, items: [] });
    const esClient = { search, bulk } as unknown as Client;

    const replayClient: ReplayClient = {
      replayRule: jest.fn(async ({ rule }) => ({
        rule_id: rule.rule_id,
        fired_variant_ids: [variantDocId('T1003.001', 'command_args', 0)],
        fire_count: 1,
      })),
    };

    const run = createEvaluateDetectionRules({
      esClient,
      replayClient,
      log: silentLog(),
      rules: [MYTHOS_DETECTION_RULES[0]],
      now: () => new Date('2026-04-17T12:00:00Z'),
      generateRunId: () => 'run-test',
    });

    const result = await run({ corpusId: 'c' });

    expect(result.run_id).toBe('run-test');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].rule_id).toBe(MYTHOS_DETECTION_RULES[0].rule_id);
    expect(result.rows[0].gate_decision).toBe('pass');

    expect(replayClient.replayRule).toHaveBeenCalledTimes(1);
    expect(bulk).toHaveBeenCalledTimes(1);
    const bulkArgs = bulk.mock.calls[0][0];
    expect(bulkArgs.refresh).toBe('wait_for');
    expect(bulkArgs.operations).toHaveLength(2);
    expect(bulkArgs.operations[0]).toEqual({
      create: {
        _index: '.soc-detection-eval-runs',
        _id: `run-test-${MYTHOS_DETECTION_RULES[0].rule_id}`,
      },
    });
  });

  it('does not persist when there are no rows (empty rule pack)', async () => {
    const search = jest.fn().mockResolvedValue({ hits: { total: { value: 0 }, hits: [] } });
    const bulk = jest.fn();
    const esClient = { search, bulk } as unknown as Client;
    const replayClient: ReplayClient = { replayRule: jest.fn() };

    const run = createEvaluateDetectionRules({
      esClient,
      replayClient,
      log: silentLog(),
      rules: [],
      generateRunId: () => 'run-empty',
    });

    const result = await run({ corpusId: 'c' });
    expect(result.rows).toEqual([]);
    expect(bulk).not.toHaveBeenCalled();
  });
});
