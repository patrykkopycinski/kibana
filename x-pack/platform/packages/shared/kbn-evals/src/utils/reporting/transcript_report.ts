/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationScoreDocument, TraceSummary } from '@kbn/evals-common';
import { MAX_SCORES_PER_QUERY } from '@kbn/evals-common';
import { getFinalAssistantMessage, getToolCallSteps } from '../evaluation_helpers';

export const DEFAULT_SORT_EVALUATOR = 'Factuality';

export interface TranscriptExperiment {
  experimentId: string;
  scores: EvaluationScoreDocument[];
  /** True when the scores read reached the scores API cap, so later examples may be missing. */
  capped: boolean;
}

export interface RepetitionRef {
  experimentId: string;
  datasetId: string;
  exampleId: string;
  repetitionIndex: number;
}

export interface StoredExampleDetails {
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
}

/** Everything the report needs that does not come from the score documents. */
export interface TranscriptHydration {
  /** Full input and output per repetition, by `repetitionKey`. Absent or null = not readable. */
  details: Map<string, StoredExampleDetails | null>;
  /** Trace summary per trace id. Null = the trace could not be read or had no spans. */
  traces: Map<string, TraceSummary | null>;
  /** The dataset's expected output per example, by `exampleKey`. */
  expected: Map<string, unknown>;
}

export type AnswerSource = 'output' | 'trace' | 'unavailable';
export type TraceStatus = 'none' | 'unavailable' | 'available';

export interface TranscriptCell {
  experimentId: string;
  repetitionIndex: number;
  model?: string;
  answer?: string;
  answerSource: AnswerSource;
  toolTrail: string[];
  toolTrailSource: 'output' | 'trace' | 'unavailable';
  inputTokens?: number;
  outputTokens?: number;
  trace: TraceStatus;
  scores: Array<{ name: string; score: number | null }>;
}

export interface TranscriptRepetition {
  repetitionIndex: number;
  /** One entry per experiment, in `experimentIds` order; undefined when that run has no such repetition. */
  cells: Array<TranscriptCell | undefined>;
}

export interface TranscriptExample {
  datasetId: string;
  datasetName: string;
  exampleId: string;
  exampleIndex: number;
  question: string;
  expected: string;
  /** Spread of the mean sort-evaluator score between experiments; undefined when fewer than two have one. */
  gap?: number;
  /** Mean score per evaluator and experiment, aligned with `experimentIds`. */
  scoreMeans: Array<{ evaluator: string; byExperiment: Array<number | undefined> }>;
  repetitions: TranscriptRepetition[];
}

export interface TranscriptReport {
  experimentIds: string[];
  sortEvaluator: string;
  warnings: string[];
  examples: TranscriptExample[];
}

const SEP = '\u0000';

export const exampleKey = (datasetId: string, exampleId: string): string =>
  `${datasetId}${SEP}${exampleId}`;

/**
 * Expected outputs of a dataset's examples, keyed for `TranscriptHydration.expected`. Score
 * documents number an example by its position in the dataset ("0", "1", ...) while the dataset
 * stores each example under a generated id, so each output is keyed by both.
 */
export const expectedOutputsByExample = (
  datasetId: string,
  examples: Array<{ id: string; output?: unknown }>
): Map<string, unknown> => {
  const expected = new Map<string, unknown>();
  examples.forEach(({ output }, position) => {
    expected.set(exampleKey(datasetId, String(position)), output);
  });
  for (const { id, output } of examples) {
    expected.set(exampleKey(datasetId, id), output);
  }
  return expected;
};

export const repetitionKey = ({
  experimentId,
  datasetId,
  exampleId,
  repetitionIndex,
}: RepetitionRef): string =>
  [experimentId, datasetId, exampleId, String(repetitionIndex)].join(SEP);

const repetitionIndexOf = (score: EvaluationScoreDocument): number =>
  score.task.repetition_index ?? 0;

/** Keeps only the datasets every experiment has scores for. */
export const filterToOverlappingDatasets = (
  experiments: TranscriptExperiment[]
): TranscriptExperiment[] => {
  const [first, ...rest] = experiments.map(
    (experiment) => new Set(experiment.scores.map((score) => score.example.dataset.id))
  );
  const shared = new Set([...(first ?? [])].filter((id) => rest.every((ids) => ids.has(id))));
  return experiments.map((experiment) => ({
    ...experiment,
    scores: experiment.scores.filter((score) => shared.has(score.example.dataset.id)),
  }));
};

/** Every distinct example repetition the experiments scored. */
export const collectRepetitionRefs = (experiments: TranscriptExperiment[]): RepetitionRef[] => {
  const refs = new Map<string, RepetitionRef>();
  for (const { experimentId, scores } of experiments) {
    for (const score of scores) {
      const ref: RepetitionRef = {
        experimentId,
        datasetId: score.example.dataset.id,
        exampleId: score.example.id,
        repetitionIndex: repetitionIndexOf(score),
      };
      refs.set(repetitionKey(ref), ref);
    }
  }
  return [...refs.values()];
};

const asText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
};

const QUESTION_KEYS = ['question', 'input', 'prompt', 'query'];

const questionOf = (input: unknown): string => {
  if (!input || typeof input !== 'object') return asText(input);
  const record = input as Record<string, unknown>;
  const key = QUESTION_KEYS.find((candidate) => typeof record[candidate] === 'string');
  return key ? (record[key] as string) : asText(input);
};

const expectedOf = (output: unknown): string => {
  if (output && typeof output === 'object') {
    const { expected } = output as { expected?: unknown };
    if (typeof expected === 'string') return expected;
  }
  return asText(output);
};

const mean = (values: number[]): number | undefined =>
  values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;

const buildCell = ({
  experimentId,
  docs,
  hydration,
}: {
  experimentId: string;
  docs: EvaluationScoreDocument[];
  hydration: TranscriptHydration;
}): TranscriptCell => {
  const [first] = docs;
  const repetitionIndex = repetitionIndexOf(first);
  const details = hydration.details.get(
    repetitionKey({
      experimentId,
      datasetId: first.example.dataset.id,
      exampleId: first.example.id,
      repetitionIndex,
    })
  );
  const traceId = docs.map((doc) => doc.task.trace_id).find((id): id is string => Boolean(id));
  const traceSummary = traceId ? hydration.traces.get(traceId) : undefined;
  const trace: TraceStatus = !traceId ? 'none' : traceSummary ? 'available' : 'unavailable';

  const stored = details?.output ?? undefined;
  const storedAnswer = stored ? getFinalAssistantMessage(stored) : '';
  const storedTools = stored
    ? getToolCallSteps(stored)
        .map((step) => step.tool_id)
        .filter((id): id is string => Boolean(id))
    : [];

  const answer = storedAnswer || traceSummary?.answer;
  const answerSource: AnswerSource = storedAnswer ? 'output' : answer ? 'trace' : 'unavailable';
  const toolTrailSource =
    storedTools.length > 0 ? 'output' : traceSummary ? 'trace' : ('unavailable' as const);

  const byEvaluator = new Map<string, number[]>();
  const missing = new Set<string>();
  for (const doc of docs) {
    const { name, score } = doc.evaluator;
    if (typeof score === 'number' && Number.isFinite(score)) {
      byEvaluator.set(name, [...(byEvaluator.get(name) ?? []), score]);
    } else {
      missing.add(name);
    }
  }
  const scores = [...new Set([...byEvaluator.keys(), ...missing])]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, score: mean(byEvaluator.get(name) ?? []) ?? null }));

  return {
    experimentId,
    repetitionIndex,
    model: first.task.model?.id,
    answer,
    answerSource,
    toolTrail: storedTools.length > 0 ? storedTools : traceSummary?.toolIds ?? [],
    toolTrailSource,
    inputTokens: traceSummary?.inputTokens,
    outputTokens: traceSummary?.outputTokens,
    trace,
    scores,
  };
};

export const buildTranscriptReport = ({
  experiments,
  hydration,
  sortEvaluator = DEFAULT_SORT_EVALUATOR,
}: {
  experiments: TranscriptExperiment[];
  hydration: TranscriptHydration;
  sortEvaluator?: string;
}): TranscriptReport => {
  const experimentIds = experiments.map((experiment) => experiment.experimentId);
  const warnings = experiments
    .filter((experiment) => experiment.capped)
    .map(
      (experiment) =>
        `Experiment ${experiment.experimentId} reached the ${MAX_SCORES_PER_QUERY.toLocaleString(
          'en-US'
        )}-score-document cap of the scores API; examples beyond it are missing from this report.`
    );

  const docsByExample = new Map<
    string,
    Array<{ experimentIndex: number; doc: EvaluationScoreDocument }>
  >();
  experiments.forEach(({ scores }, experimentIndex) => {
    for (const doc of scores) {
      const key = exampleKey(doc.example.dataset.id, doc.example.id);
      docsByExample.set(key, [...(docsByExample.get(key) ?? []), { experimentIndex, doc }]);
    }
  });

  const examples: TranscriptExample[] = [...docsByExample.entries()].map(([key, entries]) => {
    const [{ doc: first }] = entries;
    const repetitionNumbers = [...new Set(entries.map(({ doc }) => repetitionIndexOf(doc)))].sort(
      (a, b) => a - b
    );

    const repetitions: TranscriptRepetition[] = repetitionNumbers.map((repetitionIndex) => ({
      repetitionIndex,
      cells: experimentIds.map((experimentId, experimentIndex) => {
        const docs = entries
          .filter(
            (entry) =>
              entry.experimentIndex === experimentIndex &&
              repetitionIndexOf(entry.doc) === repetitionIndex
          )
          .map((entry) => entry.doc);
        return docs.length > 0 ? buildCell({ experimentId, docs, hydration }) : undefined;
      }),
    }));

    const evaluators = [...new Set(entries.map(({ doc }) => doc.evaluator.name))].sort((a, b) =>
      a.localeCompare(b)
    );
    const scoreMeans = evaluators.map((evaluator) => ({
      evaluator,
      byExperiment: experimentIds.map((_, experimentIndex) =>
        mean(
          entries
            .filter(
              (entry) =>
                entry.experimentIndex === experimentIndex && entry.doc.evaluator.name === evaluator
            )
            .map((entry) => entry.doc.evaluator.score)
            .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))
        )
      ),
    }));

    const sortValues = (
      scoreMeans.find((row) => row.evaluator === sortEvaluator)?.byExperiment ?? []
    ).filter((value): value is number => value !== undefined);
    const gap =
      sortValues.length >= 2 ? Math.max(...sortValues) - Math.min(...sortValues) : undefined;

    const detailsInput = experimentIds
      .flatMap((experimentId) =>
        repetitionNumbers.map((repetitionIndex) =>
          hydration.details.get(
            repetitionKey({
              experimentId,
              datasetId: first.example.dataset.id,
              exampleId: first.example.id,
              repetitionIndex,
            })
          )
        )
      )
      .find((details) => details?.input)?.input;

    return {
      datasetId: first.example.dataset.id,
      datasetName: first.example.dataset.name,
      exampleId: first.example.id,
      exampleIndex: first.example.index,
      question: questionOf(detailsInput ?? first.example.input),
      expected: expectedOf(hydration.expected.get(key)),
      gap,
      scoreMeans,
      repetitions,
    };
  });

  examples.sort((a, b) => {
    if (a.gap !== undefined && b.gap !== undefined && a.gap !== b.gap) return b.gap - a.gap;
    if ((a.gap === undefined) !== (b.gap === undefined)) return a.gap === undefined ? 1 : -1;
    return (
      a.datasetName.localeCompare(b.datasetName) ||
      a.exampleIndex - b.exampleIndex ||
      a.exampleId.localeCompare(b.exampleId)
    );
  });

  if (!examples.some((example) => example.gap !== undefined)) {
    warnings.push(
      `No example has a "${sortEvaluator}" score in two or more experiments, so examples are not sorted by score gap.`
    );
  }

  return { experimentIds, sortEvaluator, warnings, examples };
};

const formatScore = (value: number | null | undefined): string =>
  value === null || value === undefined ? '-' : value.toFixed(2);

const formatTokens = (cell: TranscriptCell): string => {
  if (cell.trace === 'none') return 'unavailable (no trace id)';
  if (cell.trace === 'unavailable') return 'unavailable (trace has no spans or could not be read)';
  if (cell.inputTokens === undefined && cell.outputTokens === undefined) {
    return 'unavailable (no usage on spans)';
  }
  return `in ${cell.inputTokens ?? '-'} / out ${cell.outputTokens ?? '-'}`;
};

const formatTools = (cell: TranscriptCell): string => {
  if (cell.toolTrailSource === 'unavailable') return 'unavailable';
  if (cell.toolTrail.length === 0) return 'none';
  return cell.toolTrail.map((tool, index) => `${index + 1}. ${tool}`).join('\n');
};

const formatAnswer = (cell: TranscriptCell): string => {
  if (cell.answer === undefined) return 'unavailable';
  return cell.answerSource === 'trace'
    ? `${cell.answer}\n\n(answer read from the trace)`
    : cell.answer;
};

const escapeMarkdownCell = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, '<br>');

const quote = (value: string): string =>
  value
    ? value
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join('\n')
    : '> (none)';

const markdownRow = (label: string, values: string[]): string =>
  `| ${[label, ...values.map(escapeMarkdownCell)].join(' | ')} |`;

export const renderTranscriptMarkdown = (report: TranscriptReport): string => {
  const { experimentIds, sortEvaluator, warnings, examples } = report;
  const lines: string[] = [
    '# Evaluation transcripts',
    '',
    ...experimentIds.map((id, index) => `- **${String.fromCharCode(65 + index)}**: \`${id}\``),
    '',
    `${examples.length} example(s), sorted by the largest ${sortEvaluator} gap between experiments.`,
    '',
  ];

  if (warnings.length > 0) {
    lines.push(...warnings.map((warning) => `> **Warning:** ${warning}`), '');
  }

  const columns = experimentIds.map((_, index) => `**${String.fromCharCode(65 + index)}**`);
  const header = `| | ${columns.join(' | ')} |`;
  const divider = `|${' --- |'.repeat(columns.length + 1)}`;

  examples.forEach((example, index) => {
    lines.push(
      `## ${index + 1}. ${escapeMarkdownCell(example.datasetName)} · example ${
        example.exampleIndex
      }`,
      '',
      `${sortEvaluator} gap: ${formatScore(example.gap)}`,
      '',
      '**Question**',
      '',
      quote(example.question),
      '',
      '**Expected**',
      '',
      quote(example.expected),
      '',
      '**Mean scores**',
      '',
      header,
      divider,
      ...example.scoreMeans.map((row) =>
        markdownRow(
          row.evaluator,
          row.byExperiment.map((value) => formatScore(value))
        )
      ),
      ''
    );

    for (const repetition of example.repetitions) {
      const cells = repetition.cells;
      lines.push(
        `### Repetition ${repetition.repetitionIndex}`,
        '',
        header,
        divider,
        markdownRow(
          'Model',
          cells.map((cell) => cell?.model ?? '-')
        ),
        markdownRow(
          'Answer',
          cells.map((cell) => (cell ? formatAnswer(cell) : 'no run'))
        ),
        markdownRow(
          'Tools',
          cells.map((cell) => (cell ? formatTools(cell) : '-'))
        ),
        markdownRow(
          'Tokens',
          cells.map((cell) => (cell ? formatTokens(cell) : '-'))
        ),
        markdownRow(
          'Scores',
          cells.map((cell) =>
            cell
              ? cell.scores.map(({ name, score }) => `${name}: ${formatScore(score)}`).join('\n')
              : '-'
          )
        ),
        ''
      );
    }
  });

  return lines.join('\n').trimEnd() + '\n';
};

export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const HTML_STYLE = `
body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#1a1c21;background:#fff}
h1{font-size:22px}h2{font-size:17px;margin-top:32px;border-top:1px solid #d3dae6;padding-top:16px}
h3{font-size:14px;margin:16px 0 6px}
.warning{background:#fff4d6;border-left:4px solid #f5a700;padding:8px 12px;margin:8px 0}
.grid{display:grid;gap:12px;align-items:start}
.cell{border:1px solid #d3dae6;border-radius:4px;padding:8px;min-width:0}
.cell h4{margin:0 0 6px;font-size:13px}
.label{font-weight:600;font-size:12px;color:#516381;margin-top:8px}
pre{white-space:pre-wrap;word-break:break-word;margin:2px 0;font:inherit}
table{border-collapse:collapse}td,th{border:1px solid #d3dae6;padding:2px 8px;text-align:left}
.muted{color:#69707d}
`;

export const renderTranscriptHtml = (report: TranscriptReport): string => {
  const { experimentIds, sortEvaluator, warnings, examples } = report;
  const letter = (index: number): string => String.fromCharCode(65 + index);
  const columns = `grid-template-columns:repeat(${experimentIds.length},minmax(0,1fr))`;

  const renderCell = (cell: TranscriptCell | undefined, index: number): string => {
    if (!cell) {
      return `<div class="cell"><h4>${letter(index)}</h4><p class="muted">no run</p></div>`;
    }
    const scores = cell.scores
      .map(({ name, score }) => `${escapeHtml(name)}: ${formatScore(score)}`)
      .join('\n');
    return [
      '<div class="cell">',
      `<h4>${letter(index)} · ${escapeHtml(cell.model ?? '-')}</h4>`,
      '<div class="label">Answer</div>',
      `<pre>${escapeHtml(formatAnswer(cell))}</pre>`,
      '<div class="label">Tools</div>',
      `<pre>${escapeHtml(formatTools(cell))}</pre>`,
      '<div class="label">Tokens</div>',
      `<pre>${escapeHtml(formatTokens(cell))}</pre>`,
      '<div class="label">Scores</div>',
      `<pre>${escapeHtml(scores || '-')}</pre>`,
      '</div>',
    ].join('');
  };

  const body = examples.map((example, index) => {
    const scoreRows = example.scoreMeans
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.evaluator)}</td>${row.byExperiment
            .map((value) => `<td>${formatScore(value)}</td>`)
            .join('')}</tr>`
      )
      .join('');
    const repetitions = example.repetitions
      .map(
        (repetition) =>
          `<h3>Repetition ${
            repetition.repetitionIndex
          }</h3><div class="grid" style="${columns}">${repetition.cells
            .map(renderCell)
            .join('')}</div>`
      )
      .join('');
    return [
      `<h2>${index + 1}. ${escapeHtml(example.datasetName)} · example ${example.exampleIndex}</h2>`,
      `<p class="muted">${escapeHtml(sortEvaluator)} gap: ${formatScore(example.gap)}</p>`,
      '<div class="label">Question</div>',
      `<pre>${escapeHtml(example.question || '(none)')}</pre>`,
      '<div class="label">Expected</div>',
      `<pre>${escapeHtml(example.expected || '(none)')}</pre>`,
      '<div class="label">Mean scores</div>',
      `<table><tr><th></th>${experimentIds
        .map((_, i) => `<th>${letter(i)}</th>`)
        .join('')}</tr>${scoreRows}</table>`,
      repetitions,
    ].join('');
  });

  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><title>Evaluation transcripts</title>',
    `<style>${HTML_STYLE}</style></head><body>`,
    '<h1>Evaluation transcripts</h1>',
    `<ul>${experimentIds
      .map((id, index) => `<li><b>${letter(index)}</b>: <code>${escapeHtml(id)}</code></li>`)
      .join('')}</ul>`,
    `<p>${examples.length} example(s), sorted by the largest ${escapeHtml(
      sortEvaluator
    )} gap between experiments.</p>`,
    ...warnings.map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`),
    ...body,
    '</body></html>',
    '',
  ].join('\n');
};
