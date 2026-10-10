/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowExecutionDto } from '@kbn/workflows';

/**
 * G20: what the Attack Discovery FP/TP analysis actually received. A missing
 * read privilege does not fail the run: `load_entities` / `load_events` are
 * `on-failure: continue`, so the model is simply handed less evidence. This
 * module reads that back from the analysis execution so the eval can see it.
 */
export const FP_TP_ANALYSIS_WORKFLOW_ID = 'system-security-attack-discovery-fp-tp-analysis';

/** The evidence sources the analysis loads, in the order the workflow loads them. */
export const EVIDENCE_SOURCE_STEPS = {
  alerts: 'count_alerts',
  entities: 'load_entities',
  events: 'load_events',
} as const;

export type EvidenceSource = keyof typeof EVIDENCE_SOURCE_STEPS;

export interface EvidenceSourceReading {
  source: EvidenceSource;
  stepId: string;
  /** The step errored (the workflow swallowed it). */
  failed: boolean;
  /** Documents the step returned; 0 when it failed or matched nothing. */
  hits: number;
  /** Error text of the swallowed failure. */
  error?: string;
  /** True when the error text is an authorization failure. */
  privilegeError: boolean;
}

export interface EvidenceReading {
  /** Execution id of the analysis the reading came from. */
  analysisExecutionId: string;
  sources: EvidenceSourceReading[];
  /**
   * Fraction of the evidence the scenario seeded that reached the analysis, in
   * [0, 1]. Null when nothing was seeded to measure against.
   */
  completeness: number | null;
  /** Verdict the analysis returned (`block_truncated_clear`, the step the workflow's output reads). */
  verdict?: string;
  /** Status of the analysis execution itself: `completed` with a failed source step means the error was swallowed. */
  analysisStatus: string;
  /** Privilege failures the workflow swallowed (the run still completed). */
  swallowedPrivilegeErrors: Array<{ source: EvidenceSource; error: string }>;
}

/** What the scenario seeded: how many documents each source should return. */
export interface SeededEvidence {
  alerts: number;
  entities: number;
  events: number;
}

const PRIVILEGE_PATTERN =
  /security_exception|action \[[^\]]+\] is unauthorized|unauthorized for user|is not authorized|403|forbidden|missing authentication|no privilege/i;

export const isPrivilegeError = (message: string | undefined): boolean =>
  message !== undefined && PRIVILEGE_PATTERN.test(message);

const errorText = (error: unknown): string | undefined => {
  if (error === null || error === undefined) return undefined;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const { message, type } = error as { message?: unknown; type?: unknown };
    const parts = [type, message].filter((p): p is string => typeof p === 'string' && p !== '');
    return parts.length > 0 ? parts.join(': ') : JSON.stringify(error);
  }
  return String(error);
};

/** Hit count of an `elasticsearch.search` step output; the total, else the returned page. */
const hitCount = (output: unknown): number => {
  const hits = (output as { hits?: { total?: unknown; hits?: unknown[] } } | undefined)?.hits;
  const total = hits?.total;
  if (typeof total === 'number') return total;
  if (typeof total === 'object' && total !== null) {
    const value = (total as { value?: unknown }).value;
    if (typeof value === 'number') return value;
  }
  return Array.isArray(hits?.hits) ? hits.hits.length : 0;
};

/** `count_alerts` is a data.set: it reports found/cited directly. */
const alertsFound = (output: unknown): number => {
  const found = (output as { found?: unknown } | undefined)?.found;
  return typeof found === 'number' ? found : 0;
};

export const readEvidence = (
  analysis: WorkflowExecutionDto,
  analysisExecutionId: string,
  seeded: SeededEvidence
): EvidenceReading => {
  const steps = analysis.stepExecutions ?? [];
  const sources: EvidenceSourceReading[] = (
    Object.entries(EVIDENCE_SOURCE_STEPS) as Array<[EvidenceSource, string]>
  ).map(([source, stepId]) => {
    const step = steps.find((s) => s.stepId === stepId);
    const error = errorText(step?.error);
    return {
      source,
      stepId,
      failed: error !== undefined,
      hits:
        error !== undefined || !step
          ? 0
          : source === 'alerts'
          ? alertsFound(step.output)
          : hitCount(step.output),
      error,
      privilegeError: isPrivilegeError(error),
    };
  });

  const ratios = sources
    .map((reading) => {
      const expected = seeded[reading.source];
      return expected > 0 ? Math.min(reading.hits, expected) / expected : undefined;
    })
    .filter((ratio): ratio is number => ratio !== undefined);

  const verdict = (
    steps.find((s) => s.stepId === 'block_truncated_clear')?.output as
      | { verdict?: unknown }
      | undefined
  )?.verdict;
  return {
    analysisExecutionId,
    sources,
    verdict: typeof verdict === 'string' ? verdict : undefined,
    analysisStatus: String(analysis.status),
    completeness: ratios.length === 0 ? null : ratios.reduce((a, b) => a + b, 0) / ratios.length,
    swallowedPrivilegeErrors: sources
      .filter((s) => s.privilegeError)
      .map((s) => ({ source: s.source, error: s.error ?? '' })),
  };
};
