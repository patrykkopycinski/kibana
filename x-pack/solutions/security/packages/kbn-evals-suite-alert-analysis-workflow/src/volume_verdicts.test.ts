/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  assignCallsToChunks,
  chunkAlertIds,
  diagnoseVolume,
  volumeIntegrityChecks,
  type ClassificationCall,
} from './volume_verdicts';
import { ALERT_ANALYSIS_VOLUME_BATCHES, buildVolumeBatchAlerts } from './volume_batches';

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

const call = (
  index: number,
  verdictIds: string[],
  overrides: Partial<ClassificationCall> = {}
): ClassificationCall => ({
  stepId: 'runPrompt_step',
  stepExecutionIndex: index,
  status: 'completed',
  executionTimeMs: 1000,
  inputTokens: 10,
  outputTokens: 20,
  errorText: null,
  verdicts: verdictIds.map((id) => ({ id, classification: 'true_positive' })),
  ...overrides,
});

const alertsFor = (alertIds: string[]) => alertIds.map((id) => ({ id, expected: 'true_positive' }));

describe('chunkAlertIds', () => {
  it('splits 120 into 50/50/20', () => {
    expect(chunkAlertIds(ids('a', 120), 50).map((c) => c.length)).toEqual([50, 50, 20]);
  });
});

describe('diagnoseVolume', () => {
  const all = ids('a', 120);
  const chunks = chunkAlertIds(all, 50);

  it('passes a clean three-call run', () => {
    const d = diagnoseVolume({
      batchId: 'b',
      alerts: alertsFor(all),
      batchSize: 50,
      calls: chunks.map((c, i) => call(i, c)),
    });
    expect(d.coverage).toBe(1);
    expect(d.emptyChunks).toEqual([]);
    expect(d.erroredCalls).toBe(0);
    expect(d.rawVerdictCount).toBe(120);
    expect(d.accuracy).toBe(1);
    expect(Object.values(volumeIntegrityChecks(d)).every(Boolean)).toBe(true);
  });

  it('flags a partial final chunk that got no call', () => {
    const d = diagnoseVolume({
      batchId: 'b',
      alerts: alertsFor(all),
      batchSize: 50,
      calls: [call(0, chunks[0]), call(1, chunks[1])],
    });
    expect(d.emptyChunks).toEqual([2]);
    expect(d.missingIds).toHaveLength(20);
    expect(d.coverage).toBeCloseTo(100 / 120);
    expect(volumeIntegrityChecks(d).everyChunkHasAVerdictArray).toBe(false);
    expect(volumeIntegrityChecks(d).coverageAtLeastMin).toBe(false);
  });

  it('assigns an errored empty call to the chunk it failed on, not the next one', () => {
    const failed = call(1, [], { status: 'failed', errorText: '{"message":"400 invalid argument"}' });
    const d = diagnoseVolume({
      batchId: 'b',
      alerts: alertsFor(all),
      batchSize: 50,
      calls: [call(0, chunks[0]), failed, call(2, chunks[2])],
    });
    expect(d.emptyChunks).toEqual([1]);
    expect(d.erroredCalls).toBe(1);
    expect(d.errorTexts[0]).toContain('400');
    expect(d.chunks[2].coverage).toBe(1);
    expect(d.chunks[1].callCount).toBe(1);
    expect(d.chunks[1].erroredCalls).toBe(1);
    expect(d.chunks[1].errorTexts[0]).toContain('400');
  });

  it('uses the foreach scope id when present', () => {
    const assigned = assignCallsToChunks(chunks, [
      call(0, [], { scopeId: '2', status: 'failed', errorText: 'x' }),
      call(1, chunks[0], { scopeId: '0' }),
    ]);
    expect(assigned[2]).toHaveLength(1);
    expect(assigned[0]).toHaveLength(1);
    expect(assigned[1]).toHaveLength(0);
  });

  it('counts duplicates, foreign ids and over-generation per chunk', () => {
    const chunk = chunks[2];
    const raw = [...chunk, chunk[0], 'foreign-1'];
    const d = diagnoseVolume({
      batchId: 'b',
      alerts: alertsFor(all),
      batchSize: 50,
      calls: [call(0, chunks[0]), call(1, chunks[1]), call(2, raw)],
    });
    expect(d.chunks[2].overGeneratedBy).toBe(2);
    expect(d.duplicateIds).toEqual([chunk[0]]);
    expect(d.foreignIds).toEqual(['foreign-1']);
    expect(d.coverage).toBe(1);
    const checks = volumeIntegrityChecks(d);
    expect(checks.noDuplicates).toBe(false);
    expect(checks.noForeignIds).toBe(false);
  });

  it('a merged near-duplicate pair costs exactly one verdict', () => {
    const sixty = ids('p', 60);
    const merged = sixty.filter((_, i) => i !== 1);
    const d = diagnoseVolume({
      batchId: 'b',
      alerts: alertsFor(sixty),
      batchSize: 50,
      calls: [call(0, merged.slice(0, 49)), call(1, merged.slice(49))],
    });
    expect(d.missingIds).toEqual(['p-1']);
    expect(d.coverage).toBeCloseTo(59 / 60);
    expect(volumeIntegrityChecks(d).noMissingVerdicts).toBe(false);
  });

  it('scores accuracy against labels and counts unanswered alerts as wrong', () => {
    const four = ids('x', 4);
    const d = diagnoseVolume({
      batchId: 'b',
      alerts: [
        { id: four[0], expected: 'true_positive' },
        { id: four[1], expected: 'false_positive' },
        { id: four[2], expected: 'true_positive' },
        { id: four[3], expected: 'true_positive' },
      ],
      batchSize: 50,
      calls: [call(0, four.slice(0, 3))],
    });
    expect(d.accuracy).toBe(0.5);
  });
});

describe('volume fixtures', () => {
  it('S2 has 120 alerts and S3 has 60 alerts in 30 one-hex-char pairs on a shared host', () => {
    const [s2, s3] = ALERT_ANALYSIS_VOLUME_BATCHES;
    expect(s2.alerts).toHaveLength(120);
    expect(s3.alerts).toHaveLength(60);
    expect(s3.nearDuplicatePairs).toHaveLength(30);
    const built = buildVolumeBatchAlerts(s3, 'ab12cd34');
    const byId = new Map(built.map((a) => [a.id, a]));
    for (const [a, b] of s3.nearDuplicatePairs) {
      const ra = byId.get(a.replace('<run>', 'ab12cd34'))!;
      const rb = byId.get(b.replace('<run>', 'ab12cd34'))!;
      const diff = [...ra.id].filter((ch, i) => ch !== rb.id[i]).length;
      expect(ra.id).toHaveLength(rb.id.length);
      expect(diff).toBe(1);
      expect(ra.doc['host.name']).toBe(rb.doc['host.name']);
      expect(ra.expected).toBe(rb.expected);
      expect(ra.doc['user.name']).not.toBe(rb.doc['user.name']);
    }
    expect(new Set(built.map((a) => a.id)).size).toBe(60);
  });

  it('S2 is label-balanced so a constant answer cannot pass', () => {
    const tp = ALERT_ANALYSIS_VOLUME_BATCHES[0].alerts.filter((a) => a.expected === 'true_positive');
    expect(tp).toHaveLength(60);
  });
});
