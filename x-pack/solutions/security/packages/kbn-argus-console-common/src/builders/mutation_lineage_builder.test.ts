/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildMutationLineageFromDocs } from './mutation_lineage_builder';
import {
  HAPPY_PATH_STAGE_DOCS,
  DRIFT_STAGE_DOCS,
  ROLLBACK_STAGE_DOCS,
} from './__fixtures__/mutation_lineage.fixtures';

describe('buildMutationLineageFromDocs', () => {
  const subject = { kind: 'rule', id: 'rule-soc-1024' } as const;

  it('returns not_found when mutation_intent_id is missing', () => {
    const result = buildMutationLineageFromDocs({ mutation_intent_id: '' } as never, subject);
    expect(result.reason_code).toBe('not_found');
  });

  it('builds all 8 canonical stages on the happy path', () => {
    const result = buildMutationLineageFromDocs(HAPPY_PATH_STAGE_DOCS, subject);
    expect(result.reason_code).toBe('ok');
    const nodeTypes = result.lineage!.nodes.map((n) => n.type);
    expect(nodeTypes).toEqual([
      'source',
      'exploit_probability',
      'synthesis',
      'eval',
      'backtest',
      'apply',
      'observe',
      'outcome',
    ]);
  });

  it('marks missing stages as skipped instead of dropping them', () => {
    const result = buildMutationLineageFromDocs(
      { ...HAPPY_PATH_STAGE_DOCS, backtest: undefined, outcome: undefined },
      subject
    );
    const statuses = Object.fromEntries(result.lineage!.nodes.map((n) => [n.type, n.status]));
    expect(statuses.backtest).toBe('skipped');
    expect(statuses.outcome).toBe('skipped');
    expect(statuses.eval).toBe('done');
  });

  it('adds drift_detected node and drift edges when drift stage is present', () => {
    const result = buildMutationLineageFromDocs(DRIFT_STAGE_DOCS, subject);
    const nodeTypes = result.lineage!.nodes.map((n) => n.type);
    expect(nodeTypes).toContain('drift_detected');

    const driftEdges = result.lineage!.edges.filter((e) => e.kind === 'drift');
    expect(driftEdges).toHaveLength(2);
    expect(driftEdges.find((e) => e.from === 'observe' && e.to === 'drift_detected')).toBeDefined();
    expect(driftEdges.find((e) => e.from === 'drift_detected' && e.to === 'eval')).toBeDefined();
  });

  it('adds a rollback edge from apply back to synthesis when rolled_back=true', () => {
    const result = buildMutationLineageFromDocs(ROLLBACK_STAGE_DOCS, subject);
    const rollback = result.lineage!.edges.find((e) => e.kind === 'rollback');
    expect(rollback).toBeDefined();
    expect(rollback?.from).toBe('apply');
    expect(rollback?.to).toBe('synthesis');
  });

  it('emits flow edges in canonical order and does not duplicate them', () => {
    const result = buildMutationLineageFromDocs(HAPPY_PATH_STAGE_DOCS, subject);
    const flowEdges = result.lineage!.edges.filter((e) => e.kind === 'flow');
    expect(flowEdges).toHaveLength(7);
    expect(flowEdges[0].from).toBe('source');
    expect(flowEdges[0].to).toBe('exploit_probability');
    expect(flowEdges[flowEdges.length - 1].to).toBe('outcome');
  });

  it('propagates source_doc_id and source_index onto each node', () => {
    const result = buildMutationLineageFromDocs(HAPPY_PATH_STAGE_DOCS, subject);
    const evalNode = result.lineage!.nodes.find((n) => n.type === 'eval');
    expect(evalNode?.source_doc_id).toBe('eval-run-99');
    expect(evalNode?.source_index).toBe('.soc-argus-eval-runs');
  });
});
