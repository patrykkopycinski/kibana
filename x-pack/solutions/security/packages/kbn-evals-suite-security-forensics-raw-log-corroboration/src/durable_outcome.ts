/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { INDICES } from './constants';

/**
 * Pure gate logic for the L4 durable-outcome spec.
 *
 * A durable outcome is only evidence for THIS run if the readback is
 * correlated to it: the previous version inferred persistence from the
 * response text containing "investigation", "timeline" or "persisted", words
 * the prompt itself asks for, so an ephemeral or hallucinated answer scored as
 * a durable write.
 */

export interface DurableOutcomeRunContext {
  /** Unique id for this example invocation, echoed into the persisted report. */
  runId: string;
  /** ISO timestamp captured immediately before the converse call. */
  runStartedAt: string;
}

export interface DurableOutcomeHit {
  _source?: Record<string, unknown>;
}

/**
 * Reads back the investigation timeline written after this run started that
 * mentions this run's id. The id is matched across every field rather than a
 * named one because the stored document's shape is owned by the server-side
 * persistence route, not by this suite.
 */
export const buildInvestigationReadbackSearch = ({
  runId,
  runStartedAt,
}: DurableOutcomeRunContext): estypes.SearchRequest => ({
  index: INDICES.INVESTIGATIONS,
  query: {
    bool: {
      must: [
        { range: { '@timestamp': { gte: runStartedAt } } },
        { multi_match: { query: runId, fields: ['*'], type: 'phrase' } },
      ],
    },
  },
  size: 5,
  sort: [{ '@timestamp': 'desc' }],
});

/** The stored record has to carry the findings, not just the correlation id. */
export const hasCorroborationContent = (hit: DurableOutcomeHit | undefined): boolean =>
  hit !== undefined && /corroborat/i.test(JSON.stringify(hit._source ?? {}));

export interface DurableOutcomeInput {
  correlatedHits: DurableOutcomeHit[];
}

export interface DurableOutcomeResult {
  success: boolean;
  persistedCount: number;
  corroborationContentStored: boolean;
}

export const evaluateDurableOutcome = ({
  correlatedHits,
}: DurableOutcomeInput): DurableOutcomeResult => {
  const persistedCount = correlatedHits.length;
  const corroborationContentStored =
    persistedCount > 0 && hasCorroborationContent(correlatedHits[0]);

  return {
    success: persistedCount > 0 && corroborationContentStored,
    persistedCount,
    corroborationContentStored,
  };
};
