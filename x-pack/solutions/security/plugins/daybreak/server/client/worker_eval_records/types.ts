/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetResponse } from '@elastic/elasticsearch/lib/api/types';

/** Human reviewer decision label for a live worker evaluation record. */
export type HumanDecision =
  | 'approve'
  | 'modify'
  | 'dismiss'
  | 'escalate'
  | 'defer'
  | 'pending';

/** Cost attribution basis for the provenance block. */
export type CostBasis = 'priced' | 'unknown' | 'self-hosted';

/** Model / connector provenance attached to a single worker evaluation run. */
export interface WorkerEvalRecordProvenance {
  modelId?: string;
  connectorId?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  costBasis: CostBasis;
}

/**
 * Persisted worker evaluation record (L4 round-trip target).
 *
 * Mirrors the {@link WorkerEvaluationRecord} shape from `server/evals/worker_evaluation_record`
 * but is materialised as a storage document with identity and audit timestamps.
 */
export interface WorkerEvalRecordProperties {
  /** Stable storage id (UUID). */
  id: string;
  /** Golden-dataset example id or live alert id used as the run key. */
  runId: string;
  /** Dataset name the run was evaluated against. */
  dataset: string;
  /** Environment label (e.g. `offline-gate`, `live-workflow`). */
  environment: string;
  /** Capability the worker exercised. */
  capability: string;
  /** Actual proposal shape produced by the worker. */
  actual: Record<string, unknown>;
  /** Expected proposal shape from the golden dataset. */
  expected: Record<string, unknown>;
  /** Human reviewer label; defaults to `pending`. */
  humanDecision?: HumanDecision;
  /** Shape-match score: 1 (match) or 0 (mismatch). */
  score: number;
  /** Model/connector provenance for the run. */
  provenance: WorkerEvalRecordProvenance;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Kibana space the record belongs to. */
  space?: string;
}

/** Worker eval record document as returned by ES. */
export type WorkerEvalRecordDocument = Pick<
  GetResponse<WorkerEvalRecordProperties>,
  '_source' | '_id'
>;
