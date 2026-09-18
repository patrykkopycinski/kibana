/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEEP_WATCH_FORENSICS_REPORTS_INDEX } from '../constants';
import {
  buildDurableOutcomeSearch,
  evaluateDurableOutcome,
  hasEvaluationRecordShape,
} from './durable_outcome';

interface LooseSearch {
  index: string;
  query: { bool: { must: Array<Record<string, unknown>> } };
  size: number;
}

const searchFor = (runId: string, runStartedAt: string) =>
  buildDurableOutcomeSearch({ runId, runStartedAt }) as unknown as LooseSearch;

const validRecord = {
  report_status: 'DRAFT',
  timeline: [{ offset: 0 }],
  validated_iocs: [{ type: 'network_destination', value: '185.220.101.42', status: 'confirmed' }],
  unresolved_questions: ['Was the mailbox the initial vector?'],
  confidence_assessment: { overall: 'medium' },
};

describe('L4 durable outcome gate', () => {
  describe('buildDurableOutcomeSearch', () => {
    it('correlates the readback to this run id and start time', () => {
      const runStartedAt = '2026-09-18T10:00:00.000Z';
      const search = searchFor('fw-l4-run-1', runStartedAt);

      expect(search.index).toBe(DEEP_WATCH_FORENSICS_REPORTS_INDEX);
      expect(search.query.bool.must).toEqual([
        { match: { report_status: 'DRAFT' } },
        { range: { '@timestamp': { gte: runStartedAt } } },
        { multi_match: { query: 'fw-l4-run-1', fields: ['*'], type: 'phrase' } },
      ]);
    });

    it('does not accept an unanchored relative time window', () => {
      const search = searchFor('fw-l4-run-2', '2026-09-18T10:00:00.000Z');
      const serialized = JSON.stringify(search.query);

      expect(serialized).not.toContain('now-');
      expect(serialized).toContain('2026-09-18T10:00:00.000Z');
      expect(serialized).toContain('fw-l4-run-2');
    });
  });

  describe('hasEvaluationRecordShape', () => {
    it('accepts a document carrying every Evaluation Record section', () => {
      expect(hasEvaluationRecordShape(validRecord)).toBe(true);
    });

    it('rejects a document missing any Evaluation Record section', () => {
      for (const key of Object.keys(validRecord)) {
        const malformed: Record<string, unknown> = { ...validRecord };
        delete malformed[key];
        expect(hasEvaluationRecordShape(malformed)).toBe(false);
      }
      expect(hasEvaluationRecordShape(undefined)).toBe(false);
    });
  });

  describe('evaluateDurableOutcome', () => {
    it('fails when this run persisted nothing, even if produce_draft was called', () => {
      const outcome = evaluateDurableOutcome({ produceDraftCalled: true, correlatedHits: [] });

      expect(outcome).toEqual({
        success: false,
        persistedCount: 0,
        hasEvaluationRecordShape: false,
      });
    });

    it('fails when the correlated document is not a well-formed Evaluation Record', () => {
      const outcome = evaluateDurableOutcome({
        produceDraftCalled: true,
        correlatedHits: [{ _source: { report_status: 'DRAFT' } }],
      });

      expect(outcome.success).toBe(false);
      expect(outcome.persistedCount).toBe(1);
      expect(outcome.hasEvaluationRecordShape).toBe(false);
    });

    it('fails when produce_draft was never called, even with a valid correlated record', () => {
      const outcome = evaluateDurableOutcome({
        produceDraftCalled: false,
        correlatedHits: [{ _source: validRecord }],
      });

      expect(outcome.success).toBe(false);
      expect(outcome.hasEvaluationRecordShape).toBe(true);
    });

    it('succeeds only when the tool ran and this run persisted a valid Evaluation Record', () => {
      const outcome = evaluateDurableOutcome({
        produceDraftCalled: true,
        correlatedHits: [{ _source: validRecord }],
      });

      expect(outcome).toEqual({
        success: true,
        persistedCount: 1,
        hasEvaluationRecordShape: true,
      });
    });
  });
});
