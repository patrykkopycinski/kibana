/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildInvestigationReadbackSearch,
  evaluateDurableOutcome,
  hasCorroborationContent,
  type DurableOutcomeHit,
} from './durable_outcome';

const runContext = { runId: 'rl-l4-abc', runStartedAt: '2026-08-18T10:00:00.000Z' };

const hitWith = (source: Record<string, unknown>): DurableOutcomeHit => ({ _source: source });

describe('buildInvestigationReadbackSearch', () => {
  it('correlates the readback to the run id and the run start time', () => {
    const search = buildInvestigationReadbackSearch(runContext);
    const must = (search.query.bool.must ?? []) as unknown[];

    expect(search.index).toBe('.pnd-investigations');
    expect(must).toEqual([
      { range: { '@timestamp': { gte: runContext.runStartedAt } } },
      { multi_match: { query: runContext.runId, fields: ['*'], type: 'phrase' } },
    ]);
  });

  it('does not accept any document written in a fixed lookback window', () => {
    // Regression: the readback matched every record from the last five minutes,
    // so a document written by another example or a retry satisfied it.
    const search = buildInvestigationReadbackSearch(runContext);

    expect(JSON.stringify(search)).not.toContain('now-5m');
    expect(JSON.stringify(search)).toContain(runContext.runId);
  });
});

describe('hasCorroborationContent', () => {
  it('requires the stored record to carry the findings', () => {
    expect(hasCorroborationContent(hitWith({ events: ['corroborated stage 1'] }))).toBe(true);
    expect(hasCorroborationContent(hitWith({ events: ['proposal emitted'] }))).toBe(false);
    expect(hasCorroborationContent(undefined)).toBe(false);
  });
});

describe('evaluateDurableOutcome', () => {
  it('passes only when a correlated record with findings was read back', () => {
    const gate = evaluateDurableOutcome({
      correlatedHits: [hitWith({ timeline: 'corroboration report persisted' })],
    });

    expect(gate).toEqual({
      success: true,
      persistedCount: 1,
      corroborationContentStored: true,
    });
  });

  it('fails when nothing correlates to this run', () => {
    expect(evaluateDurableOutcome({ correlatedHits: [] }).success).toBe(false);
  });

  it('fails when the correlated record carries no findings', () => {
    const gate = evaluateDurableOutcome({ correlatedHits: [hitWith({ status: 'draft' })] });

    expect(gate.persistedCount).toBe(1);
    expect(gate.success).toBe(false);
  });
});
