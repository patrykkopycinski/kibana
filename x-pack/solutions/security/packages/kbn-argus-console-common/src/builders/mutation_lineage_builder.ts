/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  LineageEdge,
  LineageNode,
  LineageNodeStatus,
  LineageNodeType,
  MutationLineage,
  MutationLineageBuildResult,
  MutationLineageSubject,
} from '../types';
import { CANONICAL_STAGE_ORDER } from '../types';
import { ARGUS_SOC_INDICES } from '../constants';

/**
 * Raw documents the builder consumes. Every field is optional: the builder
 * degrades to `status: 'skipped'` for missing stages so the graph still renders.
 */
export interface MutationStageDocs {
  readonly mutation_intent_id: string;
  readonly rule_id?: string;
  readonly source?: StageDoc;
  readonly exploit_probability?: StageDoc;
  readonly synthesis?: StageDoc;
  readonly eval?: StageDoc;
  readonly backtest?: StageDoc;
  readonly apply?: StageDoc;
  readonly observe?: StageDoc;
  readonly outcome?: StageDoc;
  readonly drift_detected?: StageDoc;
  readonly rolled_back?: boolean;
}

export interface StageDoc {
  readonly id: string;
  readonly index?: string;
  readonly label?: string;
  readonly subtitle?: string;
  readonly '@timestamp'?: string;
  readonly status?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const DEFAULT_LABELS: Record<LineageNodeType, string> = {
  source: 'Source signal',
  exploit_probability: 'Exploit probability',
  synthesis: 'Rule synthesis',
  eval: 'Offline eval',
  backtest: 'Historical backtest',
  apply: 'Apply',
  observe: 'Observe',
  outcome: 'Outcome',
  drift_detected: 'Drift detected',
};

const DEFAULT_INDEX: Record<LineageNodeType, string | undefined> = {
  source: undefined,
  exploit_probability: undefined,
  synthesis: ARGUS_SOC_INDICES.mutationIntents,
  eval: ARGUS_SOC_INDICES.detectionEvalRuns,
  backtest: ARGUS_SOC_INDICES.backtestResults,
  apply: ARGUS_SOC_INDICES.recommendations,
  observe: ARGUS_SOC_INDICES.outcomes,
  outcome: ARGUS_SOC_INDICES.outcomes,
  drift_detected: ARGUS_SOC_INDICES.outcomes,
};

const normaliseStatus = (raw: string | undefined, present: boolean): LineageNodeStatus => {
  if (!present) return 'skipped';
  const lowered = raw?.toLowerCase();
  if (lowered === 'done' || lowered === 'success' || lowered === 'ok') return 'done';
  if (lowered === 'error' || lowered === 'failure' || lowered === 'failed') return 'error';
  if (lowered === 'pending' || lowered === 'in_progress' || lowered === 'queued') return 'pending';
  return present ? 'done' : 'skipped';
};

const toNode = (type: LineageNodeType, doc: StageDoc | undefined): LineageNode => {
  const present = Boolean(doc);
  return {
    id: doc?.id ?? `${type}:absent`,
    type,
    status: normaliseStatus(doc?.status, present),
    label: doc?.label ?? DEFAULT_LABELS[type],
    subtitle: doc?.subtitle,
    timestamp: doc?.['@timestamp'],
    source_doc_id: doc?.id,
    source_index: doc?.index ?? DEFAULT_INDEX[type],
    metadata: doc?.metadata,
  };
};

const canonicalEdges = (
  includeDrift: boolean,
  includeRollback: boolean
): readonly LineageEdge[] => {
  const flowEdges: LineageEdge[] = [];
  for (let i = 0; i < CANONICAL_STAGE_ORDER.length - 1; i += 1) {
    flowEdges.push({
      from: CANONICAL_STAGE_ORDER[i],
      to: CANONICAL_STAGE_ORDER[i + 1],
      kind: 'flow',
    });
  }

  if (includeDrift) {
    flowEdges.push({ from: 'observe', to: 'drift_detected', kind: 'drift', label: 'drift' });
    flowEdges.push({ from: 'drift_detected', to: 'eval', kind: 'drift', label: 're-eval' });
  }

  if (includeRollback) {
    flowEdges.push({ from: 'apply', to: 'synthesis', kind: 'rollback', label: 'rollback' });
  }

  return flowEdges;
};

export const buildMutationLineageFromDocs = (
  docs: MutationStageDocs,
  subject: MutationLineageSubject
): MutationLineageBuildResult => {
  if (!docs.mutation_intent_id) {
    return { subject, reason_code: 'not_found' };
  }

  const baseNodes = CANONICAL_STAGE_ORDER.map((type) => {
    const doc = docs[type as keyof MutationStageDocs] as StageDoc | undefined;
    return toNode(type, doc);
  });

  const includeDrift = Boolean(docs.drift_detected);
  if (includeDrift) {
    baseNodes.push(toNode('drift_detected', docs.drift_detected));
  }

  const lineage: MutationLineage = {
    subject,
    mutation_intent_id: docs.mutation_intent_id,
    rule_id: docs.rule_id,
    nodes: baseNodes,
    edges: canonicalEdges(includeDrift, Boolean(docs.rolled_back)),
  };

  return { subject, reason_code: 'ok', lineage };
};
