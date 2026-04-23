/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ArgusMutationDetailBacktest,
  ArgusMutationPostApplyObservation,
} from './mutation_detail';

/**
 * The set of related-entity lookups the `artifact_details` endpoint can
 * perform. Callers include only the ones they need via the `include_related`
 * query param (CSV), or omit it to get the full set.
 */
export const ARGUS_ARTIFACT_RELATED_KINDS = [
  'rule',
  'mutation_intent',
  'reasoning_trace',
  'outcome',
  'alert',
  'actor',
  'backtest',
  'post_apply_observation',
] as const;

export type ArgusArtifactRelatedKind = (typeof ARGUS_ARTIFACT_RELATED_KINDS)[number];

export interface ArgusArtifactRelatedRule {
  readonly id: string;
  readonly name: string;
  readonly index: string;
}

export interface ArgusArtifactRelatedMutationIntent {
  readonly id: string;
  readonly summary: string;
}

export interface ArgusArtifactRelatedReasoningTrace {
  readonly run_id: string;
  readonly steps: number;
}

export interface ArgusArtifactRelatedOutcome {
  readonly id: string;
  readonly status: string;
}

export interface ArgusArtifactRelatedAlert {
  readonly id: string;
  readonly rule_name?: string;
}

export interface ArgusArtifactRelatedActor {
  readonly id: string;
  readonly trust_tier?: string;
}

export interface ArgusArtifactRelated {
  readonly rule?: ArgusArtifactRelatedRule;
  readonly mutation_intent?: ArgusArtifactRelatedMutationIntent;
  readonly reasoning_trace?: ArgusArtifactRelatedReasoningTrace;
  readonly outcome?: ArgusArtifactRelatedOutcome;
  readonly alert?: ArgusArtifactRelatedAlert;
  readonly actor?: ArgusArtifactRelatedActor;
  /**
   * Backtest summary + sample events scoped by the artifact's rule /
   * mutation_intent_id. Reuses the same shape the Mutations flyout
   * renders so the shared artifact-details flyout can surface the same
   * evidence when opened from the Activity feed, Mutation lineage or
   * Autonomy decisions panel.
   */
  readonly backtest?: ArgusMutationDetailBacktest;
  /**
   * Post-apply observation pulled from `.alerts-security.alerts-*` in
   * the watch window `[applied_at, rolled_back_at or now]`. Populated
   * only when an outcome is available for the artifact.
   */
  readonly post_apply_observation?: ArgusMutationPostApplyObservation;
}

export type ArgusArtifactDetailsReasonCode = 'ok' | 'not_found';

/**
 * Generic "fetch the raw document at (source_index, source_doc_id) plus any
 * related entities it references" response. Powers the shared details flyout
 * used by the Activity feed and Mutation lineage panels.
 */
export interface ArgusArtifactDetails {
  readonly reason_code: ArgusArtifactDetailsReasonCode;
  readonly source_index: string;
  readonly source_doc_id: string;
  /**
   * Full `_source` of the origin document. Omitted only when `reason_code`
   * is `"not_found"` (the index or doc no longer exists).
   */
  readonly raw_document?: Readonly<Record<string, unknown>>;
  /**
   * Best-effort enrichment — any entity the raw document references that
   * could be resolved. Fields are independent: a missing lookup is simply
   * absent, never a server error.
   */
  readonly related?: ArgusArtifactRelated;
}
