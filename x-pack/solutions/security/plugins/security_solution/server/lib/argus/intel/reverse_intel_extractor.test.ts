/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elastic B.V. and/or licensed to Elastic B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DEFAULT_REVERSE_INTEL_THRESHOLDS,
  extractReverseIntel,
  resolveReverseIntelThresholds,
} from './reverse_intel_extractor';
import type {
  ExtractReverseIntelInput,
  IncidentTtpRecord,
  OutcomeTtpRecord,
} from './reverse_intel_extractor';

const WINDOW = { from: '2026-04-29T00:00:00Z', to: '2026-05-05T00:00:00Z' };

const buildIncident = (overrides: Partial<IncidentTtpRecord> = {}): IncidentTtpRecord => ({
  incident_id: 'inc-1',
  closed_at: '2026-05-01T12:00:00Z',
  verdict: 'true_positive',
  techniques: ['T1059.001'],
  actor: 'apt-trash-panda',
  campaign: 'trash-bin-2026',
  ...overrides,
});

const buildOutcome = (overrides: Partial<OutcomeTtpRecord> = {}): OutcomeTtpRecord => ({
  outcome_id: 'oc-1',
  observed_at: '2026-05-02T08:00:00Z',
  verdict: 'true_positive',
  techniques_observed: ['T1059.001'],
  rule_id: 'rule-powershell-encoded',
  ...overrides,
});

const baseInput = (
  overrides: Partial<ExtractReverseIntelInput> = {}
): ExtractReverseIntelInput => ({
  incidents: [],
  outcomes: [],
  window: WINDOW,
  ...overrides,
});

describe('resolveReverseIntelThresholds', () => {
  it('returns defaults when no override provided', () => {
    expect(resolveReverseIntelThresholds()).toEqual(DEFAULT_REVERSE_INTEL_THRESHOLDS);
    expect(resolveReverseIntelThresholds(undefined)).toEqual(DEFAULT_REVERSE_INTEL_THRESHOLDS);
  });

  it('honours partial overrides', () => {
    const result = resolveReverseIntelThresholds({
      min_observations: 5,
      base_signal_strength: 0.6,
    });
    expect(result.min_observations).toBe(5);
    expect(result.base_signal_strength).toBe(0.6);
    expect(result.max_signal_strength).toBe(DEFAULT_REVERSE_INTEL_THRESHOLDS.max_signal_strength);
  });

  it('clamps values to [0, 1] for unit-bounded fields', () => {
    const result = resolveReverseIntelThresholds({
      base_signal_strength: 5,
      max_signal_strength: -2,
      per_extra_observation: 12,
      source_trust: -0.5,
    });
    expect(result.base_signal_strength).toBe(1);
    expect(result.per_extra_observation).toBe(1);
    expect(result.source_trust).toBe(0);
    // max should never fall below base
    expect(result.max_signal_strength).toBe(1);
  });

  it('floors min_observations to a minimum of 1', () => {
    expect(resolveReverseIntelThresholds({ min_observations: 0 }).min_observations).toBe(1);
    expect(resolveReverseIntelThresholds({ min_observations: -3 }).min_observations).toBe(1);
  });

  it('floors fractional integer thresholds and ignores non-finite numbers', () => {
    const result = resolveReverseIntelThresholds({
      min_observations: 4.9,
      half_life_days: NaN,
    });
    expect(result.min_observations).toBe(4);
    expect(result.half_life_days).toBe(DEFAULT_REVERSE_INTEL_THRESHOLDS.half_life_days);
  });

  it('keeps defaults when override values are non-finite', () => {
    const result = resolveReverseIntelThresholds({
      base_signal_strength: Number.POSITIVE_INFINITY,
      per_extra_observation: Number.NaN,
    });
    expect(result.base_signal_strength).toBe(DEFAULT_REVERSE_INTEL_THRESHOLDS.base_signal_strength);
    expect(result.per_extra_observation).toBe(
      DEFAULT_REVERSE_INTEL_THRESHOLDS.per_extra_observation
    );
  });

  it('promotes max_signal_strength to base when override would invert them', () => {
    const result = resolveReverseIntelThresholds({
      base_signal_strength: 0.7,
      max_signal_strength: 0.3,
    });
    expect(result.base_signal_strength).toBe(0.7);
    expect(result.max_signal_strength).toBe(0.7);
  });
});

describe('extractReverseIntel', () => {
  it('returns no emissions when no observations meet the threshold', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [buildIncident()],
        outcomes: [],
      })
    );
    expect(result.emissions).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      technique_id: 'T1059.001',
      reason: expect.stringMatching(/below min_observations=2/),
    });
    expect(result.thresholds_applied).toEqual(DEFAULT_REVERSE_INTEL_THRESHOLDS);
  });

  it('emits a single signal when two confirmed observations cross min_observations', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [
          buildIncident({ incident_id: 'inc-a' }),
          buildIncident({ incident_id: 'inc-b', closed_at: '2026-05-03T12:00:00Z' }),
        ],
      })
    );
    expect(result.emissions).toHaveLength(1);
    const [emission] = result.emissions;
    expect(emission.adapter).toBe('soc-incident-reverse-intel');
    expect(emission.feed_id).toBe('soc.incident.observed');
    expect(emission.kind).toBe('ttp_observed');
    expect(emission.reference.technique_ids).toEqual(['T1059.001']);
    expect(emission.signal_strength).toBeCloseTo(0.5, 5);
    expect(emission.evidence.true_positive_count).toBe(2);
    expect(emission.evidence.false_positive_count).toBe(0);
    expect(emission.evidence.distinct_incident_ids).toEqual(['inc-a', 'inc-b']);
    expect(emission.observed_at).toBe('2026-05-03T12:00:00Z');
  });

  it('aggregates incidents and outcomes into one emission per technique', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [
          buildIncident({ incident_id: 'inc-a' }),
          buildIncident({ incident_id: 'inc-b', closed_at: '2026-05-03T12:00:00Z' }),
        ],
        outcomes: [
          buildOutcome({ outcome_id: 'oc-1' }),
          buildOutcome({ outcome_id: 'oc-2', observed_at: '2026-05-04T08:00:00Z' }),
        ],
      })
    );
    expect(result.emissions).toHaveLength(1);
    const emission = result.emissions[0];
    expect(emission.evidence.true_positive_count).toBe(4);
    expect(emission.signal_strength).toBeCloseTo(0.7, 5);
    expect(emission.evidence.distinct_rule_ids).toEqual(['rule-powershell-encoded']);
    expect(emission.evidence.distinct_actors).toEqual(['apt-trash-panda']);
    expect(emission.observed_at).toBe('2026-05-04T08:00:00Z');
  });

  it('caps signal_strength at max_signal_strength', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: Array.from({ length: 20 }, (_, idx) =>
          buildIncident({
            incident_id: `inc-${idx}`,
            closed_at: `2026-05-${String((idx % 5) + 1).padStart(2, '0')}T00:00:00Z`,
          })
        ),
      })
    );
    expect(result.emissions[0].signal_strength).toBeCloseTo(
      DEFAULT_REVERSE_INTEL_THRESHOLDS.max_signal_strength,
      5
    );
  });

  it('counts false positives in evidence but does not reach threshold without true positives', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [
          buildIncident({ verdict: 'false_positive', incident_id: 'inc-fp1' }),
          buildIncident({ verdict: 'false_positive', incident_id: 'inc-fp2' }),
        ],
      })
    );
    expect(result.emissions).toHaveLength(0);
    expect(result.skipped[0].observations).toBe(2);
  });

  it('separates true_positive and false_positive counts in the same technique', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [
          buildIncident({ incident_id: 'inc-tp1' }),
          buildIncident({ incident_id: 'inc-tp2' }),
          buildIncident({ verdict: 'false_positive', incident_id: 'inc-fp' }),
        ],
      })
    );
    expect(result.emissions).toHaveLength(1);
    expect(result.emissions[0].evidence.true_positive_count).toBe(2);
    expect(result.emissions[0].evidence.false_positive_count).toBe(1);
    expect(result.emissions[0].evidence.observation_count).toBe(3);
  });

  it('respects explicit false_positive flag on outcomes regardless of verdict text', () => {
    const result = extractReverseIntel(
      baseInput({
        outcomes: [
          buildOutcome({ outcome_id: 'oc-tp1' }),
          buildOutcome({ outcome_id: 'oc-tp2' }),
          buildOutcome({
            outcome_id: 'oc-fp',
            verdict: 'true_positive',
            false_positive: true,
          }),
        ],
      })
    );
    expect(result.emissions).toHaveLength(1);
    expect(result.emissions[0].evidence.true_positive_count).toBe(2);
    expect(result.emissions[0].evidence.false_positive_count).toBe(1);
  });

  it('ignores incidents and outcomes with verdicts outside the recognised vocabulary', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [
          buildIncident({ verdict: 'inconclusive', incident_id: 'inc-x' }),
          buildIncident({ verdict: 'pending_review', incident_id: 'inc-y' }),
        ],
        outcomes: [buildOutcome({ verdict: 'investigating' })],
      })
    );
    expect(result.emissions).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('skips empty / whitespace technique IDs', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [
          buildIncident({ techniques: ['', '   ', 'T1003'] }),
          buildIncident({ incident_id: 'inc-2', techniques: ['T1003'] }),
        ],
      })
    );
    expect(result.emissions).toHaveLength(1);
    expect(result.emissions[0].reference.technique_ids).toEqual(['T1003']);
  });

  it('produces deterministic technique ordering by sorting techniqueIds', () => {
    const incidents = Array.from({ length: 4 }, (_, idx) =>
      buildIncident({
        incident_id: `inc-${idx}`,
        techniques: ['T1003', 'T1059.001', 'T1086'],
      })
    );
    const result = extractReverseIntel(baseInput({ incidents }));
    expect(result.emissions.map((e) => e.reference.technique_ids[0])).toEqual([
      'T1003',
      'T1059.001',
      'T1086',
    ]);
  });

  it('aggregates distinct actors and campaigns across incidents', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [
          buildIncident({ incident_id: 'inc-a', actor: 'apt-1', campaign: 'op-alpha' }),
          buildIncident({ incident_id: 'inc-b', actor: 'apt-2', campaign: 'op-beta' }),
          buildIncident({ incident_id: 'inc-c', actor: 'apt-1', campaign: 'op-alpha' }),
        ],
      })
    );
    expect(result.emissions).toHaveLength(1);
    const emission = result.emissions[0];
    expect(emission.reference.actor_ids).toEqual(['apt-1', 'apt-2']);
    expect(emission.evidence.distinct_actors).toEqual(['apt-1', 'apt-2']);
    expect(emission.evidence.distinct_campaigns).toEqual(['op-alpha', 'op-beta']);
    expect(emission.evidence.distinct_incident_ids).toEqual(['inc-a', 'inc-b', 'inc-c']);
  });

  it('uses the latest observed timestamp from any source', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [
          buildIncident({ incident_id: 'inc-a', closed_at: '2026-05-01T00:00:00Z' }),
          buildIncident({ incident_id: 'inc-b', closed_at: '2026-05-02T00:00:00Z' }),
        ],
        outcomes: [
          buildOutcome({ outcome_id: 'oc-1', observed_at: '2026-05-03T15:30:00Z' }),
          buildOutcome({ outcome_id: 'oc-2', observed_at: '2026-05-02T11:00:00Z' }),
        ],
      })
    );
    expect(result.emissions[0].observed_at).toBe('2026-05-03T15:30:00Z');
  });

  it('falls back to the window upper bound when no observation timestamp is present', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [
          buildIncident({ incident_id: 'inc-a', closed_at: '' }),
          buildIncident({ incident_id: 'inc-b', closed_at: 'not-a-date' }),
        ],
      })
    );
    expect(result.emissions[0].observed_at).toBe(WINDOW.to);
  });

  it('writes intel_id including technique and observed_at — stable per technique', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [
          buildIncident({ incident_id: 'inc-a', closed_at: '2026-05-04T11:11:11Z' }),
          buildIncident({ incident_id: 'inc-b', closed_at: '2026-05-04T11:11:11Z' }),
        ],
      })
    );
    expect(result.emissions[0].intel_id).toBe('incident-rev-T1059.001-2026-05-04T11:11:11Z');
  });

  it('honours threshold overrides from the input', () => {
    const result = extractReverseIntel(
      baseInput({
        thresholds: { min_observations: 4, base_signal_strength: 0.2 },
        outcomes: [
          buildOutcome({ outcome_id: 'oc-1' }),
          buildOutcome({ outcome_id: 'oc-2' }),
          buildOutcome({ outcome_id: 'oc-3' }),
          buildOutcome({ outcome_id: 'oc-4' }),
        ],
      })
    );
    expect(result.emissions).toHaveLength(1);
    expect(result.emissions[0].signal_strength).toBeCloseTo(0.5, 5);
    expect(result.thresholds_applied.min_observations).toBe(4);
    expect(result.thresholds_applied.base_signal_strength).toBe(0.2);
  });

  it('treats malformed inputs defensively without throwing', () => {
    const result = extractReverseIntel(
      baseInput({
        incidents: [
          buildIncident({ techniques: undefined as unknown as string[] }),
          { ...buildIncident(), techniques: null as unknown as readonly string[] },
        ],
        outcomes: [buildOutcome({ techniques_observed: undefined as unknown as string[] })],
      })
    );
    expect(result.emissions).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('produces deterministic output for the same input', () => {
    const input = baseInput({
      incidents: [
        buildIncident({ incident_id: 'inc-a' }),
        buildIncident({ incident_id: 'inc-b' }),
        buildIncident({
          incident_id: 'inc-c',
          techniques: ['T1003'],
          closed_at: '2026-05-04T00:00:00Z',
        }),
      ],
      outcomes: [buildOutcome({ outcome_id: 'oc-1', techniques_observed: ['T1003'] })],
    });
    const a = extractReverseIntel(input);
    const b = extractReverseIntel(input);
    expect(a).toEqual(b);
  });
});
