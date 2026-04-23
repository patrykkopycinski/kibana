/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type LineageNodeType =
  | 'source'
  | 'exploit_probability'
  | 'synthesis'
  | 'eval'
  | 'backtest'
  | 'apply'
  | 'observe'
  | 'outcome'
  | 'drift_detected';

export type LineageNodeStatus = 'done' | 'skipped' | 'pending' | 'error';

export interface LineageNode {
  readonly id: string;
  readonly type: LineageNodeType;
  readonly status: LineageNodeStatus;
  readonly label: string;
  readonly subtitle?: string;
  readonly timestamp?: string;
  readonly source_doc_id?: string;
  readonly source_index?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type LineageEdgeKind = 'flow' | 'rollback' | 'drift';

export interface LineageEdge {
  readonly from: LineageNodeType;
  readonly to: LineageNodeType;
  readonly kind: LineageEdgeKind;
  readonly label?: string;
}

export type MutationLineageSubjectKind = 'alert' | 'rule' | 'mutation' | 'cve';

export interface MutationLineageSubject {
  readonly kind: MutationLineageSubjectKind;
  readonly id: string;
}

export interface MutationLineage {
  readonly subject: MutationLineageSubject;
  readonly mutation_intent_id: string;
  readonly rule_id?: string;
  readonly nodes: readonly LineageNode[];
  readonly edges: readonly LineageEdge[];
}

export type MutationLineageReasonCode = 'ok' | 'not_found' | 'not_authorized';

export interface MutationLineageBuildResult {
  readonly subject: MutationLineageSubject;
  readonly reason_code: MutationLineageReasonCode;
  readonly lineage?: MutationLineage;
}

/**
 * Canonical left-to-right column order used by the SVG renderer.
 * `drift_detected` sits on a branch row below `observe` and feeds back into `eval`.
 */
export const CANONICAL_STAGE_ORDER: readonly LineageNodeType[] = [
  'source',
  'exploit_probability',
  'synthesis',
  'eval',
  'backtest',
  'apply',
  'observe',
  'outcome',
] as const;
