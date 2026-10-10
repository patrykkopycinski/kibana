/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import type { EvidenceReading, SeededEvidence } from './evidence';

/** What the cell report needs from one chain run. */
export interface CellRunRow {
  exampleKey: string;
  /** Verdict the Attack Discovery review applied, when it applied one. */
  verdict?: string;
  evidence: readonly EvidenceReading[];
}

export interface CellSummary {
  cellId: string;
  runs: number;
  /** Mean evidence completeness over the runs that measured it; null when none did. */
  evidenceCompleteness: number | null;
  /**
   * Share of examples (present in both cells, with a verdict in both) whose
   * verdict equals the baseline's. Null for the baseline itself or when there
   * is nothing to compare.
   */
  verdictAgreementVsBaseline: number | null;
  /** Privilege errors the workflow turned into a normal completed run. Each is a product finding. */
  privilegeErrorsSwallowed: number;
  /** Privilege errors that failed the analysis execution (the product said so). */
  privilegeErrorsSurfaced: number;
  /** One line per swallowed error: example, source and the text, for the findings page. */
  swallowedDetails: string[];
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

export const summarizeCell = (
  cellId: string,
  rows: readonly CellRunRow[],
  baselineRows?: readonly CellRunRow[]
): CellSummary => {
  const readings = rows.flatMap((row) => row.evidence.map((reading) => ({ row, reading })));
  const completeness = readings
    .map(({ reading }) => reading.completeness)
    .filter((c): c is number => c !== null);

  let swallowed = 0;
  let surfaced = 0;
  const swallowedDetails: string[] = [];
  for (const { row, reading } of readings) {
    for (const { source, error } of reading.swallowedPrivilegeErrors) {
      if (reading.analysisStatus === 'completed') {
        swallowed += 1;
        swallowedDetails.push(`${row.exampleKey}: ${source} — ${error}`);
      } else {
        surfaced += 1;
      }
    }
  }

  let agreement: number | null = null;
  if (baselineRows) {
    const baselineVerdicts = new Map(
      baselineRows.filter((r) => r.verdict !== undefined).map((r) => [r.exampleKey, r.verdict])
    );
    const comparable = rows.filter(
      (r) => r.verdict !== undefined && baselineVerdicts.has(r.exampleKey)
    );
    agreement =
      comparable.length === 0
        ? null
        : comparable.filter((r) => baselineVerdicts.get(r.exampleKey) === r.verdict).length /
          comparable.length;
  }

  return {
    cellId,
    runs: rows.length,
    evidenceCompleteness: mean(completeness),
    verdictAgreementVsBaseline: agreement,
    privilegeErrorsSwallowed: swallowed,
    privilegeErrorsSurfaced: surfaced,
    swallowedDetails,
  };
};

/** Documents the world seeds per evidence source, to measure the analysis against. */
export const seededEvidenceOf = (world: {
  alerts: readonly unknown[];
  events: readonly unknown[];
  entities: readonly unknown[];
}): SeededEvidence => ({
  alerts: world.alerts.length,
  entities: world.entities.length,
  events: world.events.length,
});

/**
 * Evidence completeness as a per-example score. Null (not scored) when the run
 * measured nothing, so an unmeasured run is never read as complete or empty.
 */
export const evidenceCompleteness: Evaluator = {
  name: 'EvidenceCompleteness',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output }) => {
    const evidence = ((output as { record?: { evidence?: EvidenceReading[] } }).record?.evidence ??
      []) as EvidenceReading[];
    const scores = evidence.map((e) => e.completeness).filter((c): c is number => c !== null);
    if (scores.length === 0) {
      return {
        score: null,
        label: 'not_measured',
        explanation: 'no Attack Discovery analysis execution was read back for this run',
        metadata: { analyses: evidence.length },
      };
    }
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    return {
      score,
      label: score === 1 ? 'complete' : 'starved',
      explanation: evidence
        .map(
          (e) =>
            `${e.analysisExecutionId}: ${e.sources
              .map((s) => `${s.source}=${s.failed ? 'FAILED' : s.hits}`)
              .join(' ')}`
        )
        .join('; '),
      metadata: {
        analyses: evidence.length,
        swallowedPrivilegeErrors: evidence.flatMap((e) => e.swallowedPrivilegeErrors),
      },
    };
  },
};
