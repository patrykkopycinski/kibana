/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import {
  logRunSummary,
  withScoreCollection,
  type ScoreSink,
  type UnsupportedSink,
} from './run_summary';
import type { RuleEvaluator } from './dataset_evaluator';

interface Result {
  score: number | null;
  label: string;
}

const evaluatorReturning = (name: string, results: Result[]): RuleEvaluator => {
  let call = 0;
  return {
    name,
    kind: 'CODE',
    evaluate: async () => results[call++],
  } as unknown as RuleEvaluator;
};

const run = async (unsupportedSink?: UnsupportedSink) => {
  const sink: ScoreSink = new Map();
  const [evaluator] = withScoreCollection(
    [
      evaluatorReturning('BenignReplayFpRate', [
        { score: null, label: 'unsupported' },
        { score: null, label: 'unsupported' },
        { score: null, label: 'N/A' },
        { score: null, label: 'N/A' },
        { score: null, label: 'N/A' },
        { score: 1, label: 'pass' },
      ]),
    ],
    sink,
    unsupportedSink
  );
  for (let i = 0; i < 6; i++) await evaluator.evaluate({} as never);
  const lines: string[] = [];
  const log = { info: (line: string) => lines.push(line) } as unknown as ToolingLog;
  logRunSummary({ sink, unsupportedSink, datasetName: 'ds', log });
  return lines.join('\n');
};

describe('run summary unsupported flag', () => {
  it('prints unsupported×n separately from N/A×n', async () => {
    const out = await run(new Map());
    expect(out).toContain('N/A×5');
    expect(out).toContain('unsupported×2');
  });

  it('prints no unsupported flag when nothing is unsupported or no sink is given', async () => {
    expect(await run()).not.toContain('unsupported×');
    const sink: ScoreSink = new Map([['E', [1, 0]]]);
    const lines: string[] = [];
    logRunSummary({
      sink,
      unsupportedSink: new Map(),
      datasetName: 'ds',
      log: { info: (l: string) => lines.push(l) } as unknown as ToolingLog,
    });
    expect(lines.join('\n')).not.toContain('unsupported×');
  });
});
