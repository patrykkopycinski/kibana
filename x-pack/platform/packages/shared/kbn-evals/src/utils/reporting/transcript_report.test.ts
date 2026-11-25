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
  exampleKey,
  expectedOutputsByExample,
  filterToOverlappingDatasets,
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
}: {
  experimentId: string;
  exampleId: string;
  repetitionIndex?: number;
  score: number | null;
  evaluator?: string;
  traceId?: string | null;
  datasetId?: string;
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
  evaluator: { name: evaluator, score },
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

      const report = buildTranscriptReport({ experiments: [a, b], hydration: createHydration() });

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
        experiments: [a, b],
        hydration: createHydration(),
      }).examples;

      expect(example.gap).toBeCloseTo(0.4);
    });

    it('keeps only datasets every experiment scored', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1 }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-9', score: 1, datasetId: 'only-a' }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: 1 }),
      ]);

      const filtered = filterToOverlappingDatasets([a, b]);

      expect(filtered[0].scores.map((s) => s.example.dataset.id)).toEqual(['ds-1']);
      expect(collectRepetitionRefs(filtered)).toHaveLength(2);
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
        experiments: [a, b],
        hydration: createHydration(),
        sortEvaluator: 'Other',
      });

      expect(examples.map((example) => example.exampleId)).toEqual(['ex-2', 'ex-1']);
      expect(warnings).toEqual([]);
    });

    it('warns and keeps a stable order when no example has the sort evaluator', () => {
      const a = experiment('exp-a', [
        createScore({ experimentId: 'exp-a', exampleId: 'ex-2', score: 1, evaluator: 'Other' }),
        createScore({ experimentId: 'exp-a', exampleId: 'ex-1', score: 1, evaluator: 'Other' }),
      ]);
      const b = experiment('exp-b', [
        createScore({ experimentId: 'exp-b', exampleId: 'ex-1', score: 1, evaluator: 'Other' }),
      ]);

      const { examples, warnings } = buildTranscriptReport({
        experiments: [a, b],
        hydration: createHydration(),
      });

      expect(examples.map((example) => example.exampleId)).toEqual(['ex-1', 'ex-2']);
      expect(warnings[0]).toContain('"Factuality"');
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

    it('falls back to the trace when the output has no final message', () => {
      const hydration = createHydration({
        details: new Map([[detailKey('exp-a', 'ex-1'), { input: null, output: { steps: [] } }]]),
        traces: new Map([['trace-a', traceSummary()]]),
      });

      const [cell] = buildTranscriptReport({
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
        experiments: [experiment('exp-a', scores)],
        hydration,
      }).examples;

      expect(example.question).toBe('Full question text?');
      expect(example.expected).toBe('The reference answer');
    });

    it('finds the expected answer when scores number the example by its position in the dataset', () => {
      // Stored score documents use example.id "0", "1", ... while the dataset keeps hashed ids.
      const expected = expectedOutputsByExample('ds-1', [
        { id: 'hash-a', output: { expected: 'First' } },
        { id: 'hash-b', output: { expected: 'Second' } },
      ]);

      expect(expected.get(exampleKey('ds-1', '1'))).toEqual({ expected: 'Second' });
      expect(expected.get(exampleKey('ds-1', 'hash-a'))).toEqual({ expected: 'First' });
    });
  });

  describe('cap warning', () => {
    it('names every experiment that hit the scores API cap', () => {
      const report = buildTranscriptReport({
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

  describe('markdown', () => {
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

      expect(renderTranscriptMarkdown(buildTranscriptReport({ experiments: [a, b], hydration })))
        .toMatchInlineSnapshot(`
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
        | Tools | 1. skill.load<br>2. alerts.search | unavailable |
        | Tokens | in 1200 / out 300 | unavailable (no trace id) |
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
        | Tools | unavailable | unavailable |
        | Tokens | unavailable (no trace id) | unavailable (no trace id) |
        | Scores | Factuality: 0.50 | Factuality: 0.50 |
        "
      `);
    });
  });
});
