/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The five Argus layers that the activity feed surfaces. Each event is
 * classified into exactly one layer so operators can filter the feed by
 * "which part of Argus did this come from".
 *
 *   - `telemetry`   — raw endpoint / source signals (e.g. process chains)
 *   - `detection`   — exploit probability, rule matches, threat scoring
 *   - `mutation`    — mutation_intent lifecycle (synth → eval → apply → …)
 *   - `response`    — rollout / rollback / case actions
 *   - `governance`  — trust-tier changes, injection flags, drift resolutions
 */
export type ActivityLayer = 'telemetry' | 'detection' | 'mutation' | 'response' | 'governance';

export type ActivityPressure = 'low' | 'moderate' | 'high' | 'critical';

/**
 * Canonical shape the activity feed panel reads. One row per event, ordered
 * by `timestamp` descending. All optional fields are forward-compatible —
 * older docs may omit some of them.
 */
export interface ActivityEvent {
  /**
   * Stable id. For docs sourced from a single index the id is
   * `${index}:${doc_id}`; for composite events we fall back to
   * `${source_index}:${source_doc_id}:${layer}`.
   */
  readonly id: string;
  readonly layer: ActivityLayer;
  /**
   * ISO8601 timestamp of the underlying event. The server guarantees this is
   * a real `Date.parse`-able string; the UI sorts on it lexicographically.
   */
  readonly timestamp: string;
  /**
   * Human-readable actor id (e.g. `elastic-agent:endpoint-27`, `m2.5-default`,
   * `golden-cluster-eval`). Always present so the row always has *something*
   * to label.
   */
  readonly actor_id: string;
  /**
   * Best-effort trust tier at the moment the event happened. When the event
   * doc doesn't carry a tier, the server omits this field rather than
   * guessing.
   */
  readonly actor_trust_tier?: string;
  readonly pressure?: ActivityPressure;
  readonly title: string;
  readonly subtitle?: string;
  /**
   * Index the event was sourced from (e.g. `.soc-recommendations`). The UI
   * uses this to build a Discover deep-link.
   */
  readonly source_index?: string;
  readonly source_doc_id?: string;
  /**
   * Pivot identifiers — when present, the UI surfaces click-through links
   * into the other Argus panels (reasoning, lineage).
   */
  readonly alert_id?: string;
  readonly run_id?: string;
  readonly rule_id?: string;
  readonly mutation_intent_id?: string;
}

/**
 * Route filters. Sent as query-string parameters. All repeatable filters use
 * JSON-encoded arrays so the client can send `layers=["mutation","response"]`
 * without URL-encoding headaches on comma-delimited lists.
 */
export interface ActivityFeedFilters {
  readonly layers?: readonly ActivityLayer[];
  readonly pressure?: readonly ActivityPressure[];
  readonly actorIds?: readonly string[];
  readonly trustTiers?: readonly string[];
  /**
   * Max number of events to return. Defaults to 50 server-side; the UI
   * renders up to 100 comfortably.
   */
  readonly limit?: number;
}

export interface ActivityFeedResponse {
  readonly events: readonly ActivityEvent[];
  /**
   * True when the server truncated the result set. The UI surfaces this as
   * a "showing first N" caption so operators know to narrow the filters.
   */
  readonly truncated: boolean;
  /**
   * Count of per-layer hits *before* trimming to `limit`. Lets the UI render
   * a per-filter-chip badge showing "×12 mutation events" even when the
   * feed-body only carries the latest 5.
   */
  readonly counts_by_layer: Readonly<Record<ActivityLayer, number>>;
}
