/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowExecutionDto } from '@kbn/workflows';
import { evidenceCompleteness, seededEvidenceOf, summarizeCell } from './cell_report';
import { isPrivilegeError, readEvidence } from './evidence';

const step = (stepId: string, output?: unknown, error?: unknown) => ({ stepId, output, error });

const analysis = (steps: ReturnType<typeof step>[], status = 'completed'): WorkflowExecutionDto =>
  ({ status, stepExecutions: steps } as unknown as WorkflowExecutionDto);

const search = (total: number) => ({ hits: { total: { value: total }, hits: [] } });

const SEEDED = { alerts: 2, entities: 2, events: 4 };

const PRIVILEGE_ERROR = {
  type: 'Error',
  message:
    'security_exception: action [indices:data/read/search] is unauthorized for user [alertzero_x] on indices [entities-latest-sp1]',
};

describe('readEvidence behind retry wrappers', () => {
  // An `on-failure: retry` step is recorded twice with one stepId: the wrapper (stepType
  // `retry`, output null) first, then the step itself. Live exec bf0c3d2a: idx 9 / idx 10.
  const wrapped = (stepId: string, output: unknown, error?: unknown) => [
    { stepId, stepType: 'retry', output: null, error: undefined },
    { stepId, stepType: 'data.set', output, error },
  ];

  it('reads the real step, not the retry wrapper', () => {
    const reading = readEvidence(
      analysis([
        ...wrapped('count_alerts', { found: 2, cited: 2 }),
        step('load_entities', search(2)),
        step('load_events', search(4)),
        ...wrapped('block_truncated_clear', { verdict: 'false_positive' }),
      ] as never),
      'exec-retry',
      SEEDED
    );
    expect(reading.sources.find((s) => s.source === 'alerts')?.hits).toBe(2);
    expect(reading.completeness).toBe(1);
    expect(reading.verdict).toBe('false_positive');
  });

  it('takes the last real attempt and surfaces its error', () => {
    const reading = readEvidence(
      analysis([
        ...wrapped('load_entities', undefined, PRIVILEGE_ERROR),
        step('count_alerts', { found: 2, cited: 2 }),
        step('load_events', search(4)),
      ] as never),
      'exec-retry-error',
      SEEDED
    );
    expect(reading.swallowedPrivilegeErrors).toHaveLength(1);
  });
});

describe('readEvidence', () => {
  it('is complete when every source returns what was seeded', () => {
    const reading = readEvidence(
      analysis([
        step('count_alerts', { found: 2, cited: 2 }),
        step('load_entities', search(2)),
        step('load_events', search(4)),
        step('block_truncated_clear', { verdict: 'false_positive' }),
      ]),
      'exec-1',
      SEEDED
    );
    expect(reading.completeness).toBe(1);
    expect(reading.verdict).toBe('false_positive');
    expect(reading.swallowedPrivilegeErrors).toEqual([]);
  });

  it('drops when the entity read was denied, and names the swallowed privilege error', () => {
    const reading = readEvidence(
      analysis([
        step('count_alerts', { found: 2, cited: 2 }),
        step('load_entities', undefined, PRIVILEGE_ERROR),
        step('load_events', search(4)),
      ]),
      'exec-1',
      SEEDED
    );
    expect(reading.completeness).toBeCloseTo(2 / 3);
    expect(reading.sources.find((s) => s.source === 'entities')).toMatchObject({
      failed: true,
      hits: 0,
      privilegeError: true,
    });
    expect(reading.swallowedPrivilegeErrors).toHaveLength(1);
    expect(reading.swallowedPrivilegeErrors[0].source).toBe('entities');
  });

  it('counts an empty (not failed) source as starved without calling it a privilege error', () => {
    // Index missing / wrong space: the search succeeds with no hits.
    const reading = readEvidence(
      analysis([
        step('count_alerts', { found: 2, cited: 2 }),
        step('load_entities', search(0)),
        step('load_events', search(4)),
      ]),
      'exec-1',
      SEEDED
    );
    expect(reading.completeness).toBeCloseTo(2 / 3);
    expect(reading.swallowedPrivilegeErrors).toEqual([]);
  });

  it('a missing step reads as no evidence, and nothing seeded measures nothing', () => {
    expect(readEvidence(analysis([]), 'e', SEEDED).completeness).toBe(0);
    expect(
      readEvidence(analysis([]), 'e', { alerts: 0, entities: 0, events: 0 }).completeness
    ).toBeNull();
  });

  it('classifies privilege errors and ignores other failures', () => {
    expect(isPrivilegeError(PRIVILEGE_ERROR.message)).toBe(true);
    expect(isPrivilegeError('index_not_found_exception: no such index')).toBe(false);
    expect(isPrivilegeError(undefined)).toBe(false);
  });
});

describe('summarizeCell', () => {
  const reading = (completeness: number, analysisStatus = 'completed', privilege = false) =>
    ({
      analysisExecutionId: 'a',
      sources: [],
      completeness,
      analysisStatus,
      swallowedPrivilegeErrors: privilege ? [{ source: 'entities', error: 'denied' }] : [],
    } as never);

  const baseline = [
    { exampleKey: 'a', verdict: 'false_positive', evidence: [reading(1)] },
    { exampleKey: 'b', verdict: 'true_positive', evidence: [reading(1)] },
  ];

  it('reports completeness, agreement vs baseline and swallowed vs surfaced privilege errors', () => {
    const cell = summarizeCell(
      'worker-sa-space-no-entities',
      [
        { exampleKey: 'a', verdict: 'inconclusive', evidence: [reading(0.5, 'completed', true)] },
        { exampleKey: 'b', verdict: 'true_positive', evidence: [reading(0.5, 'failed', true)] },
      ],
      baseline
    );
    expect(cell.evidenceCompleteness).toBe(0.5);
    expect(cell.verdictAgreementVsBaseline).toBe(0.5);
    expect(cell.privilegeErrorsSwallowed).toBe(1);
    expect(cell.privilegeErrorsSurfaced).toBe(1);
    expect(cell.swallowedDetails).toEqual(['a: entities — denied']);
  });

  it('the baseline has no agreement figure against itself', () => {
    const cell = summarizeCell('superuser-default', baseline);
    expect(cell.verdictAgreementVsBaseline).toBeNull();
    expect(cell.evidenceCompleteness).toBe(1);
  });
});

describe('evidenceCompleteness evaluator', () => {
  const run = (evidence: unknown[]) =>
    evidenceCompleteness.evaluate({ output: { record: { evidence } } } as never);

  it('scores the mean completeness and labels starved runs', async () => {
    expect(
      await run([{ completeness: 1, sources: [], swallowedPrivilegeErrors: [] }])
    ).toMatchObject({
      score: 1,
      label: 'complete',
    });
    expect(
      await run([{ completeness: 0.5, sources: [], swallowedPrivilegeErrors: [] }])
    ).toMatchObject({ score: 0.5, label: 'starved' });
  });

  it('does not score a run that measured nothing', async () => {
    expect(await run([])).toMatchObject({ score: null, label: 'not_measured' });
  });
});

describe('seededEvidenceOf', () => {
  it('counts the documents the world seeds per source', () => {
    expect(seededEvidenceOf({ alerts: [1, 2], events: [1], entities: [] })).toEqual({
      alerts: 2,
      entities: 0,
      events: 1,
    });
  });
});
