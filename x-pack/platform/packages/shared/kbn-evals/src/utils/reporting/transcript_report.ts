/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationScoreDocument, TraceSummary } from '@kbn/evals-common';
import { MAX_SCORES_PER_QUERY, getJudgeScoreDirection } from '@kbn/evals-common';
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
  /** `exampleKey`s whose expected output was matched by position in the dataset only. */
  expectedByPosition?: Set<string>;
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
  toolTrailSource: AnswerSource;
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
  /** The evaluator the gaps are computed from; may differ from the requested one. */
  sortEvaluator: string;
  /** False when no example has a gap, so the order is by dataset and example index. */
  sorted: boolean;
  warnings: string[];
  examples: TranscriptExample[];
}

const SEP = '\u0000';

export const exampleKey = (datasetId: string, exampleId: string): string =>
  `${datasetId}${SEP}${exampleId}`;

export interface ScoredExampleRef {
  id: string;
  index: number;
  input?: Record<string, unknown>;
}

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

/**
 * Score docs number an example by position and the dataset may have been reordered since, so match
 * by input first, then id, and by position only as a last resort (`byPosition`).
 */
export const expectedOutputsByExample = (
  datasetId: string,
  datasetExamples: Array<{ id: string; input?: Record<string, unknown>; output?: unknown }>,
  scoredExamples: ScoredExampleRef[]
): { expected: Map<string, unknown>; byPosition: Set<string> } => {
  const expected = new Map<string, unknown>();
  const byPosition = new Set<string>();

  const unusedByInput = new Map<string, typeof datasetExamples>();
  for (const example of datasetExamples) {
    if (!example.input) continue;
    const input = stableStringify(example.input);
    unusedByInput.set(input, [...(unusedByInput.get(input) ?? []), example]);
  }
  const ids = new Map(datasetExamples.map((example) => [example.id, example]));
  const scoredIds = new Set(scoredExamples.map((scored) => scored.id));
  // Shared by the input, id and position paths: a dataset example answers one scored example.
  const consumed = new Set<(typeof datasetExamples)[number]>();

  const assign = (scored: ScoredExampleRef, matched: (typeof datasetExamples)[number]) => {
    consumed.add(matched);
    expected.set(exampleKey(datasetId, scored.id), matched.output);
  };

  // Pass 1: input matches for every scored example, so neither an id nor a position guess can take
  // a dataset example that a later scored example matches by input.
  const unmatched: ScoredExampleRef[] = [];
  for (const scored of scoredExamples) {
    const inputMatches = scored.input
      ? unusedByInput.get(stableStringify(scored.input))
      : undefined;
    const free = inputMatches?.filter((candidate) => !consumed.has(candidate)) ?? [];
    // Duplicate inputs: prefer the same id, then candidates no other scored example names by id,
    // then the same position, so two identical questions with different answers do not swap.
    const unclaimed = free.filter((candidate) => !scoredIds.has(candidate.id));
    const byInput =
      free.find((candidate) => candidate.id === scored.id) ??
      unclaimed.find((candidate) => candidate === datasetExamples[scored.index]) ??
      unclaimed[0] ??
      free[0];
    if (byInput) {
      assign(scored, byInput);
    } else {
      unmatched.push(scored);
    }
  }

  // Pass 1b: id, after every input match, so an id never takes an example another input names.
  const unmatchedById: ScoredExampleRef[] = [];
  for (const scored of unmatched) {
    const byId = ids.get(scored.id);
    if (byId && !consumed.has(byId)) {
      assign(scored, byId);
    } else {
      unmatchedById.push(scored);
    }
  }

  // Pass 2: position, only for what is still unmatched and still free.
  for (const scored of unmatchedById) {
    const positional = datasetExamples[scored.index];
    if (!positional || consumed.has(positional)) continue;
    assign(scored, positional);
    byPosition.add(exampleKey(datasetId, scored.id));
  }
  return { expected, byPosition };
};

/**
 * The distinct examples the experiments scored, per dataset. The scores API drops `example.input`,
 * so the input comes from the stored details.
 */
export const collectScoredExamples = (
  experiments: TranscriptExperiment[],
  details: Map<string, StoredExampleDetails | null> = new Map()
): Map<string, ScoredExampleRef[]> => {
  const byDataset = new Map<string, Map<string, ScoredExampleRef>>();
  for (const { experimentId, scores } of experiments) {
    for (const score of scores) {
      const { example } = score;
      const input =
        details.get(
          repetitionKey({
            experimentId,
            datasetId: example.dataset.id,
            exampleId: example.id,
            repetitionIndex: repetitionIndexOf(score),
          })
        )?.input ?? undefined;
      const examples = byDataset.get(example.dataset.id) ?? new Map<string, ScoredExampleRef>();
      const known = examples.get(example.id);
      if (!known) {
        examples.set(example.id, { id: example.id, index: example.index, input });
      } else if (!known.input && input) {
        known.input = input;
      }
      byDataset.set(example.dataset.id, examples);
    }
  }
  return new Map(
    [...byDataset].map(([datasetId, examples]) => [datasetId, [...examples.values()]])
  );
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

/** Keeps only the examples every experiment scored; throws when no example is shared. */
export const filterToOverlappingExamples = (
  experiments: TranscriptExperiment[]
): { experiments: TranscriptExperiment[]; droppedExamples: number } => {
  const keysOf = (experiment: TranscriptExperiment): Set<string> =>
    new Set(experiment.scores.map(({ example }) => exampleKey(example.dataset.id, example.id)));
  const keySets = experiments.map(keysOf);
  const all = new Set(keySets.flatMap((keys) => [...keys]));
  const shared = new Set([...all].filter((key) => keySets.every((keys) => keys.has(key))));
  if (shared.size === 0) {
    throw new Error('No overlapping examples found between the experiments.');
  }
  return {
    experiments: experiments.map((experiment) => ({
      ...experiment,
      scores: experiment.scores.filter(({ example }) =>
        shared.has(exampleKey(example.dataset.id, example.id))
      ),
    })),
    droppedExamples: all.size - shared.size,
  };
};

/** Filters for reading stored example details; mirrors how the scores were filtered. */
export const exampleDetailsFilters = (
  suiteId: string | undefined,
  experimentId: string
): { executionId: string } | undefined => (suiteId ? { executionId: experimentId } : undefined);

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
  // A stored output that records its steps (even none) is the authority on tool calls.
  const storedToolsKnown = Array.isArray(stored?.steps);
  const toolTrailSource: AnswerSource = storedToolsKnown
    ? 'output'
    : traceSummary
    ? 'trace'
    : 'unavailable';

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
    toolTrail: toolTrailSource === 'output' ? storedTools : traceSummary?.toolIds ?? [],
    toolTrailSource,
    inputTokens: traceSummary?.inputTokens,
    outputTokens: traceSummary?.outputTokens,
    trace,
    scores,
  };
};

interface SortCandidate {
  /** Experiment indexes that scored each example, by `exampleKey`. */
  scoredBy: Map<string, Set<number>>;
  isHigherBetter: boolean;
  isLlm: boolean;
  isUnitRange: boolean;
}

/** Examples scored by 2+ experiments: the only ones that can produce a gap. */
const gapCoverage = ({ scoredBy }: SortCandidate): number =>
  [...scoredBy.values()].filter((experimentIndexes) => experimentIndexes.size >= 2).length;

/**
 * Lower is better. Judges (higher-is-better, model-scored) rank first, then higher-is-better
 * evaluators scoring only within [0,1] (documents without a declared direction or kind land here),
 * then any other higher-is-better evaluator. Metrics (cost, tokens, latency: minimize or neutral)
 * come last.
 */
const sortTier = ({ isHigherBetter, isLlm, isUnitRange }: SortCandidate): number => {
  if (!isHigherBetter) return 3;
  if (isLlm) return 0;
  return isUnitRange ? 1 : 2;
};

/**
 * The requested sort evaluator when some example has a score from 2+ experiments, otherwise the
 * best fallback: any evaluator with gap coverage first, then `sortTier`, then most examples with
 * gap coverage, then name.
 */
const resolveSortEvaluator = (
  experiments: TranscriptExperiment[],
  requested: string
): { sortEvaluator: string; warning?: string } => {
  const candidates = new Map<string, SortCandidate>();
  experiments.forEach(({ scores }, experimentIndex) => {
    for (const { evaluator, example } of scores) {
      const candidate = candidates.get(evaluator.name) ?? {
        scoredBy: new Map<string, Set<number>>(),
        isHigherBetter: getJudgeScoreDirection(evaluator) === 'maximize',
        isLlm: false,
        isUnitRange: true,
      };
      candidate.isLlm = candidate.isLlm || evaluator.kind === 'llm';
      if (typeof evaluator.score === 'number' && Number.isFinite(evaluator.score)) {
        const key = exampleKey(example.dataset.id, example.id);
        candidate.scoredBy.set(
          key,
          (candidate.scoredBy.get(key) ?? new Set()).add(experimentIndex)
        );
        if (evaluator.score < 0 || evaluator.score > 1) candidate.isUnitRange = false;
      }
      candidates.set(evaluator.name, candidate);
    }
  });
  const requestedCandidate = candidates.get(requested);
  if ((requestedCandidate && gapCoverage(requestedCandidate) > 0) || candidates.size === 0) {
    return { sortEvaluator: requested };
  }
  const available = [...candidates.keys()].sort((a, b) => a.localeCompare(b));
  const [fallback] = [...candidates.entries()]
    .map(([name, candidate]) => ({ name, candidate, coverage: gapCoverage(candidate) }))
    .sort(
      (a, b) =>
        Number(b.coverage > 0) - Number(a.coverage > 0) ||
        sortTier(a.candidate) - sortTier(b.candidate) ||
        b.coverage - a.coverage ||
        a.name.localeCompare(b.name)
    );
  return {
    sortEvaluator: fallback.name,
    warning: `Sort evaluator "${requested}" ${
      requestedCandidate && requestedCandidate.scoredBy.size > 0
        ? 'has no example scored by 2+ experiments'
        : 'has no scores in these experiments'
    }; sorted by "${fallback.name}" instead (available: ${available.join(', ')}).`,
  };
};

/**
 * `experiments` must already be reduced to the shared examples by `filterToOverlappingExamples`;
 * pass its `droppedExamples` so the report can say how many were left out.
 */
export const buildTranscriptReport = ({
  experiments,
  droppedExamples,
  hydration,
  sortEvaluator: requestedSortEvaluator = DEFAULT_SORT_EVALUATOR,
}: {
  experiments: TranscriptExperiment[];
  droppedExamples: number;
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

  if (droppedExamples > 0) {
    warnings.push(
      `${droppedExamples} example(s) were not scored by every experiment and are left out.`
    );
  }

  const { sortEvaluator, warning: sortWarning } = resolveSortEvaluator(
    experiments,
    requestedSortEvaluator
  );
  if (sortWarning) warnings.push(sortWarning);

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

  const sorted = examples.some((example) => example.gap !== undefined);
  if (!sorted) {
    warnings.push(
      `No example has a "${sortEvaluator}" score in two or more experiments, so examples are not sorted by score gap.`
    );
  }

  const byPosition = [...docsByExample.keys()].filter((key) =>
    hydration.expectedByPosition?.has(key)
  ).length;
  if (byPosition > 0) {
    warnings.push(
      `Expected answers for ${byPosition} example(s) were matched by dataset position only; they may be wrong if the dataset changed.`
    );
  }

  return { experimentIds, sortEvaluator, sorted, warnings, examples };
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
  if (!cell.answer) return 'unavailable';
  return cell.answerSource === 'trace'
    ? `${cell.answer}\n\n(answer read from the trace)`
    : cell.answer;
};

const escapeMarkdownCell = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, '<br>');

const codeSpan = (value: string): string => {
  const longestRun = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longestRun + 1);
  return longestRun > 0 ? `${fence} ${value} ${fence}` : `${fence}${value}${fence}`;
};

const quote = (value: string): string =>
  value
    ? value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join('\n')
    : '> (none)';

const markdownRow = (label: string, values: string[]): string =>
  `| ${[label, ...values].map(escapeMarkdownCell).join(' | ')} |`;

export const renderTranscriptMarkdown = (report: TranscriptReport): string => {
  const { experimentIds, sortEvaluator, sorted, warnings, examples } = report;
  const lines: string[] = [
    '# Evaluation transcripts',
    '',
    ...experimentIds.map(
      (id, index) => `- **${String.fromCharCode(65 + index)}**: ${codeSpan(id)}`
    ),
    '',
    sorted
      ? `${examples.length} example(s), sorted by the largest ${escapeMarkdownCell(
          sortEvaluator
        )} gap between experiments.`
      : `${examples.length} example(s), in dataset order.`,
    '',
  ];

  if (warnings.length > 0) {
    lines.push(...warnings.map((warning) => `> **Warning:** ${escapeMarkdownCell(warning)}`), '');
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
      `${escapeMarkdownCell(sortEvaluator)} gap: ${formatScore(example.gap)}`,
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
          'Tokens (all models)',
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

const escapeHtml = (value: string): string =>
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
  const { experimentIds, sortEvaluator, sorted, warnings, examples } = report;
  const letter = (index: number): string => String.fromCharCode(65 + index);
  const columns = `grid-template-columns:repeat(${experimentIds.length},minmax(0,1fr))`;

  const renderCell = (cell: TranscriptCell | undefined, index: number): string => {
    if (!cell) {
      return `<div class="cell"><h4>${letter(index)}</h4><p class="muted">no run</p></div>`;
    }
    const scores = cell.scores
      .map(({ name, score }) => `${name}: ${formatScore(score)}`)
      .join('\n');
    return [
      '<div class="cell">',
      `<h4>${letter(index)} · ${escapeHtml(cell.model ?? '-')}</h4>`,
      '<div class="label">Answer</div>',
      `<pre>${escapeHtml(formatAnswer(cell))}</pre>`,
      '<div class="label">Tools</div>',
      `<pre>${escapeHtml(formatTools(cell))}</pre>`,
      '<div class="label">Tokens (all models)</div>',
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
    `<p>${
      sorted
        ? `${examples.length} example(s), sorted by the largest ${escapeHtml(
            sortEvaluator
          )} gap between experiments.`
        : `${examples.length} example(s), in dataset order.`
    }</p>`,
    ...warnings.map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`),
    ...body,
    '</body></html>',
    '',
  ].join('\n');
};
