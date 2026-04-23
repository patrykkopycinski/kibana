/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildRecentProposals,
  buildSynthesisProposals,
  dominates,
  findDominator,
  type SynthesisRawAdvisoryDoc,
  type SynthesisRawRecommendationDoc,
} from './synthesis_proposals_builder';
import type { ArgusSynthesisPredicted } from '../types/synthesis_proposals';

const predicted = (overrides: Partial<ArgusSynthesisPredicted>): ArgusSynthesisPredicted => ({
  precision: 0.5,
  recall: 0.5,
  fp_rate: 0.1,
  axis_fn_mean: 0.5,
  ...overrides,
});

describe('dominates', () => {
  it('returns true when strictly better on one axis and at least equal on all others', () => {
    expect(
      dominates(
        predicted({ precision: 0.9, recall: 0.5, fp_rate: 0.1, axis_fn_mean: 0.5 }),
        predicted({ precision: 0.7, recall: 0.5, fp_rate: 0.1, axis_fn_mean: 0.5 })
      )
    ).toBe(true);
  });

  it('returns false when equal on all axes (no strict improvement)', () => {
    expect(dominates(predicted({}), predicted({}))).toBe(false);
  });

  it('returns false when worse on at least one axis', () => {
    expect(
      dominates(
        predicted({ precision: 0.9, fp_rate: 0.3 }),
        predicted({ precision: 0.7, fp_rate: 0.1 })
      )
    ).toBe(false);
  });

  it('treats lower fp_rate as better', () => {
    expect(
      dominates(
        predicted({ precision: 0.7, fp_rate: 0.05 }),
        predicted({ precision: 0.7, fp_rate: 0.2 })
      )
    ).toBe(true);
  });
});

describe('findDominator', () => {
  it('returns undefined when no frontier candidate dominates', () => {
    expect(
      findDominator(predicted({ precision: 0.9 }), [
        { candidate_id: 'f1', predicted: predicted({ precision: 0.5 }) },
      ])
    ).toBeUndefined();
  });

  it('returns the first dominating candidate and enumerates strictly-better axes only', () => {
    const result = findDominator(
      predicted({ precision: 0.6, recall: 0.5, fp_rate: 0.2, axis_fn_mean: 0.5 }),
      [
        {
          candidate_id: 'f1',
          predicted: predicted({ precision: 0.8, recall: 0.5, fp_rate: 0.1, axis_fn_mean: 0.5 }),
        },
      ]
    );
    expect(result?.candidate_id).toBe('f1');
    expect(result?.reasons.map((r) => r.axis).sort()).toEqual(['fp_rate', 'precision']);
    const precisionReason = result?.reasons.find((r) => r.axis === 'precision');
    expect(precisionReason?.candidate_value).toBe(0.6);
    expect(precisionReason?.dominator_value).toBe(0.8);
    expect(precisionReason?.direction).toBe('higher_is_better');
    const fpReason = result?.reasons.find((r) => r.axis === 'fp_rate');
    expect(fpReason?.direction).toBe('lower_is_better');
  });
});

describe('buildSynthesisProposals', () => {
  const ADVISORY: SynthesisRawAdvisoryDoc = {
    _id: 'adv-1',
    _source: {
      advisory_id: 'adv-1',
      cve_id: 'CVE-2026-0001',
      recommendation_id: 'rec-1',
      draft_rule_id: 'rule-1',
    },
  };

  const synthesisBlock = {
    chosen: {
      candidate_id: 'af1',
      composition: {
        must_anchor_subset: 'all' as const,
        wildcard_retention: 'full' as const,
        minimum_should_match: 1 as const,
      },
      predicted: { precision: 0.8, recall: 0.7, fp_rate: 0.05, axis_fn_mean: 0.7 },
    },
    frontier: [
      {
        candidate_id: 'af1',
        composition: {
          must_anchor_subset: 'all' as const,
          wildcard_retention: 'full' as const,
          minimum_should_match: 1 as const,
        },
        predicted: { precision: 0.8, recall: 0.7, fp_rate: 0.05, axis_fn_mean: 0.7 },
      },
      {
        candidate_id: 'pf2',
        composition: {
          must_anchor_subset: 'primary_only' as const,
          wildcard_retention: 'full' as const,
          minimum_should_match: 2 as const,
        },
        predicted: { precision: 0.65, recall: 0.85, fp_rate: 0.08, axis_fn_mean: 0.6 },
      },
    ],
    dominated: [
      {
        candidate_id: 'as2',
        composition: {
          must_anchor_subset: 'all' as const,
          wildcard_retention: 'strict' as const,
          minimum_should_match: 2 as const,
        },
        predicted: { precision: 0.6, recall: 0.6, fp_rate: 0.1, axis_fn_mean: 0.4 },
      },
    ],
    weights: { precision: 0.4, recall: 0.3, fp_rate: 0.2, axis_fn: 0.1 },
  };

  const RECOMMENDATION: SynthesisRawRecommendationDoc = {
    _id: 'rec-1',
    _source: {
      '@timestamp': '2026-04-17T00:00:00.000Z',
      rule_id: 'rule-1',
      argus: { synthesis: synthesisBlock },
    },
  };

  it('returns missing_reason=advisory_not_found when no advisory doc is provided', () => {
    const res = buildSynthesisProposals({ cveId: 'CVE-2026-0001' });
    expect(res.missing_reason).toBe('advisory_not_found');
    expect(res.proposals).toEqual([]);
  });

  it('returns missing_reason=recommendation_not_found when advisory resolves but rec is missing', () => {
    const res = buildSynthesisProposals({ cveId: 'CVE-2026-0001', advisoryDoc: ADVISORY });
    expect(res.missing_reason).toBe('recommendation_not_found');
    expect(res.recommendation_id).toBe('rec-1');
    expect(res.draft_rule_id).toBe('rule-1');
  });

  it('returns missing_reason=no_synthesis_metadata when rec lacks argus.synthesis', () => {
    const res = buildSynthesisProposals({
      cveId: 'CVE-2026-0001',
      advisoryDoc: ADVISORY,
      recommendationDoc: { _id: 'rec-1', _source: { rule_id: 'rule-1' } },
    });
    expect(res.missing_reason).toBe('no_synthesis_metadata');
  });

  it('emits chosen + frontier-siblings + dominated with dominance reasons', () => {
    const res = buildSynthesisProposals({
      cveId: 'CVE-2026-0001',
      advisoryDoc: ADVISORY,
      recommendationDoc: RECOMMENDATION,
    });
    expect(res.missing_reason).toBeUndefined();
    expect(res.advisory_id).toBe('adv-1');
    expect(res.recommendation_id).toBe('rec-1');
    expect(res.draft_rule_id).toBe('rule-1');
    expect(res.weights).toEqual({ precision: 0.4, recall: 0.3, fp_rate: 0.2, axis_fn: 0.1 });

    expect(res.proposals).toHaveLength(3);
    expect(res.proposals[0].tier).toBe('chosen');
    expect(res.proposals[0].candidate_id).toBe('af1');

    expect(res.proposals[1].tier).toBe('frontier');
    expect(res.proposals[1].candidate_id).toBe('pf2');
    expect(res.proposals[1].dominated_by).toBeUndefined();

    expect(res.proposals[2].tier).toBe('dominated');
    expect(res.proposals[2].candidate_id).toBe('as2');
    expect(res.proposals[2].dominated_by?.candidate_id).toBe('af1');
    expect(res.proposals[2].dominated_by?.reasons.map((r) => r.axis).sort()).toEqual([
      'axis_fn_mean',
      'fp_rate',
      'precision',
      'recall',
    ]);
  });

  it('filters the chosen candidate out of the frontier-sibling list to avoid duplication', () => {
    const res = buildSynthesisProposals({
      cveId: 'CVE-2026-0001',
      advisoryDoc: ADVISORY,
      recommendationDoc: RECOMMENDATION,
    });
    const frontierSiblings = res.proposals.filter((p) => p.tier === 'frontier');
    expect(frontierSiblings.map((p) => p.candidate_id)).toEqual(['pf2']);
  });

  it('clamps out-of-range predicted values to [0, 1]', () => {
    const res = buildSynthesisProposals({
      cveId: 'CVE-2026-0001',
      advisoryDoc: ADVISORY,
      recommendationDoc: {
        _id: 'rec-1',
        _source: {
          argus: {
            synthesis: {
              ...synthesisBlock,
              chosen: {
                candidate_id: 'af1',
                composition: synthesisBlock.chosen.composition,
                predicted: { precision: 1.3, recall: -0.2, fp_rate: 2, axis_fn_mean: NaN },
              },
              frontier: [],
              dominated: [],
            },
          },
        },
      },
    });
    expect(res.proposals[0].predicted).toEqual({
      precision: 1,
      recall: 0,
      fp_rate: 1,
      axis_fn_mean: 0,
    });
  });

  it('drops malformed weights rather than passing partial data', () => {
    const res = buildSynthesisProposals({
      cveId: 'CVE-2026-0001',
      advisoryDoc: ADVISORY,
      recommendationDoc: {
        _id: 'rec-1',
        _source: {
          argus: {
            synthesis: {
              ...synthesisBlock,
              weights: { precision: 0.4 },
            },
          },
        },
      },
    });
    expect(res.weights).toBeUndefined();
  });
});

describe('buildRecentProposals', () => {
  const ADV: SynthesisRawAdvisoryDoc = {
    _id: 'adv-1',
    _source: { advisory_id: 'adv-1', cve_id: 'CVE-2026-0001' },
  };

  const REC: SynthesisRawRecommendationDoc = {
    _id: 'rec-1',
    _source: {
      '@timestamp': '2026-04-17T00:00:00.000Z',
      argus: {
        synthesis: {
          chosen: {
            candidate_id: 'af1',
            predicted: { precision: 0.8, recall: 0.7, fp_rate: 0.05, axis_fn_mean: 0.7 },
          },
          frontier: [{ candidate_id: 'af1' }, { candidate_id: 'pf2' }],
          dominated: [{ candidate_id: 'as2' }, { candidate_id: 'ps1' }],
        },
      },
    },
  };

  it('emits one row per recommendation, joining advisory by id', () => {
    const res = buildRecentProposals({
      window: '24h',
      recommendations: [REC],
      advisoryByRecommendationId: new Map([['rec-1', ADV]]),
    });
    expect(res.window).toBe('24h');
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0];
    expect(row.cve_id).toBe('CVE-2026-0001');
    expect(row.chosen_candidate_id).toBe('af1');
    expect(row.frontier_size).toBe(2);
    expect(row.dominated_count).toBe(2);
    expect(row.predicted.precision).toBeCloseTo(0.8);
  });

  it('emits cve_id=unknown when advisory lookup misses', () => {
    const res = buildRecentProposals({ window: '7d', recommendations: [REC] });
    expect(res.rows[0].cve_id).toBe('unknown');
  });

  it('skips recommendations missing argus.synthesis', () => {
    const res = buildRecentProposals({
      window: '24h',
      recommendations: [{ _id: 'rec-x', _source: { '@timestamp': '2026-04-17T00:00:00Z' } }],
    });
    expect(res.rows).toHaveLength(0);
  });
});
