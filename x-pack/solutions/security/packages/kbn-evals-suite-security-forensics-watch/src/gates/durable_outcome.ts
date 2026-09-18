/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { DEEP_WATCH_FORENSICS_REPORTS_INDEX } from '../constants';

/**
 * Pure gate logic for the L4 durable-outcome spec.
 *
 * The durable write is only evidence for THIS invocation if the readback is
 * correlated to the run that produced it. A time-window-only readback is
 * satisfied by any DRAFT report another example, retry, model or concurrent
 * run wrote minutes earlier, which is exactly the false green the gate exists
 * to prevent.
 */

export interface DurableOutcomeRunContext {
  /** Unique id for the current example invocation, echoed into the report. */
  runId: string;
  /** ISO timestamp captured immediately before the converse call. */
  runStartedAt: string;
}

export interface DurableOutcomeHit {
  _source?: Record<string, unknown>;
}

/**
 * Builds the readback request: DRAFT reports written after this run started
 * whose document mentions this run's id.
 *
 * The correlation id is matched across every field rather than a named one
 * because the persisted document's field name is owned by the server-side
 * tool; a phrase match over all fields stays correct when that name changes.
 */
export const buildDurableOutcomeSearch = ({
  runId,
  runStartedAt,
}: DurableOutcomeRunContext): estypes.SearchRequest => ({
  index: DEEP_WATCH_FORENSICS_REPORTS_INDEX,
  query: {
    bool: {
      must: [
        { match: { report_status: 'DRAFT' } },
        { range: { '@timestamp': { gte: runStartedAt } } },
        { multi_match: { query: runId, fields: ['*'], type: 'phrase' } },
      ],
    },
  },
  size: 5,
  sort: [{ '@timestamp': 'desc' }],
});

/**
 * The Evaluation Record shape the scorecard claims to validate: a stored
 * document is only scoreable if every section the evaluators read exists.
 */
export const hasEvaluationRecordShape = (record: Record<string, unknown> | undefined): boolean =>
  record !== undefined &&
  record.report_status !== undefined &&
  record.timeline !== undefined &&
  record.validated_iocs !== undefined &&
  record.unresolved_questions !== undefined &&
  record.confidence_assessment !== undefined;

export interface DurableOutcomeInput {
  produceDraftCalled: boolean;
  correlatedHits: DurableOutcomeHit[];
}

export interface DurableOutcomeResult {
  success: boolean;
  persistedCount: number;
  hasEvaluationRecordShape: boolean;
}

export const evaluateDurableOutcome = ({
  produceDraftCalled,
  correlatedHits,
}: DurableOutcomeInput): DurableOutcomeResult => {
  const persistedCount = correlatedHits.length;
  const recordShapeValid =
    persistedCount > 0 && hasEvaluationRecordShape(correlatedHits[0]?._source);

  return {
    success: produceDraftCalled && persistedCount > 0 && recordShapeValid,
    persistedCount,
    hasEvaluationRecordShape: recordShapeValid,
  };
};
