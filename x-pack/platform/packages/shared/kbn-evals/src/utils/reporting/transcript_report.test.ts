/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationScoreDocument, TraceSummary } from '@kbn/evals-common';
import { MAX_SCORES_PER_QUERY } from '@kbn/evals-common';
import type {
  StoredExampleDetails,
  TranscriptExperiment,
  TranscriptHydration,
} from './transcript_report';
import {
  buildTranscriptReport,
  collectRepetitionRefs,
  collectScoredExamples,
  exampleKey,
  exampleDetailsFilters,
  expectedOutputsByExample,
  filterToOverlappingExamples,
  renderTranscriptHtml,
  renderTranscriptMarkdown,
  repetitionKey,
} from './transcript_report';

const createScore = ({
  experimentId,
  exampleId,
  repetitionIndex = 0,
  score,
  evaluator = 'Factuality',
  traceId,
  datasetId = 'ds-1',
  direction,
  kind,
}: {
  experimentId: string;
  exampleId: string;
  repetitionIndex?: number;
  score: number | null;
  evaluator?: string;
  traceId?: string | null;
  datasetId?: string;
  direction?: 'maximize' | 'minimize' | 'neutral';
  kind?: 'llm' | 'code';
}): EvaluationScoreDocument => ({
  '@timestamp': '2026-05-01T11:00:00.000Z',
  experiment_id: experimentId,
  example: {
    id: exampleId,
    index: Number(exampleId.replace(/\D/g, '')) || 0,
    input: { question: `preview of ${exampleId}` },
    dataset: { id: datasetId, name: 'Alert triage' },
  },
  task: {
    trace_id: traceId,
    repetition_index: repetitionIndex,
    model: { id: 'model-x', family: 'x', provider: 'p' },
  },
  evaluator: {
    name: evaluator,
    score,
    ...(direction ? { direction } : {}),
    ...(kind ? { kind } : {}),
  },
  metadata: { execution_id: experimentId, suite_id: 'suite', total_repetitions: 1 },
});

const experiment = (
  experimentId: string,
  scores: EvaluationScoreDocument[],
  capped = false
): TranscriptExperiment => ({ experimentId, scores, capped });

const output = (answer: string, tools: string[] = []): StoredExampleDetails => ({
  input: { question: 'Full question text?' },
  output: {
    steps: tools.map((tool_id) => ({ type: 'tool_call', tool_id })),
    messages: [{ message: 'Full question text?' }, { message: answer }],
  },
});

const createHydration = (overrides: Partial<TranscriptHydration> = {}): TranscriptHydration => ({
  details: new Map(),
  traces: new Map(),
  expected: new Map(),
  ...overrides,
});

const detailKey = (experimentId: string, exampleId: string, repetitionIndex = 0): string =>
  repetitionKey({ experimentId, datasetId: 'ds-1', exampleId, repetitionIndex });

const traceSummary = (overrides: Partial<TraceSummary> = {}): TraceSummary => ({
  toolIds: ['platform.core.search'],
  steps: [{ type: 'tool', toolId: 'platform.core.search' }],
  inputTokens: 1200,
  outputTokens: 300,
  answer: 'Answer from the trace',
  ...overrides,
});

describe('transcript report', () => {
  describe('pairing', () => {
    it('lines up the same example and repetition across experiments', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', repetitionIndex: 0, score: 1 }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', repetitionIndex: 1, score: 0.5 }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-1', repetitionIndex: 1, score: 0 }),
      ]);

      const report = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [a, b],
        hydration: createHydration(),
      });

      expect(report.examples).toHaveLength(1);
      const [example] = report.examples;
      expect(example.repetitions.map((r) => r.repetitionIndex)).toEqual([0, 1]);
      expect(example.repetitions[0].cells.map((cell) => cell?.experimentId)).toEqual([
        'exp-a',
        undefined,
      ]);
      expect(example.repetitions[1].cells.map((cell) => cell?.experimentId)).toEqual([
        'exp-a',
        'exp-b',
      ]);
    });

    it('averages an example across repetitions for the gap', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', repetitionIndex: 0, score: 1 }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', repetitionIndex: 1, score: 0 }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: 0.1 }),
      ]);

      const [example] = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [a, b],
        hydration: createHydration(),
      }).examples;

      expect(example.gap).toBeCloseTo(0.4);
    });

    it('keeps only the examples every experiment scored and counts the rest', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1 }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-2', score: 1 }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-9', score: 1, datasetId: 'only-a' }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: 1 }),
      ]);

      const { experiments, droppedExamples } = filterToOverlappingExamples([a, b]);

      expect(experiments[0].scores.map((s) => s.example.id)).toEqual(['ex-1']);
      expect(droppedExamples).toBe(2);
      expect(collectRepetitionRefs(experiments)).toHaveLength(2);

      const report = buildTranscriptReport({
        experiments,
        droppedExamples,
        hydration: createHydration(),
      });
      expect(report.examples.map((example) => example.exampleId)).toEqual(['ex-1']);
      expect(report.warnings).toContain(
        '2 example(s) were not scored by every experiment and are left out.'
      );
    });

    it('keeps the datasets in common even when each experiment has an example the other lacks', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1 }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-2', score: 1 }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-2', score: 1 }),
        createScore({ experimentId: 'exp-b', exampleId: 'ex-3', score: 1 }),
      ]);

      const { experiments, droppedExamples } = filterToOverlappingExamples([a, b]);
      const { examples } = buildTranscriptReport({
        experiments,
        droppedExamples,
        hydration: createHydration(),
      });

      expect(examples.map((example) => example.exampleId)).toEqual(['ex-2']);
    });

    it('throws when no example is scored by every experiment', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1 }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-2', score: 1 }),
      ]);

      expect(() => filterToOverlappingExamples([a, b])).toThrow('No overlapping examples');
    });
  });

  describe('sorting', () => {
    it('puts the example with the largest sort-evaluator gap first', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 0.9 }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-2', score: 1 }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-3', score: 0.5 }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: 0.8 }),
        createScore({ experimentId: 'exp-b', exampleId: 'ex-2', score: 0 }),
        createScore({ experimentId: 'exp-b', exampleId: 'ex-3', score: 0.2 }),
      ]);

      const { examples } = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [a, b],
        hydration: createHydration(),
      });

      expect(examples.map((example) => example.exampleId)).toEqual(['ex-2', 'ex-3', 'ex-1']);
    });

    it('sorts by the evaluator named in sortEvaluator', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1, evaluator: 'Other' }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-2', score: 1, evaluator: 'Other' }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: 0.9, evaluator: 'Other' }),
        createScore({ experimentId: 'exp-b', exampleId: 'ex-2', score: 0.1, evaluator: 'Other' }),
      ]);

      const { examples, warnings } = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [a, b],
        hydration: createHydration(),
        sortEvaluator: 'Other',
      });

      expect(examples.map((example) => example.exampleId)).toEqual(['ex-2', 'ex-1']);
      expect(warnings).toEqual([]);
    });

    it('warns about the requested sort evaluator when no example has it', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-2', score: 1, evaluator: 'Other' }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1, evaluator: 'Other' }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: 1, evaluator: 'Other' }),
      ]);

      const { experiments, droppedExamples } = filterToOverlappingExamples([a, b]);
      const { examples, warnings } = buildTranscriptReport({
        experiments,
        droppedExamples,
        hydration: createHydration(),
      });

      expect(examples.map((example) => example.exampleId)).toEqual(['ex-1']);
      expect(warnings).toContain(
        '1 example(s) were not scored by every experiment and are left out.'
      );
      expect(warnings.some((warning) => warning.includes('"Factuality"'))).toBe(true);
    });

    it('sorts by the evaluator with the most scored examples when the requested one is absent', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1, evaluator: 'criteria' }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-2', score: 0, evaluator: 'criteria' }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1, evaluator: 'Rare' }),
      ]);
      const b = experiment('exp-b', [
        createScore({
          experimentId: 'exp-b',
          exampleId: 'ex-1',
          score: 0.9,
          evaluator: 'criteria',
        }),
        createScore({ experimentId: 'exp-b', exampleId: 'ex-2', score: 1, evaluator: 'criteria' }),
        createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: 1, evaluator: 'Rare' }),
      ]);

      const report = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [a, b],
        hydration: createHydration(),
      });

      expect(report.sortEvaluator).toBe('criteria');
      expect(report.sorted).toBe(true);
      expect(report.examples.map((example) => example.exampleId)).toEqual(['ex-2', 'ex-1']);
      expect(report.warnings).toEqual([
        'Sort evaluator "Factuality" has no scores in these experiments; sorted by "criteria" instead (available: criteria, Rare).',
      ]);
      expect(renderTranscriptMarkdown(report)).toContain(
        'sorted by the largest criteria gap between experiments'
      );
    });

    describe('when the requested sort evaluator has no scores', () => {
      interface EvaluatorSpec {
        name: string;
        values: number[];
        direction?: 'maximize' | 'minimize' | 'neutral';
        kind?: 'llm' | 'code';
      }
      const sortedBy = (specs: EvaluatorSpec[]): string => {
        const docs = (experimentId: string) =>
          experiment(
            experimentId,
            specs.flatMap(({ name, values, direction, kind }) =>
              values.map((score, i) =>
                createScore({
                  experimentId,
                  exampleId: `ex-${i + 1}`,
                  score,
                  evaluator: name,
                  direction,
                  kind,
                })
              )
            )
          );
        return buildTranscriptReport({
          droppedExamples: 0,
          experiments: [docs('exp-a'), docs('exp-b')],
          hydration: createHydration(),
        }).sortEvaluator;
      };

      it('prefers a maximize judge over a minimize cost metric with more scored examples', () => {
        const docs = (experimentId: string) =>
          experiment(experimentId, [
            ...[0.5, 0.4, 0.6].map((score, i) =>
              createScore({
                experimentId,
                exampleId: `ex-${i + 1}`,
                score,
                evaluator: 'Estimated Cost (USD)',
                direction: 'minimize',
                kind: 'code',
              })
            ),
            ...[1, 0.5].map((score, i) =>
              createScore({
                experimentId,
                exampleId: `ex-${i + 1}`,
                score,
                evaluator: 'criteria',
                direction: 'maximize',
                kind: 'llm',
              })
            ),
          ]);

        const report = buildTranscriptReport({
          droppedExamples: 0,
          experiments: [docs('exp-a'), docs('exp-b')],
          hydration: createHydration(),
        });

        expect(report.sortEvaluator).toBe('criteria');
        expect(report.warnings).toEqual([
          'Sort evaluator "Factuality" has no scores in these experiments; sorted by "criteria" instead (available: criteria, Estimated Cost (USD)).',
        ]);
      });

      it('skips an evaluator scored in only one experiment while another has gap coverage', () => {
        const a = experiment('exp-a', [
          createScore({
            experimentId: 'exp-a',
            exampleId: 'ex-1',
            score: 1,
            evaluator: 'OneSided',
            direction: 'maximize',
            kind: 'llm',
          }),
          createScore({
            experimentId: 'exp-a',
            exampleId: 'ex-1',
            score: 1,
            evaluator: 'Rows',
            direction: 'maximize',
            kind: 'code',
          }),
        ]);
        const b = experiment('exp-b', [
          createScore({
            experimentId: 'exp-b',
            exampleId: 'ex-1',
            score: 0.5,
            evaluator: 'Rows',
            direction: 'maximize',
            kind: 'code',
          }),
        ]);

        expect(
          buildTranscriptReport({
            droppedExamples: 0,
            experiments: [a, b],
            hydration: createHydration(),
          })
        ).toMatchObject({ sortEvaluator: 'Rows', sorted: true });
      });

      it('falls back when the requested evaluator is scored in only one experiment', () => {
        const a = experiment('exp-a', [
          createScore({
            experimentId: 'exp-a',
            exampleId: 'ex-1',
            score: 1,
            evaluator: 'Factuality',
          }),
          createScore({
            experimentId: 'exp-a',
            exampleId: 'ex-1',
            score: 1,
            evaluator: 'criteria',
          }),
        ]);
        const b = experiment('exp-b', [
          createScore({
            experimentId: 'exp-b',
            exampleId: 'ex-1',
            score: 0,
            evaluator: 'criteria',
          }),
        ]);

        const report = buildTranscriptReport({
          droppedExamples: 0,
          experiments: [a, b],
          hydration: createHydration(),
        });

        expect(report.sortEvaluator).toBe('criteria');
        expect(report.warnings).toEqual([
          'Sort evaluator "Factuality" has no example scored by 2+ experiments; sorted by "criteria" instead (available: criteria, Factuality).',
        ]);
      });

      it('keeps the requested evaluator once an example is scored by two experiments', () => {
        const docs = (experimentId: string, score: number) =>
          experiment(experimentId, [
            createScore({ experimentId, exampleId: 'ex-1', score, evaluator: 'Factuality' }),
          ]);

        expect(
          buildTranscriptReport({
            droppedExamples: 0,
            experiments: [docs('exp-a', 1), docs('exp-b', 0)],
            hydration: createHydration(),
          })
        ).toMatchObject({ sortEvaluator: 'Factuality', warnings: [] });
      });

      it('ranks a maximize judge above a maximize code check', () => {
        expect(
          sortedBy([
            { name: 'Compliance', values: [1, 1, 1], direction: 'maximize', kind: 'code' },
            { name: 'criteria', values: [1, 0], direction: 'maximize', kind: 'llm' },
          ])
        ).toBe('criteria');
      });

      it('uses the [0,1] tier for documents without a direction or kind', () => {
        expect(
          sortedBy([
            { name: 'Tool Calls', values: [3, 12, 5] },
            { name: 'Old Quality', values: [1, 0.5] },
          ])
        ).toBe('Old Quality');
      });

      it('ranks a [0,1] maximize evaluator above another maximize evaluator', () => {
        expect(
          sortedBy([
            { name: 'Rows', values: [10, 20, 30], direction: 'maximize', kind: 'code' },
            { name: 'Ratio', values: [0.2, 0.9], direction: 'maximize', kind: 'code' },
          ])
        ).toBe('Ratio');
      });

      it('skips neutral and minimize evaluators while a maximize one exists', () => {
        expect(
          sortedBy([
            { name: 'Latency', values: [1, 2, 3], direction: 'minimize', kind: 'code' },
            { name: 'Tool Calls', values: [1, 2, 3], direction: 'neutral', kind: 'code' },
            { name: 'Rows', values: [10, 20], direction: 'maximize', kind: 'code' },
          ])
        ).toBe('Rows');
      });

      it('breaks ties by scored-example count, then by name', () => {
        expect(
          sortedBy([
            { name: 'B', values: [1, 1], direction: 'maximize', kind: 'llm' },
            { name: 'A', values: [1, 1], direction: 'maximize', kind: 'llm' },
            { name: 'C', values: [1], direction: 'maximize', kind: 'llm' },
          ])
        ).toBe('A');
        expect(
          sortedBy([
            { name: 'A', values: [1], direction: 'maximize', kind: 'llm' },
            { name: 'B', values: [1, 1], direction: 'maximize', kind: 'llm' },
          ])
        ).toBe('B');
      });

      it('falls back to a minimize metric when nothing else exists', () => {
        expect(
          sortedBy([
            { name: 'Estimated Cost (USD)', values: [0.5, 0.4], direction: 'minimize' },
            { name: 'Latency', values: [1, 2, 3], direction: 'minimize' },
          ])
        ).toBe('Latency');
      });
    });

    it('does not claim a sort in the header when no example has a gap', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1 }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: null }),
      ]);

      const report = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [a, b],
        hydration: createHydration(),
      });

      expect(renderTranscriptMarkdown(report)).toContain('1 example(s), in dataset order.');
      expect(renderTranscriptMarkdown(report)).not.toContain('sorted by the largest');
      expect(renderTranscriptHtml(report)).not.toContain('sorted by the largest');
    });
  });

  describe('answers', () => {
    const scores = [
      createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1, traceId: 'trace-a' }),
    ];

    it('prefers the stored output over the trace', () => {
      const hydration = createHydration({
        details: new Map([[detailKey('exp-a', 'ex-1'), output('Stored answer', ['stored.tool'])]]),
        traces: new Map([['trace-a', traceSummary()]]),
      });

      const [{ repetitions }] = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [experiment('exp-a', scores)],
        hydration,
      }).examples;
      const [cell] = repetitions[0].cells;

      expect(cell).toMatchObject({
        answer: 'Stored answer',
        answerSource: 'output',
        toolTrail: ['stored.tool'],
        toolTrailSource: 'output',
        // tokens only exist on the trace
        inputTokens: 1200,
        outputTokens: 300,
        trace: 'available',
      });
    });

    it('falls back to the trace when the stored output is missing', () => {
      const hydration = createHydration({
        details: new Map([[detailKey('exp-a', 'ex-1'), { input: null, output: null }]]),
        traces: new Map([['trace-a', traceSummary()]]),
      });

      const [cell] = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [experiment('exp-a', scores)],
        hydration,
      }).examples[0].repetitions[0].cells;

      expect(cell).toMatchObject({
        answer: 'Answer from the trace',
        answerSource: 'trace',
        toolTrail: ['platform.core.search'],
        toolTrailSource: 'trace',
      });
    });

    describe('tool trail source', () => {
      const build = (hydration: TranscriptHydration) =>
        buildTranscriptReport({
          droppedExamples: 0,
          experiments: [experiment('exp-a', scores)],
          hydration,
        });

      it('reports none, from the output, when a readable output made no tool calls and there is no trace', () => {
        const noTrace = [createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1 })];
        const report = buildTranscriptReport({
          droppedExamples: 0,
          experiments: [experiment('exp-a', noTrace)],
          hydration: createHydration({
            details: new Map([[detailKey('exp-a', 'ex-1'), output('Stored answer')]]),
          }),
        });
        const [cell] = report.examples[0].repetitions[0].cells;

        expect(cell).toMatchObject({ toolTrail: [], toolTrailSource: 'output' });
        expect(renderTranscriptMarkdown(report)).toContain('| Tools | none |');
      });

      it('keeps the output as the authority when the trace lists tools the output does not', () => {
        const [cell] = build(
          createHydration({
            details: new Map([[detailKey('exp-a', 'ex-1'), output('Stored answer')]]),
            traces: new Map([['trace-a', traceSummary()]]),
          })
        ).examples[0].repetitions[0].cells;

        expect(cell).toMatchObject({ toolTrail: [], toolTrailSource: 'output' });
      });

      it('stays unavailable when neither the output nor a trace can be read', () => {
        const noTrace = [createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1 })];
        const report = buildTranscriptReport({
          droppedExamples: 0,
          experiments: [experiment('exp-a', noTrace)],
          hydration: createHydration({
            details: new Map([[detailKey('exp-a', 'ex-1'), { input: null, output: null }]]),
          }),
        });
        const [cell] = report.examples[0].repetitions[0].cells;

        expect(cell).toMatchObject({ toolTrailSource: 'unavailable' });
        expect(renderTranscriptMarkdown(report)).toContain('| Tools | unavailable |');
      });
    });

    it('falls back to the trace when the output has no final message', () => {
      const hydration = createHydration({
        details: new Map([[detailKey('exp-a', 'ex-1'), { input: null, output: { steps: [] } }]]),
        traces: new Map([['trace-a', traceSummary()]]),
      });

      const [cell] = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [experiment('exp-a', scores)],
        hydration,
      }).examples[0].repetitions[0].cells;

      expect(cell?.answerSource).toBe('trace');
    });

    it('shows a trace with no spans as unavailable, never as zero', () => {
      const hydration = createHydration({
        details: new Map([[detailKey('exp-a', 'ex-1'), { input: null, output: null }]]),
        traces: new Map([['trace-a', null]]),
      });
      const report = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [experiment('exp-a', scores)],
        hydration,
      });
      const [cell] = report.examples[0].repetitions[0].cells;

      expect(cell).toMatchObject({
        answerSource: 'unavailable',
        toolTrailSource: 'unavailable',
        trace: 'unavailable',
      });
      expect(cell?.inputTokens).toBeUndefined();

      const markdown = renderTranscriptMarkdown(report);
      expect(markdown).toContain('unavailable (trace has no spans or could not be read)');
      expect(markdown).not.toContain('in 0 / out 0');
    });

    it('says when a score has no trace id at all', () => {
      const report = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [
          experiment('exp-a', [
            createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1 }),
          ]),
        ],
        hydration: createHydration(),
      });

      expect(report.examples[0].repetitions[0].cells[0]?.trace).toBe('none');
      expect(renderTranscriptMarkdown(report)).toContain('unavailable (no trace id)');
    });

    it('takes the question from the full input and the expected answer from the dataset', () => {
      const hydration = createHydration({
        details: new Map([[detailKey('exp-a', 'ex-1'), output('A')]]),
        expected: new Map([[exampleKey('ds-1', 'ex-1'), { expected: 'The reference answer' }]]),
      });

      const [example] = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [experiment('exp-a', scores)],
        hydration,
      }).examples;

      expect(example.question).toBe('Full question text?');
      expect(example.expected).toBe('The reference answer');
    });

    describe('expected answer matching', () => {
      const datasetExamples = [
        { id: 'hash-a', input: { question: 'first' }, output: { expected: 'First' } },
        { id: 'hash-b', input: { question: 'second' }, output: { expected: 'Second' } },
      ];

      it('matches by input when the dataset order differs from the score order', () => {
        // Scores numbered "0" and "1" in run order; the dataset has since been reordered.
        const { expected, byPosition } = expectedOutputsByExample(
          'ds-1',
          [...datasetExamples].reverse(),
          [
            { id: '0', index: 0, input: { question: 'first' } },
            { id: '1', index: 1, input: { question: 'second' } },
          ]
        );

        expect(expected.get(exampleKey('ds-1', '0'))).toEqual({ expected: 'First' });
        expect(expected.get(exampleKey('ds-1', '1'))).toEqual({ expected: 'Second' });
        expect(byPosition.size).toBe(0);
      });

      it('ignores key order when comparing inputs', () => {
        const { expected } = expectedOutputsByExample(
          'ds-1',
          [{ id: 'h', input: { a: 1, b: { c: 2, d: 3 } }, output: 'match' }],
          [{ id: '0', index: 0, input: { b: { d: 3, c: 2 }, a: 1 } }]
        );

        expect(expected.get(exampleKey('ds-1', '0'))).toBe('match');
      });

      it('falls back to the hashed id, then reports a position-only match', () => {
        const { expected, byPosition } = expectedOutputsByExample('ds-1', datasetExamples, [
          { id: 'hash-b', index: 7 },
          { id: '0', index: 0 },
        ]);

        expect(expected.get(exampleKey('ds-1', 'hash-b'))).toEqual({ expected: 'Second' });
        expect(expected.get(exampleKey('ds-1', '0'))).toEqual({ expected: 'First' });
        expect([...byPosition]).toEqual([exampleKey('ds-1', '0')]);
      });

      it('does not hand the same duplicate-input dataset example to two scored examples', () => {
        const duplicates = [
          { id: 'd1', input: { question: 'same' }, output: { expected: 'One' } },
          { id: 'd2', input: { question: 'same' }, output: { expected: 'Two' } },
        ];

        const { expected, byPosition } = expectedOutputsByExample('ds-1', duplicates, [
          { id: 'd1', index: 7 },
          { id: 'x', index: 0, input: { question: 'same' } },
        ]);

        expect(expected.get(exampleKey('ds-1', 'd1'))).toEqual({ expected: 'One' });
        expect(expected.get(exampleKey('ds-1', 'x'))).toEqual({ expected: 'Two' });
        expect(byPosition.size).toBe(0);
      });

      it('does not re-match an input-matched dataset example by id or position', () => {
        const dataset = [
          { id: 'd1', input: { question: 'first' }, output: { expected: 'One' } },
          { id: 'd2', input: { question: 'second' }, output: { expected: 'Two' } },
        ];

        const { expected, byPosition } = expectedOutputsByExample('ds-1', dataset, [
          { id: 'x', index: 5, input: { question: 'first' } },
          { id: 'd1', index: 1 },
          { id: 'y', index: 0 },
        ]);

        expect(expected.get(exampleKey('ds-1', 'x'))).toEqual({ expected: 'One' });
        expect(expected.get(exampleKey('ds-1', 'd1'))).toEqual({ expected: 'Two' });
        expect(expected.has(exampleKey('ds-1', 'y'))).toBe(false);
        expect([...byPosition]).toEqual([exampleKey('ds-1', 'd1')]);
      });

      it('lets a later exact match keep the dataset example an earlier position guess points at', () => {
        const dataset = [
          { id: 'd1', input: { question: 'first' }, output: { expected: 'One' } },
          { id: 'd2', input: { question: 'second' }, output: { expected: 'Two' } },
        ];

        // "early" has no input or id match and its index points at d2, which "late" matches by input.
        const { expected, byPosition } = expectedOutputsByExample('ds-1', dataset, [
          { id: 'early', index: 1, input: { question: 'unknown' } },
          { id: 'late', index: 9, input: { question: 'second' } },
        ]);

        expect(expected.get(exampleKey('ds-1', 'late'))).toEqual({ expected: 'Two' });
        expect(expected.has(exampleKey('ds-1', 'early'))).toBe(false);
        expect(byPosition.size).toBe(0);
      });

      it('lets a later id match keep the dataset example an earlier position guess points at', () => {
        const dataset = [
          { id: 'd1', output: { expected: 'One' } },
          { id: 'd2', output: { expected: 'Two' } },
        ];

        const { expected, byPosition } = expectedOutputsByExample('ds-1', dataset, [
          { id: 'early', index: 1 },
          { id: 'd2', index: 9 },
        ]);

        expect(expected.get(exampleKey('ds-1', 'd2'))).toEqual({ expected: 'Two' });
        expect(expected.has(exampleKey('ds-1', 'early'))).toBe(false);
        expect(byPosition.size).toBe(0);
      });

      it('warns how many expected answers were matched by position only', () => {
        const report = buildTranscriptReport({
          droppedExamples: 0,
          experiments: [
            experiment('exp-a', [
              createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1 }),
            ]),
          ],
          hydration: createHydration({
            expectedByPosition: new Set([exampleKey('ds-1', 'ex-1')]),
          }),
        });

        expect(report.warnings).toContain(
          'Expected answers for 1 example(s) were matched by dataset position only; they may be wrong if the dataset changed.'
        );
      });

      describe('with the scores API shape (score docs carry no example.input)', () => {
        const withoutInput = (doc: EvaluationScoreDocument): EvaluationScoreDocument => ({
          ...doc,
          example: { ...doc.example, input: undefined },
        });
        const scoreDoc = (experimentId: string, exampleId: string) =>
          withoutInput(createScore({ experimentId, exampleId, score: 1 }));
        const detail = (question: string): StoredExampleDetails => ({
          input: { question },
          output: null,
        });
        const dataset = [
          { id: 'hash-a', input: { question: 'first' }, output: { expected: 'First' } },
          { id: 'hash-b', input: { question: 'second' }, output: { expected: 'Second' } },
        ];

        it('takes each example input from the stored details', () => {
          const experiments = [
            experiment('exp-a', [scoreDoc('exp-a', '0'), scoreDoc('exp-a', '1')]),
            experiment('exp-b', [scoreDoc('exp-b', '0'), scoreDoc('exp-b', '1')]),
          ];
          const details = new Map([
            [detailKey('exp-b', '0'), detail('first')],
            [detailKey('exp-a', '1'), detail('second')],
          ]);

          expect(collectScoredExamples(experiments, details).get('ds-1')).toEqual([
            { id: '0', index: 0, input: { question: 'first' } },
            { id: '1', index: 1, input: { question: 'second' } },
          ]);
        });

        it('keeps the expected answer with its input when the dataset order differs', () => {
          const experiments = [
            experiment('exp-a', [scoreDoc('exp-a', '0'), scoreDoc('exp-a', '1')]),
          ];
          const details = new Map([
            [detailKey('exp-a', '0'), detail('first')],
            [detailKey('exp-a', '1'), detail('second')],
          ]);

          const { expected, byPosition } = expectedOutputsByExample(
            'ds-1',
            [...dataset].reverse(),
            [...(collectScoredExamples(experiments, details).get('ds-1') ?? [])]
          );

          expect(expected.get(exampleKey('ds-1', '0'))).toEqual({ expected: 'First' });
          expect(expected.get(exampleKey('ds-1', '1'))).toEqual({ expected: 'Second' });
          expect(byPosition.size).toBe(0);
        });

        it('falls back to id, then position with a warning, when details are missing', () => {
          const experiments = [
            experiment('exp-a', [scoreDoc('exp-a', 'hash-b'), scoreDoc('exp-a', '0')]),
          ];
          const details = new Map<string, StoredExampleDetails | null>([
            [detailKey('exp-a', 'hash-b'), null],
          ]);

          const scored = collectScoredExamples(experiments, details).get('ds-1') ?? [];
          const { expected, byPosition } = expectedOutputsByExample('ds-1', dataset, scored);

          expect(scored.every(({ input }) => input === undefined)).toBe(true);
          expect(expected.get(exampleKey('ds-1', 'hash-b'))).toEqual({ expected: 'Second' });
          expect(expected.get(exampleKey('ds-1', '0'))).toEqual({ expected: 'First' });
          expect([...byPosition]).toEqual([exampleKey('ds-1', '0')]);

          const report = buildTranscriptReport({
            droppedExamples: 0,
            experiments,
            hydration: createHydration({ expectedByPosition: byPosition }),
          });
          expect(report.warnings).toContain(
            'Expected answers for 1 example(s) were matched by dataset position only; they may be wrong if the dataset changed.'
          );
        });
      });
    });
  });

  describe('example details filters', () => {
    it('scopes the details read to the execution only when a suite is given', () => {
      expect(exampleDetailsFilters('suite', 'exp-a')).toEqual({ executionId: 'exp-a' });
      expect(exampleDetailsFilters(undefined, 'exp-a')).toBeUndefined();
    });
  });

  describe('cap warning', () => {
    it('names every experiment that hit the scores API cap', () => {
      const report = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [
          experiment(
            'exp-a',
            [createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1 })],
            true
          ),
          experiment('exp-b', [
            createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: 1 }),
          ]),
        ],
        hydration: createHydration(),
      });

      const capWarnings = report.warnings.filter((warning) => warning.includes('cap'));
      expect(capWarnings).toHaveLength(1);
      expect(capWarnings[0]).toContain('exp-a');
      expect(capWarnings[0]).toContain(MAX_SCORES_PER_QUERY.toLocaleString('en-US'));
      expect(renderTranscriptMarkdown(report)).toContain('> **Warning:**');
      expect(renderTranscriptHtml(report)).toContain('class="warning"');
    });
  });

  describe('html', () => {
    it('escapes model text, questions and ids', () => {
      const hostile = '<script>alert("x")</script> & \'quote\'';
      const hydration = createHydration({
        details: new Map([
          [
            detailKey('exp-<a>', 'ex-1'),
            { input: { question: hostile }, output: { messages: [{ message: hostile }] } },
          ],
        ]),
        expected: new Map([[exampleKey('ds-1', 'ex-1'), { expected: hostile }]]),
      });

      const html = renderTranscriptHtml(
        buildTranscriptReport({
          droppedExamples: 0,
          experiments: [
            experiment('exp-<a>', [
              createScore({ experimentId: 'exp-<a>', exampleId: 'ex-1', score: 1 }),
            ]),
          ],
          hydration,
        })
      );

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('exp-<a>');
      expect(html).toContain(
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quote&#39;'
      );
      expect(html).toContain('exp-&lt;a&gt;');
    });
  });

  describe('evaluator names', () => {
    const name = 'Fact <i> & "q" | x';
    const report = buildTranscriptReport({
      droppedExamples: 0,
      experiments: [
        experiment('exp-a', [
          createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1, evaluator: name }),
        ]),
        experiment('exp-b', [
          createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: 0, evaluator: name }),
        ]),
      ],
      hydration: createHydration(),
    });

    it('escapes them once in html', () => {
      const html = renderTranscriptHtml(report);

      expect(html).toContain('Fact &lt;i&gt; &amp; &quot;q&quot; | x');
      expect(html).not.toContain('&amp;lt;');
      expect(html).not.toContain('&amp;amp;');
      expect(html).not.toContain('<i>');
    });

    it('escapes them in the first column of the markdown tables', () => {
      const markdown = renderTranscriptMarkdown(report);

      expect(markdown).toContain('| Fact &lt;i> &amp; "q" \\| x | 1.00 | 0.00 |');
      expect(markdown).not.toContain('<i>');
    });
  });

  describe('markdown', () => {
    it('escapes angle brackets and ampersands in questions and expected answers', () => {
      const hostile = '<script>alert(1)</script> & more';
      const report = buildTranscriptReport({
        droppedExamples: 0,
        experiments: [
          experiment('exp-`a`', [
            createScore({ experimentId: 'exp-`a`', exampleId: 'ex-1', score: 1 }),
          ]),
        ],
        hydration: createHydration({
          details: new Map([
            [
              detailKey('exp-`a`', 'ex-1'),
              { input: { question: hostile }, output: { messages: [{ message: 'A' }] } },
            ],
          ]),
          expected: new Map([[exampleKey('ds-1', 'ex-1'), { expected: hostile }]]),
        }),
      });

      const markdown = renderTranscriptMarkdown(report);

      expect(markdown).not.toContain('<script>');
      expect(markdown.match(/&lt;script/g)).toHaveLength(2);
      expect(markdown).toContain('- **A**: `` exp-`a` ``');
    });

    it('renders a stable report', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1, traceId: 'trace-a' }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-2', score: 0.5 }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: 0.25 }),
        createScore({ experimentId: 'exp-b', exampleId: 'ex-2', score: 0.5 }),
      ]);
      const hydration = createHydration({
        details: new Map([
          [
            detailKey('exp-a', 'ex-1'),
            output('Skill answer | with a pipe', ['skill.load', 'alerts.search']),
          ],
          [detailKey('exp-b', 'ex-1'), output('Plain answer\nsecond line')],
          [detailKey('exp-a', 'ex-2'), output('Same')],
          [detailKey('exp-b', 'ex-2'), output('Same')],
        ]),
        traces: new Map([['trace-a', traceSummary()]]),
        expected: new Map([[exampleKey('ds-1', 'ex-1'), { expected: 'Reference' }]]),
      });

      expect(
        renderTranscriptMarkdown(
          buildTranscriptReport({ droppedExamples: 0, experiments: [a, b], hydration })
        )
      ).toMatchInlineSnapshot(`
        "# Evaluation transcripts

        - **A**: \`exp-a\`
        - **B**: \`exp-b\`

        2 example(s), sorted by the largest Factuality gap between experiments.

        ## 1. Alert triage · example 1

        Factuality gap: 0.75

        **Question**

        > Full question text?

        **Expected**

        > Reference

        **Mean scores**

        | | **A** | **B** |
        | --- | --- | --- |
        | Factuality | 1.00 | 0.25 |

        ### Repetition 0

        | | **A** | **B** |
        | --- | --- | --- |
        | Model | model-x | model-x |
        | Answer | Skill answer \\\\| with a pipe | Plain answer<br>second line |
        | Tools | 1. skill.load<br>2. alerts.search | none |
        | Tokens (all models) | in 1200 / out 300 | unavailable (no trace id) |
        | Scores | Factuality: 1.00 | Factuality: 0.25 |

        ## 2. Alert triage · example 2

        Factuality gap: 0.00

        **Question**

        > Full question text?

        **Expected**

        > (none)

        **Mean scores**

        | | **A** | **B** |
        | --- | --- | --- |
        | Factuality | 0.50 | 0.50 |

        ### Repetition 0

        | | **A** | **B** |
        | --- | --- | --- |
        | Model | model-x | model-x |
        | Answer | Same | Same |
        | Tools | none | none |
        | Tokens (all models) | unavailable (no trace id) | unavailable (no trace id) |
        | Scores | Factuality: 0.50 | Factuality: 0.50 |
        "
      `);
    });
  });
});
