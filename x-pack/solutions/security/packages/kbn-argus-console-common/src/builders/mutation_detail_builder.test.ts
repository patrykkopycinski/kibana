/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildMutationDetail } from './mutation_detail_builder';
import type {
  DetailRawAdvisoryDoc,
  DetailRawBacktestDoc,
  DetailRawMutationIntentDoc,
  DetailRawOutcomeDoc,
} from './mutation_detail_builder';
import type { ArgusSynthesisResponse } from '../types/synthesis_proposals';

const baseIntent: DetailRawMutationIntentDoc = {
  '@timestamp': '2026-04-20T18:00:00.000Z',
  mutation_intent_id: 'mi:adv-1',
  rule_id: 'rule-alpha',
  advisory_id: 'adv-1',
  recommendation_id: 'rec-1',
  title: 'Mutation for adv-1',
  label: 'tune · T1059.001',
  actor_id: 'argus-silver-agent',
  actor_trust_tier: 'silver',
  governance_gate: { status: 'approved', reason: 'MTTR rollback guarantees met' },
  source_signal: {
    type: 'drift_detected',
    description: 'Precision dropped 0.15',
    evidence_count: 48,
    first_seen: '2026-04-20T17:55:00.000Z',
  },
  proposed_rule_delta: {
    change_type: 'tune',
    mitre_technique: 'T1059.001',
    severity_before: 'medium',
    severity_after: 'high',
    threshold_before: 2,
    threshold_after: 1,
    query_before: 'process.name:powershell.exe and process.args:*-EncodedCommand*',
    query_after:
      'process.name:powershell.exe and (process.args:*-EncodedCommand* or process.args:*-enc*)',
    rationale: 'Widen arg pattern and drop threshold to 1.',
  },
  backtest_preview: {
    tp: 31,
    fp: 7,
    windows: 7,
    precision: 0.815,
    fp_rate: 0.184,
    gate_decision: 'pass',
  },
  argus: {
    actor: { trust_tier: 'silver', confidence_score: 0.71, recent_mutations: 3 },
  },
};

describe('buildMutationDetail', () => {
  it('returns not_found when neither intent nor outcome is present', () => {
    const res = buildMutationDetail({ mutationIntentId: 'mi:missing' });
    expect(res).toEqual({ reason_code: 'not_found', detail: null });
  });

  it('returns applied verdict when the outcome is not rolled back', () => {
    const outcome: DetailRawOutcomeDoc = {
      '@timestamp': '2026-04-20T18:01:00.000Z',
      mutation_intent_id: 'mi:adv-1',
      rule_id: 'rule-alpha',
      applied_at: '2026-04-20T18:00:30.000Z',
      rolled_back: false,
      label: 'Canary promoted',
    };

    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
      outcome,
    });

    expect(res.reason_code).toBe('ok');
    expect(res.detail?.verdict).toBe('applied');
    expect(res.detail?.outcome?.applied_at).toBe('2026-04-20T18:00:30.000Z');
    expect(res.detail?.outcome?.rolled_back).toBe(false);
  });

  it('returns rolled_back verdict and surfaces rollback_reason from the outcome', () => {
    const outcome: DetailRawOutcomeDoc = {
      '@timestamp': '2026-04-20T18:10:00.000Z',
      mutation_intent_id: 'mi:adv-1',
      rule_id: 'rule-alpha',
      applied_at: '2026-04-20T18:00:30.000Z',
      rolled_back: true,
      rolled_back_at: '2026-04-20T18:10:00.000Z',
      rollback_mttr_ms: 570_000,
      rollback_reason: 'FP spike on noisy-admin-shell dashboard exceeded 2σ baseline',
      label: 'Slow rollback',
    };

    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
      outcome,
    });

    expect(res.detail?.verdict).toBe('rolled_back');
    expect(res.detail?.outcome?.rolled_back).toBe(true);
    expect(res.detail?.outcome?.rollback_reason).toBe(
      'FP spike on noisy-admin-shell dashboard exceeded 2σ baseline'
    );
    expect(res.detail?.outcome?.rollback_mttr_ms).toBe(570_000);
  });

  it('falls back to outcome.subtitle when rollback_reason is missing', () => {
    const outcome: DetailRawOutcomeDoc = {
      mutation_intent_id: 'mi:adv-1',
      rule_id: 'rule-alpha',
      applied_at: '2026-04-20T18:00:30.000Z',
      rolled_back: true,
      subtitle: 'investigation+rollback took 309s',
    };

    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
      outcome,
    });

    expect(res.detail?.outcome?.rollback_reason).toBe('investigation+rollback took 309s');
  });

  it('returns blocked verdict with gate reason + policy_id + thresholds when no outcome exists', () => {
    const blockedIntent: DetailRawMutationIntentDoc = {
      ...baseIntent,
      governance_gate: {
        status: 'blocked',
        reason: 'Proposing actor trust tier (bronze) below required floor (silver)',
        policy_id: 'argus-governance:tier-floor@v3',
        thresholds: {
          min_trust_tier: 'silver',
          min_variant_coverage: 0.8,
          max_fp_rate: 0.05,
        },
      },
      source_signal: {
        type: 'threat_intel_match',
        description: 'DGA domain beacon matching adversary-dns-c2 TTP',
        evidence_count: 7,
      },
    };

    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: blockedIntent,
    });

    expect(res.detail?.verdict).toBe('blocked');
    expect(res.detail?.gate).toEqual({
      status: 'blocked',
      reason: 'Proposing actor trust tier (bronze) below required floor (silver)',
      policy_id: 'argus-governance:tier-floor@v3',
      thresholds: {
        min_trust_tier: 'silver',
        min_variant_coverage: 0.8,
        max_fp_rate: 0.05,
      },
    });
    expect(res.detail?.outcome).toBeNull();
  });

  it('normalises whitespace-only reasons and types to null', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: {
        ...baseIntent,
        governance_gate: { status: 'blocked', reason: '   ', policy_id: '' },
        source_signal: { type: '   ', description: '' },
      },
    });

    expect(res.detail?.gate.reason).toBeNull();
    expect(res.detail?.gate.policy_id).toBeNull();
    expect(res.detail?.source_signal).toBeNull();
  });

  it('populates rule delta from intent.proposed_rule_delta', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
    });

    expect(res.detail?.proposed_rule_delta).toEqual({
      change_type: 'tune',
      mitre_technique: 'T1059.001',
      severity_before: 'medium',
      severity_after: 'high',
      threshold_before: 2,
      threshold_after: 1,
      query_before: 'process.name:powershell.exe and process.args:*-EncodedCommand*',
      query_after:
        'process.name:powershell.exe and (process.args:*-EncodedCommand* or process.args:*-enc*)',
      rationale: 'Widen arg pattern and drop threshold to 1.',
    });
  });

  it('drops an entirely empty rule delta rather than rendering a blank block', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: {
        ...baseIntent,
        proposed_rule_delta: {
          change_type: 'unknown',
          severity_before: null,
          severity_after: null,
          threshold_before: null,
          threshold_after: null,
          query_before: null,
          query_after: null,
          rationale: null,
          mitre_technique: null,
        },
      },
    });

    expect(res.detail?.proposed_rule_delta).toBeNull();
  });

  it('rejects unknown change_type values while keeping the rest of the delta', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: {
        ...baseIntent,
        proposed_rule_delta: {
          ...baseIntent.proposed_rule_delta,
          change_type: 'not-a-real-kind',
        },
      },
    });

    expect(res.detail?.proposed_rule_delta?.change_type).toBeNull();
    expect(res.detail?.proposed_rule_delta?.mitre_technique).toBe('T1059.001');
  });

  it('prefers the authoritative backtest doc over the intent preview', () => {
    const backtest: DetailRawBacktestDoc = {
      '@timestamp': '2026-04-20T17:50:00.000Z',
      rule_id: 'rule-alpha',
      mutation_intent_id: 'mi:adv-1',
      windows_tested: 14,
      true_positives: 42,
      false_positives: 3,
      precision: 0.933,
      fp_rate: 0.066,
      gate_decision: 'pass',
    };

    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
      backtest,
    });

    expect(res.detail?.backtest).toEqual({
      tp: 42,
      fp: 3,
      windows: 14,
      precision: 0.933,
      fp_rate: 0.066,
      gate_decision: 'pass',
      query:
        'process.name:powershell.exe and (process.args:*-EncodedCommand* or process.args:*-enc*)',
      window_start: null,
      window_end: null,
      fp_samples: [],
      tp_samples: [],
    });
  });

  it('falls back to intent.backtest_preview when no backtest doc exists', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
    });

    expect(res.detail?.backtest).toEqual({
      tp: 31,
      fp: 7,
      windows: 7,
      precision: 0.815,
      fp_rate: 0.184,
      gate_decision: 'pass',
      query:
        'process.name:powershell.exe and (process.args:*-EncodedCommand* or process.args:*-enc*)',
      window_start: null,
      window_end: null,
      fp_samples: [],
      tp_samples: [],
    });
  });

  it('surfaces backtest query text, window, and sample events when the backtest doc carries them', () => {
    const backtest: DetailRawBacktestDoc = {
      '@timestamp': '2026-04-20T17:50:00.000Z',
      rule_id: 'rule-alpha',
      mutation_intent_id: 'mi:adv-1',
      windows_tested: 12,
      true_positives: 9,
      false_positives: 4,
      precision: 0.69,
      fp_rate: 0.31,
      gate_decision: 'fail',
      query: 'process.name:powershell.exe and process.args:*-enc*',
      window_start: '2026-04-13T18:00:00.000Z',
      window_end: '2026-04-20T18:00:00.000Z',
      fp_samples: [
        {
          event_id: 'evt-fp-1',
          '@timestamp': '2026-04-19T21:03:12.000Z',
          host_name: 'noisy-admin-shell-01',
          user_name: 'svc-it-automation',
          process_executable: 'C\\:\\\\Windows\\\\System32\\\\powershell.exe',
          command_line: 'powershell.exe -enc BASE64AUTOMATION==',
          reason: 'Known-good IT automation job, matches scheduled task RULE-IT-07',
        },
      ],
      tp_samples: [
        {
          event_id: 'evt-tp-1',
          timestamp: '2026-04-20T02:17:44.000Z',
          host_name: 'dmz-web-03',
          user_name: 'www-data',
          process_executable: 'powershell.exe',
          command_line: 'powershell.exe -enc ZQB4AHAAbABvAGkAdAA=',
          classification: 'tp',
          reason: 'Matched adversary playbook pivot from web-shell',
        },
      ],
    };

    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
      backtest,
    });

    expect(res.detail?.backtest?.query).toBe(
      'process.name:powershell.exe and process.args:*-enc*'
    );
    expect(res.detail?.backtest?.window_start).toBe('2026-04-13T18:00:00.000Z');
    expect(res.detail?.backtest?.window_end).toBe('2026-04-20T18:00:00.000Z');
    expect(res.detail?.backtest?.fp_samples).toEqual([
      {
        event_id: 'evt-fp-1',
        timestamp: '2026-04-19T21:03:12.000Z',
        host_name: 'noisy-admin-shell-01',
        user_name: 'svc-it-automation',
        process_executable: 'C\\:\\\\Windows\\\\System32\\\\powershell.exe',
        command_line: 'powershell.exe -enc BASE64AUTOMATION==',
        classification: 'fp',
        reason: 'Known-good IT automation job, matches scheduled task RULE-IT-07',
      },
    ]);
    expect(res.detail?.backtest?.tp_samples).toEqual([
      {
        event_id: 'evt-tp-1',
        timestamp: '2026-04-20T02:17:44.000Z',
        host_name: 'dmz-web-03',
        user_name: 'www-data',
        process_executable: 'powershell.exe',
        command_line: 'powershell.exe -enc ZQB4AHAAbABvAGkAdAA=',
        classification: 'tp',
        reason: 'Matched adversary playbook pivot from web-shell',
      },
    ]);
  });

  it('drops sample rows without an event_id (synth data safety)', () => {
    const backtest: DetailRawBacktestDoc = {
      '@timestamp': '2026-04-20T17:50:00.000Z',
      mutation_intent_id: 'mi:adv-1',
      windows_tested: 1,
      true_positives: 0,
      false_positives: 1,
      precision: 0,
      fp_rate: 1,
      gate_decision: 'fail',
      fp_samples: [
        { event_id: null, host_name: 'orphan-host', reason: 'missing id' },
        { event_id: '  ', host_name: 'whitespace-id' },
        { event_id: 'evt-keep', host_name: 'keeper' },
      ],
    };

    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
      backtest,
    });

    expect(res.detail?.backtest?.fp_samples).toEqual([
      {
        event_id: 'evt-keep',
        timestamp: null,
        host_name: 'keeper',
        user_name: null,
        process_executable: null,
        command_line: null,
        classification: 'fp',
        reason: null,
      },
    ]);
  });

  it('attaches the injected post_apply_observation to the outcome', () => {
    const outcome: DetailRawOutcomeDoc = {
      '@timestamp': '2026-04-20T18:10:00.000Z',
      mutation_intent_id: 'mi:adv-1',
      rule_id: 'rule-alpha',
      applied_at: '2026-04-20T18:00:30.000Z',
      rolled_back: true,
      rolled_back_at: '2026-04-20T18:10:00.000Z',
      rollback_reason: 'FP spike detected at 60m mark',
    };

    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
      outcome,
      postApplyObservation: {
        window_start: '2026-04-20T18:00:30.000Z',
        window_end: '2026-04-20T18:10:00.000Z',
        alerts_total: 12,
        alerts_classified_fp: 11,
        alerts_classified_tp: 1,
        sample_events: [],
        alerts_deep_link_url: '/app/security/alerts?query=rule-alpha',
      },
    });

    expect(res.detail?.outcome?.post_apply_observation).toEqual({
      window_start: '2026-04-20T18:00:30.000Z',
      window_end: '2026-04-20T18:10:00.000Z',
      alerts_total: 12,
      alerts_classified_fp: 11,
      alerts_classified_tp: 1,
      sample_events: [],
      alerts_deep_link_url: '/app/security/alerts?query=rule-alpha',
    });
  });

  it('leaves post_apply_observation null when not injected (applied/blocked rows)', () => {
    const outcome: DetailRawOutcomeDoc = {
      '@timestamp': '2026-04-20T18:01:00.000Z',
      mutation_intent_id: 'mi:adv-1',
      rule_id: 'rule-alpha',
      applied_at: '2026-04-20T18:00:30.000Z',
      rolled_back: false,
      label: 'Canary promoted',
    };

    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
      outcome,
    });

    expect(res.detail?.outcome?.post_apply_observation).toBeNull();
  });

  it('computes precision and fp_rate from counts when the preview only carries totals', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: {
        ...baseIntent,
        backtest_preview: {
          tp: 9,
          fp: 1,
          windows: 3,
          precision: null,
          fp_rate: null,
          gate_decision: 'pass',
        },
      },
    });

    expect(res.detail?.backtest?.precision).toBeCloseTo(0.9);
    expect(res.detail?.backtest?.fp_rate).toBeCloseTo(0.1);
  });

  it('returns a null backtest when both the doc and the preview are empty', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: { ...baseIntent, backtest_preview: undefined },
    });

    expect(res.detail?.backtest).toBeNull();
  });

  it('builds actor detail from top-level and nested argus fields', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
    });

    expect(res.detail?.actor).toEqual({
      id: 'argus-silver-agent',
      trust_tier: 'silver',
      confidence_score: 0.71,
      recent_mutations: 3,
    });
  });

  it('surfaces advisory context when an advisory doc is joined', () => {
    const advisory: DetailRawAdvisoryDoc = {
      _id: 'adv-1',
      advisory_id: 'adv-1',
      cve_id: 'CVE-2026-0001',
      title: 'LSASS credential dumping variant',
      cvss_score: 8.1,
      published_at: '2026-04-15T00:00:00.000Z',
    };

    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
      advisory,
    });

    expect(res.detail?.advisory).toEqual({
      advisory_id: 'adv-1',
      cve_id: 'CVE-2026-0001',
      title: 'LSASS credential dumping variant',
      cvss: 8.1,
      published_at: '2026-04-15T00:00:00.000Z',
    });
  });

  it('returns a null advisory when no meaningful fields are populated', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
      advisory: { published_at: '2026-04-15T00:00:00.000Z' },
    });

    expect(res.detail?.advisory).toBeNull();
  });

  it('passes the pre-built synthesis response through unchanged', () => {
    const synthesis: ArgusSynthesisResponse = {
      cve_id: 'CVE-2026-0001',
      advisory_id: 'adv-1',
      proposals: [],
      missing_reason: 'no_synthesis_metadata',
    };

    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
      synthesis,
    });

    expect(res.detail?.synthesis).toBe(synthesis);
  });

  it('includes full audit identifiers in the response', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
    });

    expect(res.detail?.audit).toEqual({
      mutation_intent_id: 'mi:adv-1',
      rule_id: 'rule-alpha',
      advisory_id: 'adv-1',
      recommendation_id: 'rec-1',
    });
  });

  it('returns null pattern_seed and coverage_delta for pre-Tier-2 intents', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: baseIntent,
    });

    expect(res.detail?.pattern_seed).toBeNull();
    expect(res.detail?.coverage_delta).toBeNull();
  });

  it('surfaces pattern_seed (pattern_id + procedure_clusters) when Tier 2 fields are present', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: {
        ...baseIntent,
        argus: {
          ...baseIntent.argus,
          pattern_id: 'pat:T1059.001:abcdef',
          procedure_clusters: ['lolbin:powershell', 'encoded-args'],
        },
      },
    });

    expect(res.detail?.pattern_seed).toEqual({
      pattern_id: 'pat:T1059.001:abcdef',
      procedure_clusters: ['lolbin:powershell', 'encoded-args'],
    });
  });

  it('preserves explicit null pattern_id when clusters are present (synthesizer ran, no pattern matched)', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: {
        ...baseIntent,
        argus: {
          ...baseIntent.argus,
          pattern_id: null,
          procedure_clusters: ['registry-autorun'],
        },
      },
    });

    expect(res.detail?.pattern_seed).toEqual({
      pattern_id: null,
      procedure_clusters: ['registry-autorun'],
    });
  });

  it('builds coverage_delta from argus.coverage_delta when snapshot_ts is present', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: {
        ...baseIntent,
        argus: {
          ...baseIntent.argus,
          coverage_delta: {
            newly_covered_techniques: ['T1059.001'],
            newly_covered_procedures: ['lolbin:powershell'],
            now_redundant_rule_ids: ['rule-legacy-1', 'rule-legacy-2'],
            snapshot_ts: '2026-04-20T17:00:00.000Z',
          },
        },
      },
    });

    expect(res.detail?.coverage_delta).toEqual({
      newly_covered_techniques: ['T1059.001'],
      newly_covered_procedures: ['lolbin:powershell'],
      now_redundant_rule_ids: ['rule-legacy-1', 'rule-legacy-2'],
      snapshot_ts: '2026-04-20T17:00:00.000Z',
    });
  });

  it('drops coverage_delta without a snapshot_ts (can not score against a snapshot)', () => {
    const res = buildMutationDetail({
      mutationIntentId: 'mi:adv-1',
      intent: {
        ...baseIntent,
        argus: {
          ...baseIntent.argus,
          coverage_delta: {
            newly_covered_techniques: ['T1059.001'],
            newly_covered_procedures: [],
            now_redundant_rule_ids: [],
            snapshot_ts: '',
          },
        },
      },
    });

    expect(res.detail?.coverage_delta).toBeNull();
  });
});
