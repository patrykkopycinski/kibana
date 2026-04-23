/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The `.soc-decision-graph` index stores a typed edge per relation between
 * ARGUS subjects (advisories, intents, outcomes, rules, actors, techniques,
 * reasoning chains, audit events). The Console flyout and the full-screen
 * Decision Graph explorer both consume this contract, and Agent Builder tools
 * query the same route programmatically.
 *
 * Keep this file side-effect free — it is imported from both browser and
 * server bundles.
 */

/**
 * Every edge in `.soc-decision-graph` is keyed by a source doc and a target
 * doc, each tagged with one of these kinds. The union is the canonical
 * vocabulary for node colouring, filter chips, and pathfinding.
 */
export type DecisionGraphNodeKind =
  | 'advisory'
  | 'intent'
  | 'outcome'
  | 'rule'
  | 'actor'
  | 'technique'
  | 'reasoning'
  | 'audit'
  | 'observation';

/**
 * A rendered graph node — either returned as-is by `GET .../decision_graph`
 * (when the root happens to be in the response) or materialised from an edge's
 * `from_*` / `to_*` fields on the client.
 *
 * `label` is a short, human-friendly name (rule title, CVE id, technique id,
 * etc). `evidence_ts` is the timestamp of the most recent edge touching this
 * node; it is used by the explorer's "evidence window" filter.
 */
export interface DecisionGraphNode {
  kind: DecisionGraphNodeKind;
  id: string;
  label: string;
  evidence_ts?: string;
}

/**
 * A typed edge between two decision-graph nodes.
 *
 * - `relation` is the semantic verb (e.g. `advisory_to_intent`, `actor_uses_technique`).
 *   The full enum lives on the server in the edge-builder registry; the client
 *   treats it as a free-form string used for filter chips and legend labels.
 * - `strength` is an optional `[0, 1]` confidence. Builders that don't emit a
 *   strength omit the field; the explorer's threshold filter ignores edges
 *   without a strength.
 * - `provenance` points back to the source doc that produced the edge so
 *   downstream tooling can deep-link to the raw document.
 */
export interface DecisionGraphEdge {
  edge_id: string;
  from_kind: DecisionGraphNodeKind;
  from_id: string;
  to_kind: DecisionGraphNodeKind;
  to_id: string;
  relation: string;
  evidence_ts?: string;
  strength?: number;
  provenance?: {
    source_index: string;
    source_doc_id: string;
  };
}

/**
 * Request contract for `GET /internal/security_solution/argus/decision_graph`.
 *
 * `depth` is server-capped at 3 and the response is capped at 200 nodes. Both
 * caps are enforced server-side; clients SHOULD still pass a depth ≤ 3 so URL
 * state stays normalised.
 */
export interface DecisionGraphRequest {
  root_kind: DecisionGraphNodeKind;
  root_id: string;
  depth: number;
}

/**
 * Response contract for the decision-graph route.
 *
 * `truncated` is `true` when the server hit either the depth cap or the
 * 200-node cap; the UI surfaces this in a callout so users know the
 * neighborhood they're exploring is not complete.
 */
export interface DecisionGraphResponse {
  root: {
    kind: DecisionGraphNodeKind;
    id: string;
  };
  depth: number;
  nodes: DecisionGraphNode[];
  edges: DecisionGraphEdge[];
  truncated: boolean;
}

/**
 * A single "recent root" surfaced to the Decision graph panel. Represents the
 * most-recently-seen outgoing subject `(kind, id)` in `.soc-decision-graph`
 * together with a friendly label and the number of outgoing edges rooted at
 * it (used to rank chips / prefer high-fan-out roots for auto-apply).
 */
export interface DecisionGraphRecentRoot {
  kind: DecisionGraphNodeKind;
  id: string;
  label: string;
  /** Count of edges with `from_kind == kind && from_id == id`. */
  edge_count: number;
  /** Most recent `@timestamp` across edges rooted at this subject. */
  last_evidence_ts?: string;
}

/**
 * Response contract for
 * `GET /internal/security_solution/argus/decision_graph/recent_roots`.
 *
 * Items are ordered newest-evidence first. Clients should treat the list as
 * empty-but-valid (not an error) when the decision graph has not been seeded
 * yet — the panel falls back to its manual subject picker.
 */
export interface DecisionGraphRecentRootsResponse {
  items: DecisionGraphRecentRoot[];
}
