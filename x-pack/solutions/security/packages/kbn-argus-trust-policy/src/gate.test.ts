/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BlastTier, DoorClass, TrustTier, MutationOrigin } from './gate';
import { evaluateTrustGate, TRUST_GATE_MATRIX } from './gate';

const doors: DoorClass[] = ['one_way', 'two_way'];
const blasts: BlastTier[] = ['small', 'medium', 'large', 'critical'];
const tiers: TrustTier[] = ['frontier', 'trusted', 'probationary', 'quarantined'];
const origins: MutationOrigin[] = [
  'exploit_to_detection',
  'drift_detected',
  'analyst',
  'triage',
  'recovery',
];

describe('evaluateTrustGate — R7 cap matrix', () => {
  describe('preconditions', () => {
    it('rejects with no_actor_tier when tier is null', () => {
      expect(
        evaluateTrustGate({
          door_class: 'two_way',
          blast_tier: 'small',
          tier: null,
          origin: 'analyst',
        })
      ).toEqual({ verdict: 'pending_review', reason: 'no_actor_tier' });
    });

    it('rejects quarantined actors regardless of door/blast', () => {
      for (const door of doors) {
        for (const blast of blasts) {
          expect(
            evaluateTrustGate({
              door_class: door,
              blast_tier: blast,
              tier: 'quarantined',
              origin: 'analyst',
            })
          ).toEqual({ verdict: 'rejected_trust', reason: 'actor_quarantined' });
        }
      }
    });

    it('routes one_way doors to pending_review for any non-quarantined tier', () => {
      for (const tier of tiers.filter((t) => t !== 'quarantined')) {
        for (const blast of blasts) {
          expect(
            evaluateTrustGate({
              door_class: 'one_way',
              blast_tier: blast,
              tier,
              origin: 'analyst',
            })
          ).toEqual({
            verdict: 'pending_review',
            reason: 'one_way_door_requires_human',
          });
        }
      }
    });

    it('routes critical blast to pending_review for any non-quarantined tier', () => {
      for (const tier of tiers.filter((t) => t !== 'quarantined')) {
        for (const origin of origins) {
          expect(
            evaluateTrustGate({
              door_class: 'two_way',
              blast_tier: 'critical',
              tier,
              origin,
            })
          ).toEqual({
            verdict: 'pending_review',
            reason: 'blast_tier_critical_requires_human',
          });
        }
      }
    });
  });

  describe('blast × tier cap (two_way door, non-frontier-origin)', () => {
    const cases: Array<[TrustTier, BlastTier, 'allow' | 'pending_review']> = [
      ['frontier', 'small', 'allow'],
      ['frontier', 'medium', 'allow'],
      ['frontier', 'large', 'allow'],
      ['trusted', 'small', 'allow'],
      ['trusted', 'medium', 'allow'],
      ['trusted', 'large', 'pending_review'],
      ['probationary', 'small', 'pending_review'],
      ['probationary', 'medium', 'pending_review'],
      ['probationary', 'large', 'pending_review'],
    ];

    it.each(cases)('tier=%s blast=%s → %s', (tier, blast, expected) => {
      const res = evaluateTrustGate({
        door_class: 'two_way',
        blast_tier: blast,
        tier,
        origin: 'triage',
      });
      expect(res.verdict).toBe(expected);
    });

    it('tier=trusted × blast=large uses the dedicated reason code', () => {
      const res = evaluateTrustGate({
        door_class: 'two_way',
        blast_tier: 'large',
        tier: 'trusted',
        origin: 'triage',
      });
      expect(res).toEqual({
        verdict: 'pending_review',
        reason: 'blast_tier_large_exceeds_actor_cap',
      });
    });
  });

  describe('frontier-origin restriction', () => {
    it('blocks exploit_to_detection on trusted tier even when cap allows', () => {
      const res = evaluateTrustGate({
        door_class: 'two_way',
        blast_tier: 'small',
        tier: 'trusted',
        origin: 'exploit_to_detection',
      });
      expect(res).toEqual({
        verdict: 'pending_review',
        reason: 'frontier_origin_requires_frontier_tier',
      });
    });

    it('blocks drift_detected on trusted tier even when cap allows', () => {
      const res = evaluateTrustGate({
        door_class: 'two_way',
        blast_tier: 'medium',
        tier: 'trusted',
        origin: 'drift_detected',
      });
      expect(res).toEqual({
        verdict: 'pending_review',
        reason: 'frontier_origin_requires_frontier_tier',
      });
    });

    it('allows exploit_to_detection on frontier tier', () => {
      const res = evaluateTrustGate({
        door_class: 'two_way',
        blast_tier: 'medium',
        tier: 'frontier',
        origin: 'exploit_to_detection',
      });
      expect(res.verdict).toBe('allow');
    });

    it('allows non-frontier origins on trusted tier when cap allows', () => {
      const res = evaluateTrustGate({
        door_class: 'two_way',
        blast_tier: 'medium',
        tier: 'trusted',
        origin: 'analyst',
      });
      expect(res.verdict).toBe('allow');
    });
  });

  describe('defaults', () => {
    it('defaults door_class=two_way when missing', () => {
      const res = evaluateTrustGate({
        blast_tier: 'small',
        tier: 'frontier',
        origin: 'analyst',
      });
      expect(res.verdict).toBe('allow');
    });

    it('defaults blast_tier=small when missing', () => {
      const res = evaluateTrustGate({
        door_class: 'two_way',
        tier: 'trusted',
        origin: 'analyst',
      });
      expect(res.verdict).toBe('allow');
    });

    it('defaults origin=analyst when missing (non-frontier restriction)', () => {
      const res = evaluateTrustGate({
        door_class: 'two_way',
        blast_tier: 'small',
        tier: 'trusted',
      });
      expect(res.verdict).toBe('allow');
    });
  });

  describe('exhaustive verdict determinism', () => {
    it('covers every (door × blast × tier × origin) combination with a stable verdict', () => {
      const seen = new Set<string>();
      for (const door of doors) {
        for (const blast of blasts) {
          for (const tier of tiers) {
            for (const origin of origins) {
              const res = evaluateTrustGate({
                door_class: door,
                blast_tier: blast,
                tier,
                origin,
              });
              // Re-run — must be deterministic.
              const res2 = evaluateTrustGate({
                door_class: door,
                blast_tier: blast,
                tier,
                origin,
              });
              expect(res).toEqual(res2);
              const key = `${door}|${blast}|${tier}|${origin}`;
              seen.add(key);
            }
          }
        }
      }
      // 2 × 4 × 4 × 5 = 160
      expect(seen.size).toBe(160);
    });
  });
});

describe('TRUST_GATE_MATRIX export', () => {
  it('exposes the cap matrix as a frozen object for inspection', () => {
    expect(Object.isFrozen(TRUST_GATE_MATRIX)).toBe(true);
    expect(TRUST_GATE_MATRIX.blastCapByTier.frontier.large).toBe('allow');
    expect(TRUST_GATE_MATRIX.blastCapByTier.trusted.large).toBe('pending_review');
    expect(TRUST_GATE_MATRIX.frontierOnlyOrigins).toContain('exploit_to_detection');
    expect(TRUST_GATE_MATRIX.frontierOnlyOrigins).toContain('drift_detected');
  });
});
