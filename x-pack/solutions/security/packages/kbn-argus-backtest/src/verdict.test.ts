/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleAction } from './verdict';
import { classifyBacktest, flipIntentStatus, CREATE_HIT_THRESHOLDS } from './verdict';

describe('classifyBacktest — R8 invariant: every auto_apply has a dry-run', () => {
  describe('op=delete', () => {
    it('always rejects regardless of stats', () => {
      const res = classifyBacktest({
        op: 'delete',
        tp_correlations: 0,
        alert_count: 0,
      });
      expect(res.verdict).toBe('projection_concerning');
      expect(res.next_status).toBe('pending_review');
      expect(res.verdict_reason).toMatch(/destructive/i);
    });

    it('rejects delete even with many TPs', () => {
      const res = classifyBacktest({
        op: 'delete',
        tp_correlations: 50,
        alert_count: 1000,
      });
      expect(res.verdict).toBe('projection_concerning');
    });
  });

  describe('op=create — create-path dry-run (new in R8)', () => {
    it('returns projection_unknown when projected_create_hits missing', () => {
      const res = classifyBacktest({
        op: 'create',
        tp_correlations: 0,
        alert_count: 0,
      });
      expect(res.verdict).toBe('projection_unknown');
      expect(res.next_status).toBe('pending_review');
      expect(res.verdict_reason).toMatch(/missing projected_create_hits/);
    });

    it('returns projection_unknown when projected hits = 0 (rule never fires)', () => {
      const res = classifyBacktest({
        op: 'create',
        tp_correlations: 0,
        alert_count: 0,
        projected_create_hits: 0,
      });
      expect(res.verdict).toBe('projection_unknown');
      expect(res.verdict_reason).toMatch(/projected 0 hits/);
    });

    it('returns projection_safe at exactly the safe threshold', () => {
      const res = classifyBacktest({
        op: 'create',
        tp_correlations: 0,
        alert_count: 0,
        projected_create_hits: CREATE_HIT_THRESHOLDS.safe,
      });
      expect(res.verdict).toBe('projection_safe');
      expect(res.next_status).toBe('auto_apply_ready');
    });

    it('returns projection_safe for 1..safe hits', () => {
      for (const hits of [1, 5, 10, CREATE_HIT_THRESHOLDS.safe - 1]) {
        const res = classifyBacktest({
          op: 'create',
          tp_correlations: 0,
          alert_count: 0,
          projected_create_hits: hits,
        });
        expect(res.verdict).toBe('projection_safe');
      }
    });

    it('returns projection_concerning above the safe threshold', () => {
      const res = classifyBacktest({
        op: 'create',
        tp_correlations: 0,
        alert_count: 0,
        projected_create_hits: CREATE_HIT_THRESHOLDS.safe + 1,
      });
      expect(res.verdict).toBe('projection_concerning');
      expect(res.next_status).toBe('pending_review');
    });

    it('returns projection_concerning for noisy rules', () => {
      const res = classifyBacktest({
        op: 'create',
        tp_correlations: 0,
        alert_count: 0,
        projected_create_hits: 500,
      });
      expect(res.verdict).toBe('projection_concerning');
      expect(res.verdict_reason).toMatch(/500/);
    });
  });

  describe('op=update — action-dependent', () => {
    it('is safe for non-match-affecting actions regardless of TP count', () => {
      const safeActions: RuleAction[] = ['change_severity', 'change_risk_score', 'add_note'];
      for (const action of safeActions) {
        for (const tps of [0, 10, 100]) {
          const res = classifyBacktest({
            op: 'update',
            action,
            tp_correlations: tps,
            alert_count: 0,
          });
          expect(res.verdict).toBe('projection_safe');
          expect(res.next_status).toBe('auto_apply_ready');
        }
      }
    });

    it('is unknown for action=enable', () => {
      const res = classifyBacktest({
        op: 'update',
        action: 'enable',
        tp_correlations: 0,
        alert_count: 0,
      });
      expect(res.verdict).toBe('projection_unknown');
      expect(res.next_status).toBe('pending_review');
    });

    it('disable is safe with 0 TPs, concerning with any TP', () => {
      expect(
        classifyBacktest({
          op: 'update',
          action: 'disable',
          tp_correlations: 0,
          alert_count: 0,
        }).verdict
      ).toBe('projection_safe');
      expect(
        classifyBacktest({
          op: 'update',
          action: 'disable',
          tp_correlations: 1,
          alert_count: 10,
        }).verdict
      ).toBe('projection_concerning');
    });

    it('raise_threshold is safe with 0 TPs, concerning with any TP', () => {
      expect(
        classifyBacktest({
          op: 'update',
          action: 'raise_threshold',
          tp_correlations: 0,
          alert_count: 0,
        }).verdict
      ).toBe('projection_safe');
      expect(
        classifyBacktest({
          op: 'update',
          action: 'raise_threshold',
          tp_correlations: 3,
          alert_count: 100,
        }).verdict
      ).toBe('projection_concerning');
    });

    it('tighten_query, broaden_query, lower_threshold are always concerning', () => {
      const concerning: RuleAction[] = ['tighten_query', 'broaden_query', 'lower_threshold'];
      for (const action of concerning) {
        for (const tps of [0, 5]) {
          const res = classifyBacktest({
            op: 'update',
            action,
            tp_correlations: tps,
            alert_count: 0,
          });
          expect(res.verdict).toBe('projection_concerning');
          expect(res.next_status).toBe('pending_review');
        }
      }
    });

    it('returns projection_unknown when action is missing', () => {
      const res = classifyBacktest({
        op: 'update',
        tp_correlations: 0,
        alert_count: 0,
      });
      expect(res.verdict).toBe('projection_unknown');
    });
  });

  describe('flipIntentStatus', () => {
    it('maps projection_safe → auto_apply_ready', () => {
      expect(flipIntentStatus('projection_safe')).toBe('auto_apply_ready');
    });
    it('maps projection_concerning → pending_review', () => {
      expect(flipIntentStatus('projection_concerning')).toBe('pending_review');
    });
    it('maps projection_unknown → pending_review', () => {
      expect(flipIntentStatus('projection_unknown')).toBe('pending_review');
    });
  });

  describe('R8 invariant — every op reaches the classifier', () => {
    it('no op produces a verdict that bypasses pending_review unless projection_safe', () => {
      const ops = ['create', 'update', 'delete'] as const;
      const actions: RuleAction[] = [
        'raise_threshold',
        'lower_threshold',
        'tighten_query',
        'broaden_query',
        'disable',
        'enable',
        'change_severity',
        'change_risk_score',
        'add_note',
      ];
      for (const op of ops) {
        for (const action of actions) {
          for (const tps of [0, 3]) {
            const res = classifyBacktest({
              op,
              action,
              tp_correlations: tps,
              alert_count: 0,
              projected_create_hits: 5,
            });
            if (res.next_status === 'auto_apply_ready') {
              expect(res.verdict).toBe('projection_safe');
            }
          }
        }
      }
    });
  });
});
