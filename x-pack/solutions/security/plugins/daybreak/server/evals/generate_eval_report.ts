/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { writeFile as writeKbnFile } from '@kbn/fs';

import {
  BROKEN_EXAMPLE_IDS,
  DAYBREAK_GOLDEN_DATASET_NAME,
  NOMINAL_EXAMPLE_IDS,
  daybreakGoldenDataset,
  type DaybreakGoldenExample,
  type ExpectedProposalShape,
  type ExpectedVerdict,
} from './golden_dataset';
import {
  CONFIDENCE_TOLERANCE,
  reasonOverAlertEvidence,
  scoreProposalShape,
} from './offline_dataset_gate';

/**
 * The on-disk report schema version. Bumped only when the JSON shape changes in
 * a way that would break existing consumers (CI parsers, dashboards).
 */
export const EVAL_REPORT_SCHEMA_VERSION = 1;

/** Per-example entry in the generated report. */
export interface EvalReportExampleResult {
  /** Stable identifier of the golden example (mirrors {@link DaybreakGoldenExample.id}). */
  exampleId: string;
  /** Whether this row is a deliberately-broken regression probe (FR-10 / A-3). */
  broken: boolean;
  /** Human-readable scenario label (mirrors {@link DaybreakGoldenExample.metadata.description}). */
  description: string;
  /** Expected Reason-phase triage verdict (supplementary ground truth). */
  verdict: ExpectedVerdict;
  /** The golden expected Proposal shape the gate scores against. */
  expected: ExpectedProposalShape;
  /** The Proposal shape the offline worker actually produced. */
  actual: ExpectedProposalShape;
  /** Scorer output: `1` (match) or `0` (mismatch). */
  score: number;
  /** Scorer output: `match` or `mismatch`. */
  label: string;
  /** Scorer diagnostics — the mismatch list for a failing row, empty on match. */
  explanation: string;
  /** Convenience boolean: `score === 1`. */
  matched: boolean;
}

/** Roll-up counts + the overall gate verdict (FR-8 full-gate contract). */
export interface EvalReportSummary {
  /** Dataset name the gate ran against. */
  datasetName: string;
  /** Total examples evaluated. */
  totalExamples: number;
  /** Count of nominal (non-broken) rows. */
  nominalTotal: number;
  /** Count of deliberately-broken rows. */
  brokenTotal: number;
  /** Nominal rows that matched their golden shape (must equal {@link nominalTotal} to pass). */
  nominalPassed: number;
  /** Broken rows that correctly failed to match (must equal {@link brokenTotal} to pass). */
  brokenFailed: number;
  /**
   * Overall gate verdict — `true` iff every nominal row matches AND every
   * broken row fails (FR-8 "Passes if all non-broken rows match; fails if the
   * broken row does NOT fail").
   */
  gatePassed: boolean;
}

/** The full JSON report written by {@link writeEvalReport}. */
export interface DaybreakEvalReport {
  /** Report shape version — see {@link EVAL_REPORT_SCHEMA_VERSION}. */
  schemaVersion: typeof EVAL_REPORT_SCHEMA_VERSION;
  /** ISO-8601 timestamp the report was generated. */
  generatedAt: string;
  /** Experiment name anchor (mirrors the golden dataset name). */
  experimentName: string;
  /** Dataset name the gate ran against. */
  datasetName: string;
  /** Human-readable dataset description. */
  datasetDescription: string;
  /** Confidence tolerance the shape-match scorer applied (FR-8). */
  confidenceTolerance: number;
  /** Roll-up counts + gate verdict. */
  summary: EvalReportSummary;
  /** Per-example results, in dataset order. */
  examples: EvalReportExampleResult[];
}

/** Options for {@link generateEvalReport}. */
export interface GenerateEvalReportOptions {
  /**
   * Timestamp captured into the report's `generatedAt` field. Defaults to
   * `new Date()`; inject a fixed value for deterministic snapshots.
   */
  now?: Date;
}

/**
 * Score a single golden example through the offline worker reasoning + shape
 * scorer (FR-8). Pure / deterministic given the example.
 */
const scoreExample = (example: DaybreakGoldenExample): EvalReportExampleResult => {
  const actual = reasonOverAlertEvidence(example.input.alertEvidence);
  const result = scoreProposalShape(actual, example.output);

  return {
    exampleId: example.id,
    broken: example.metadata.broken === true,
    description: example.metadata.description,
    verdict: example.metadata.verdict,
    expected: example.output,
    actual,
    score: result.score,
    label: result.label,
    explanation: result.explanation,
    matched: result.score === 1,
  };
};

/**
 * Reduce the per-example results to the gate summary. The gate passes iff every
 * nominal row matches AND every broken row fails (FR-8 / FR-10 / A-3).
 */
const buildSummary = (results: EvalReportExampleResult[]): EvalReportSummary => {
  const nominalIds = new Set(NOMINAL_EXAMPLE_IDS);
  const brokenIds = new Set(BROKEN_EXAMPLE_IDS);

  const nominalResults = results.filter((r) => nominalIds.has(r.exampleId));
  const brokenResults = results.filter((r) => brokenIds.has(r.exampleId));

  const nominalPassed = nominalResults.filter((r) => r.matched).length;
  const brokenFailed = brokenResults.filter((r) => !r.matched).length;

  const gatePassed =
    nominalResults.length > 0 &&
    nominalPassed === nominalIds.size &&
    brokenFailed === brokenIds.size;

  return {
    datasetName: daybreakGoldenDataset.name,
    totalExamples: results.length,
    nominalTotal: nominalIds.size,
    brokenTotal: brokenIds.size,
    nominalPassed,
    brokenFailed,
    gatePassed,
  };
};

/**
 * Run the offline dataset gate over the golden dataset and return the full
 * report object (FR-8). Pure except for the `generatedAt` timestamp, which is
 * injectable via {@link GenerateEvalReportOptions.now} for deterministic tests
 * and CI diffs.
 */
export const generateEvalReport = (options: GenerateEvalReportOptions = {}): DaybreakEvalReport => {
  const now = options.now ?? new Date();
  const examples = daybreakGoldenDataset.examples.map(scoreExample);

  return {
    schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    experimentName: DAYBREAK_GOLDEN_DATASET_NAME,
    datasetName: daybreakGoldenDataset.name,
    datasetDescription: daybreakGoldenDataset.description,
    confidenceTolerance: CONFIDENCE_TOLERANCE,
    summary: buildSummary(examples),
    examples,
  };
};

/**
 * Serialize a report to deterministic, human-readable JSON. The object is built
 * in a fixed key order by {@link generateEvalReport}, so plain `JSON.stringify`
 * produces a stable byte-for-byte output (modulo `generatedAt`).
 */
export const serializeEvalReport = (report: DaybreakEvalReport): string =>
  `${JSON.stringify(report, null, 2)}\n`;

/** Options for {@link writeEvalReport}. */
export interface WriteEvalReportOptions {
  /**
   * Namespace within `data/` — the report is written to `data/<volume>/<name>`.
   * When omitted, the report is written to `data/<name>`.
   */
  volume?: string;
  /**
   * Overwrite an existing file at the target path. Defaults to `true`.
   */
  override?: boolean;
}

/**
 * Default report file name — written under `data/` (or `data/<volume>/`). See
 * {@link writeEvalReport}.
 */
export const DEFAULT_EVAL_REPORT_NAME = 'daybreak-alert-analysis-eval-report.json';

/**
 * Write a report to the repo `data/` directory as JSON, via the mandated
 * `@kbn/fs` write path (path-traversal-safe, extension-validated, parent dirs
 * created). `name` is relative to `data/` (or `data/<volume>/` when a volume is
 * supplied); the resolved absolute path is returned.
 */
export const writeEvalReport = async (
  report: DaybreakEvalReport,
  name: string = DEFAULT_EVAL_REPORT_NAME,
  options: WriteEvalReportOptions = {}
): Promise<{ path: string; alias: string }> => {
  const metadata = await writeKbnFile(name, serializeEvalReport(report), {
    override: options.override ?? true,
    ...(options.volume !== undefined ? { volume: options.volume } : {}),
  });
  return { path: metadata.path, alias: metadata.alias };
};

/** Options for {@link generateAndWriteEvalReport}. */
export interface GenerateAndWriteEvalReportOptions
  extends GenerateEvalReportOptions,
    WriteEvalReportOptions {}

/**
 * Run the dataset gate and write the JSON report to disk (FR-8). Convenience
 * wrapper around {@link generateEvalReport} + {@link writeEvalReport}; returns
 * the report and the resolved write metadata.
 */
export const generateAndWriteEvalReport = async (
  name: string = DEFAULT_EVAL_REPORT_NAME,
  { now, volume, override }: GenerateAndWriteEvalReportOptions = {}
): Promise<{ report: DaybreakEvalReport; path: string; alias: string }> => {
  const report = generateEvalReport(now !== undefined ? { now } : {});
  const { path, alias } = await writeEvalReport(report, name, { volume, override });
  return { report, path, alias };
};
