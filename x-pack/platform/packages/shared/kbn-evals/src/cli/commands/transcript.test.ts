/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Os from 'os';
import Path from 'path';
import { FlagsReader, getFlags } from '@kbn/dev-cli-runner';
import { ToolingLog } from '@kbn/tooling-log';
import type { EvaluationScoreDocument } from '@kbn/evals-common';
import { transcriptCmd } from './transcript';
import { createEvalsClientFromEnv } from '../run_helpers';

jest.mock('../run_helpers', () => ({
  ...jest.requireActual('../run_helpers'),
  createEvalsClientFromEnv: jest.fn(),
}));

const score = (
  experimentId: string,
  exampleId: string,
  value: number,
  traceId?: string
): EvaluationScoreDocument =>
  ({
    '@timestamp': '2026-05-01T11:00:00.000Z',
    experiment_id: experimentId,
    example: {
      id: exampleId,
      index: Number(exampleId.replace(/\D/g, '')) || 0,
      input: { question: `preview of ${exampleId}` },
      dataset: { id: 'ds-1', name: 'Alert triage' },
    },
    task: {
      trace_id: traceId,
      repetition_index: 0,
      model: { id: 'model-x', family: 'x', provider: 'p' },
    },
    evaluator: { name: 'Factuality', score: value },
    metadata: { execution_id: experimentId, suite_id: 'suite', total_repetitions: 1 },
  } as unknown as EvaluationScoreDocument);

const storedDetails = (answer: string) => ({
  example: { input: { question: 'Full question?' } },
  task: { output: { steps: [], messages: [{ message: 'Full question?' }, { message: answer }] } },
});

describe('transcriptCmd', () => {
  const getExperimentScoresWithTotal = jest.fn();
  const getExperimentExampleDetails = jest.fn();
  const getTrace = jest.fn();
  const fetchDatasetById = jest.fn();
  const findLatestExperimentForBuild = jest.fn();

  let log: ToolingLog;
  let stdout: jest.SpyInstance;
  let tmpDir: string;
  const originalSpaceIds = process.env.EVAL_SPACE_IDS;

  const run = (argv: string[]) => {
    const flagsReader = new FlagsReader(getFlags(argv, transcriptCmd.flags));
    return transcriptCmd.run({ log, flagsReader } as never);
  };

  const printed = () => stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

  beforeEach(() => {
    delete process.env.EVAL_SPACE_IDS;
    tmpDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'transcript-command-test-'));
    log = new ToolingLog();
    jest.spyOn(log, 'info').mockImplementation(() => true);
    jest.spyOn(log, 'warning').mockImplementation(() => true);
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    getExperimentScoresWithTotal.mockReset().mockImplementation(async (experimentId: string) => ({
      scores: [
        score(experimentId, 'ex-1', experimentId === 'exp-a' ? 1 : 0.2),
        score(experimentId, 'ex-2', 0.5),
      ],
      total: 2,
      capped: false,
    }));
    getExperimentExampleDetails
      .mockReset()
      .mockImplementation(async (experimentId: string) =>
        storedDetails(`answer from ${experimentId}`)
      );
    getTrace.mockReset().mockResolvedValue({ trace_id: 't', total_spans: 0, spans: [] });
    fetchDatasetById.mockReset().mockResolvedValue(null);
    findLatestExperimentForBuild.mockReset().mockResolvedValue(undefined);
    jest
      .mocked(createEvalsClientFromEnv)
      .mockReset()
      .mockResolvedValue({
        getExperimentScoresWithTotal,
        getExperimentExampleDetails,
        getTrace,
        fetchDatasetById,
        findLatestExperimentForBuild,
      } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    Fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalSpaceIds === undefined) {
      delete process.env.EVAL_SPACE_IDS;
    } else {
      process.env.EVAL_SPACE_IDS = originalSpaceIds;
    }
  });

  describe('flag validation', () => {
    it('rejects a format other than md or html before touching Kibana', async () => {
      await expect(run(['exp-a', 'exp-b', '--format', 'pdf'])).rejects.toThrow(
        '--format must be "md" or "html".'
      );
      expect(createEvalsClientFromEnv).not.toHaveBeenCalled();
    });

    it('needs at least two experiment ids', async () => {
      await expect(run(['exp-a'])).rejects.toThrow('At least two experiment IDs are required');
      expect(createEvalsClientFromEnv).not.toHaveBeenCalled();
    });

    it('passes --space-ids to the client, falling back to EVAL_SPACE_IDS', async () => {
      await run(['exp-a', 'exp-b', '--space-ids', 'team-a']);
      expect(createEvalsClientFromEnv).toHaveBeenLastCalledWith(log, ['team-a']);

      process.env.EVAL_SPACE_IDS = 'team-b';
      await run(['exp-a', 'exp-b']);
      expect(createEvalsClientFromEnv).toHaveBeenLastCalledWith(log, ['team-b']);
    });
  });

  describe('output', () => {
    it('prints a markdown report with each experiment answer to stdout by default', async () => {
      await run(['exp-a', 'exp-b']);

      const report = printed();
      expect(report).toContain('answer from exp-a');
      expect(report).toContain('answer from exp-b');
      expect(getExperimentScoresWithTotal).toHaveBeenCalledWith('exp-a', undefined);
      expect(getExperimentExampleDetails).toHaveBeenCalledWith(
        'exp-a',
        'ds-1',
        'ex-1',
        0,
        undefined
      );
    });

    it('renders html with --format html', async () => {
      await run(['exp-a', 'exp-b', '--format', 'html']);

      expect(printed()).toMatch(/<html|<!doctype html/i);
    });

    it('writes to --output instead of stdout and says where', async () => {
      const outputPath = Path.join(tmpDir, 'report.md');

      await run(['exp-a', 'exp-b', '--output', outputPath]);

      expect(Fs.readFileSync(outputPath, 'utf8')).toContain('answer from exp-a');
      expect(stdout).not.toHaveBeenCalled();
      expect(log.info).toHaveBeenCalledWith(`Transcript report written to ${outputPath}`);
    });
  });

  describe('--suite', () => {
    it('resolves a base build id to the full execution id and scopes the score and detail reads', async () => {
      findLatestExperimentForBuild.mockResolvedValue({ executionId: 'bk-1::suite::model-x' });

      await run(['bk-1', 'exp-b::already::full', '--suite', 'suite']);

      expect(findLatestExperimentForBuild).toHaveBeenCalledTimes(1);
      expect(findLatestExperimentForBuild).toHaveBeenCalledWith({
        suiteId: 'suite',
        baseExecutionId: 'bk-1',
      });
      expect(log.info).toHaveBeenCalledWith('Resolved experiment bk-1 → bk-1::suite::model-x');
      expect(getExperimentScoresWithTotal).toHaveBeenCalledWith('bk-1::suite::model-x', {
        suiteId: 'suite',
        executionId: 'bk-1::suite::model-x',
      });
      expect(getExperimentScoresWithTotal).toHaveBeenCalledWith('exp-b::already::full', {
        suiteId: 'suite',
        executionId: 'exp-b::already::full',
      });
      expect(getExperimentExampleDetails).toHaveBeenCalledWith(
        'bk-1::suite::model-x',
        'ds-1',
        'ex-1',
        0,
        { executionId: 'bk-1::suite::model-x' }
      );
    });

    it('warns and keeps the raw id when a base build id resolves to nothing', async () => {
      await run(['bk-1', 'bk-2', '--suite', 'suite']);

      expect(log.warning).toHaveBeenCalledWith(
        'Could not resolve experiment for base ID "bk-1"; using raw ID.'
      );
      expect(getExperimentScoresWithTotal).toHaveBeenCalledWith('bk-1', expect.any(Object));
    });
  });

  it('fails when an experiment has no scores', async () => {
    getExperimentScoresWithTotal.mockImplementation(async (experimentId: string) => ({
      scores: experimentId === 'exp-b' ? [] : [score(experimentId, 'ex-1', 1)],
      total: 0,
      capped: false,
    }));

    await expect(run(['exp-a', 'exp-b'])).rejects.toThrow(
      'No scores found for experiment ID: exp-b'
    );
  });

  describe('degraded reads', () => {
    it('falls back to traces and warns when stored output cannot be read', async () => {
      getExperimentExampleDetails.mockRejectedValue(
        Object.assign(new Error('not found'), { response: { status: 404 } })
      );

      await run(['exp-a', 'exp-b']);

      expect(getExperimentExampleDetails).toHaveBeenCalledTimes(4);
      expect(log.warning).toHaveBeenCalledWith(
        'Could not read stored output for 4 repetition(s); falling back to traces.'
      );
      expect(printed()).not.toContain('answer from exp-a');
    });

    it('retries one transient failure after a short wait', async () => {
      jest.useFakeTimers();
      let failed = false;
      getExperimentExampleDetails.mockImplementation(async (experimentId: string) => {
        if (!failed) {
          failed = true;
          throw Object.assign(new Error('Too Many Requests'), { response: { status: 429 } });
        }
        return storedDetails(`answer from ${experimentId}`);
      });

      const done = run(['exp-a', 'exp-b']);
      await jest.advanceTimersByTimeAsync(1000);
      await done;

      expect(getExperimentExampleDetails).toHaveBeenCalledTimes(5);
      expect(log.warning).not.toHaveBeenCalledWith(
        expect.stringContaining('Could not read stored output')
      );
    });

    it('does not retry a deterministic failure', async () => {
      getExperimentExampleDetails.mockImplementation(async (experimentId: string) => {
        if (experimentId === 'exp-a') {
          throw Object.assign(new Error('Not Found'), { response: { status: 404 } });
        }
        return storedDetails('ok');
      });

      await run(['exp-a', 'exp-b']);

      expect(getExperimentExampleDetails).toHaveBeenCalledTimes(4);
      expect(log.warning).toHaveBeenCalledWith(
        'Could not read stored output for 2 repetition(s); falling back to traces.'
      );
    });

    it('reads each trace once and marks unreadable ones as unavailable', async () => {
      getExperimentScoresWithTotal.mockImplementation(async (experimentId: string) => ({
        scores: [score(experimentId, 'ex-1', 1, 'trace-shared'), score(experimentId, 'ex-2', 1)],
        total: 2,
        capped: false,
      }));
      getTrace.mockRejectedValue(
        Object.assign(new Error('Not Found'), { response: { status: 404 } })
      );

      await run(['exp-a', 'exp-b']);

      expect(getTrace).toHaveBeenCalledTimes(1);
      expect(getTrace).toHaveBeenCalledWith('trace-shared');
      expect(log.info).toHaveBeenCalledWith('Reading 1 trace(s)...');
      expect(log.warning).toHaveBeenCalledWith(
        'Could not read 1 trace(s); they are shown as unavailable.'
      );
    });

    it('shows the tool trail of a readable trace when stored output is unavailable', async () => {
      getExperimentExampleDetails.mockRejectedValue(
        Object.assign(new Error('not found'), { response: { status: 404 } })
      );
      getExperimentScoresWithTotal.mockImplementation(async (experimentId: string) => ({
        scores: [
          score(experimentId, 'ex-1', experimentId === 'exp-a' ? 1 : 0, `trace-${experimentId}`),
        ],
        total: 1,
        capped: false,
      }));
      getTrace.mockResolvedValue({
        trace_id: 't',
        total_spans: 2,
        duration_ms: 100,
        spans: [
          {
            name: 'execute_tool platform.core.search',
            span_id: 's1',
            start_time: '2026-09-05T19:30:58.391Z',
            duration_ms: 10,
            attributes: {},
          },
        ],
      });

      await run(['exp-a', 'exp-b']);

      expect(getTrace).toHaveBeenCalledTimes(2);
      expect(printed()).toContain('platform.core.search');
    });
  });

  describe('expected answers from the dataset', () => {
    it('reads each dataset once and includes its expected output', async () => {
      fetchDatasetById.mockResolvedValue({
        id: 'ds-1',
        name: 'Alert triage',
        examples: [
          { input: { question: 'Full question?' }, output: { expected: 'the gold answer' } },
        ],
      });

      await run(['exp-a', 'exp-b']);

      expect(fetchDatasetById).toHaveBeenCalledTimes(1);
      expect(fetchDatasetById).toHaveBeenCalledWith('ds-1');
      expect(printed()).toContain('the gold answer');
    });

    it('warns and omits expected answers when a dataset cannot be read', async () => {
      fetchDatasetById.mockRejectedValue(
        Object.assign(new Error('boom'), { response: { status: 400 } })
      );

      await run(['exp-a', 'exp-b']);

      expect(log.warning).toHaveBeenCalledWith(
        'Could not read dataset ds-1 (boom); its expected answers are omitted.'
      );
      expect(stdout).toHaveBeenCalled();
    });

    it('stringifies a non-Error dataset failure', async () => {
      fetchDatasetById.mockRejectedValue('plain failure');

      await run(['exp-a', 'exp-b']);

      expect(log.warning).toHaveBeenCalledWith(
        'Could not read dataset ds-1 (plain failure); its expected answers are omitted.'
      );
    });

    it('warns when the dataset no longer exists', async () => {
      fetchDatasetById.mockResolvedValue(null);

      await run(['exp-a', 'exp-b']);

      expect(log.warning).toHaveBeenCalledWith(
        'Dataset ds-1 was not found; its expected answers are omitted.'
      );
    });
  });

  it('logs the report warnings, such as a capped score read', async () => {
    getExperimentScoresWithTotal.mockImplementation(async (experimentId: string) => ({
      scores: [score(experimentId, 'ex-1', 1)],
      total: 1,
      capped: experimentId === 'exp-a',
    }));

    await run(['exp-a', 'exp-b']);

    expect(log.warning).toHaveBeenCalledWith(
      expect.stringContaining('Experiment exp-a reached the')
    );
  });
});
