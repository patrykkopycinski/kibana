/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildE2dFlow,
  type BuildE2dFlowArgs,
  type E2dRawAdvisoryDoc,
  type E2dRawBacktestDoc,
  type E2dRawEvalRunDoc,
  type E2dRawMutationIntentDoc,
  type E2dRawOutcomeDoc,
  type E2dRawRecommendationDoc,
} from './e2d_flow_builder';
import type {
  ArgusE2dAppliedStage,
  ArgusE2dEvaluatedStage,
  ArgusE2dExploitProbabilityStage,
  ArgusE2dGovernanceStage,
  ArgusE2dIngestedStage,
  ArgusE2dRunningStage,
  ArgusE2dStage,
  ArgusE2dStageKind,
} from '../types/e2d_flow';

const ADVISORY: E2dRawAdvisoryDoc = {
  _id: 'adv-1',
  _index: '.soc-cve-advisories',
  _source: {
    '@timestamp': '2026-04-17T10:00:00.000Z',
    advisory_id: 'adv-1',
    cve_id: 'CVE-2026-1234',
    title: 'Acme RCE',
    severity: 'critical',
    status: 'detected',
    source: 'cisa-kev',
    corpus_id: 'corpus-1',
    recommendation_id: 'rec-1',
    draft_rule_id: 'rule-acme',
    kev: { date_added: '2026-04-17T00:00:00.000Z' },
    mitre_techniques: [{ technique_id: 'T1190', technique_name: 'Exploit Public-Facing App' }],
  },
};

const RECOMMENDATION: E2dRawRecommendationDoc = {
  _id: 'rec-1',
  _index: '.soc-recommendations',
  _source: {
    '@timestamp': '2026-04-17T10:05:00.000Z',
    rec_id: 'rec-1',
    status: 'auto_apply_ready',
    confidence: 92,
    argus: { decision: { confidence: 0.92 } },
  },
};

const MUTATION_INTENT: E2dRawMutationIntentDoc = {
  _id: 'mi-1',
  _index: '.soc-mutation-intents',
  _source: {
    '@timestamp': '2026-04-17T10:07:00.000Z',
    mutation_intent_id: 'mi-1',
    rule_id: 'rule-acme',
    status: 'applied',
    governance_gate: { status: 'approved' },
    argus: { actor: { trust_tier: 'scoped' } },
  },
};

const EVAL_RUN: E2dRawEvalRunDoc = {
  _id: 'eval-1',
  _index: '.soc-argus-eval-runs',
  _source: {
    '@timestamp': '2026-04-17T10:08:00.000Z',
    rule_id: 'rule-acme',
    scores: {
      precision: 0.95,
      recall: 0.8,
      fp_rate_baseline: 0.02,
      variant_coverage: 0.9,
    },
    gate_decision: 'pass',
    gate_reason: 'precision and recall exceed threshold',
  },
};

const BACKTEST: E2dRawBacktestDoc = {
  _id: 'bt-1',
  _index: '.soc-backtests',
  _source: {
    '@timestamp': '2026-04-17T10:09:00.000Z',
    windows_tested: 7,
    true_positives: 42,
    false_positives: 3,
    gate_decision: 'pass',
  },
};

const OUTCOME_APPLIED: E2dRawOutcomeDoc = {
  _id: 'out-1',
  _index: '.soc-outcomes',
  _source: {
    '@timestamp': '2026-04-17T10:10:00.000Z',
    rule_id: 'rule-acme',
    mutation_intent_id: 'mi-1',
    rolled_back: false,
    applied_at: '2026-04-17T10:10:00.000Z',
    label: 'Canary promoted',
  },
};

const baseArgs = (): BuildE2dFlowArgs => ({
  cveQuery: 'CVE-2026-1234',
  window: '24h',
  advisory: ADVISORY,
  mutationIntent: MUTATION_INTENT,
  recommendation: RECOMMENDATION,
  evalRun: EVAL_RUN,
  backtest: BACKTEST,
  outcome: OUTCOME_APPLIED,
  liveHitCount: 17,
});

const stageOfKind = <K extends ArgusE2dStageKind>(
  stages: readonly ArgusE2dStage[],
  kind: K
): Extract<ArgusE2dStage, { kind: K }> =>
  stages.find((s): s is Extract<ArgusE2dStage, { kind: K }> => s.kind === kind)!;

describe('buildE2dFlow', () => {
  it('returns not_found when advisory is missing', () => {
    const res = buildE2dFlow({ ...baseArgs(), advisory: undefined });
    expect(res.reason_code).toBe('not_found');
    expect(res.flow).toBeUndefined();
    expect(res.query).toEqual({ cve: 'CVE-2026-1234', window: '24h' });
  });

  it('builds a complete happy-path flow with 8 stages', () => {
    const res = buildE2dFlow(baseArgs());
    expect(res.reason_code).toBe('ok');
    expect(res.flow).toBeDefined();
    const stageKinds = res.flow!.stages.map((s) => s.kind);
    expect(stageKinds).toEqual([
      'ingested',
      'exploit_probability',
      'synthesized',
      'evaluated',
      'backtested',
      'governance',
      'applied',
      'running',
    ]);
    expect(res.flow!.overall_status).toBe('running');
  });

  it('populates ingested stage with CVE metadata', () => {
    const res = buildE2dFlow(baseArgs());
    const stage = stageOfKind(res.flow!.stages, 'ingested') as ArgusE2dIngestedStage;
    expect(stage.status).toBe('done');
    expect(stage.cve_id).toBe('CVE-2026-1234');
    expect(stage.severity).toBe('critical');
    expect(stage.kev).toBe(true);
    expect(stage.mitre_techniques).toEqual(['T1190']);
  });

  it('boosts exploit_probability to 1.0 when KEV is present', () => {
    const res = buildE2dFlow(baseArgs());
    const stage = stageOfKind(
      res.flow!.stages,
      'exploit_probability'
    ) as ArgusE2dExploitProbabilityStage;
    expect(stage.score).toBe(1.0);
    expect(stage.kev).toBe(true);
    expect(stage.title).toMatch(/CISA KEV/);
  });

  it('uses recommendation confidence when KEV is absent', () => {
    const advisoryNoKev: E2dRawAdvisoryDoc = {
      ...ADVISORY,
      _source: { ...ADVISORY._source, kev: undefined },
    };
    const res = buildE2dFlow({ ...baseArgs(), advisory: advisoryNoKev });
    const stage = stageOfKind(
      res.flow!.stages,
      'exploit_probability'
    ) as ArgusE2dExploitProbabilityStage;
    expect(stage.score).toBeCloseTo(0.92, 2);
    expect(stage.kev).toBe(false);
    expect(stage.title).toMatch(/92%/);
  });

  it('surfaces evaluator precision/recall and gate verdict', () => {
    const res = buildE2dFlow(baseArgs());
    const stage = stageOfKind(res.flow!.stages, 'evaluated') as ArgusE2dEvaluatedStage;
    expect(stage.precision).toBe(0.95);
    expect(stage.recall).toBe(0.8);
    expect(stage.gate_decision).toBe('pass');
    expect(stage.status).toBe('done');
  });

  it('marks evaluator as failed when gate_decision is fail', () => {
    const failingEval: E2dRawEvalRunDoc = {
      ...EVAL_RUN,
      _source: { ...EVAL_RUN._source, gate_decision: 'fail' },
    };
    const res = buildE2dFlow({ ...baseArgs(), evalRun: failingEval });
    const stage = stageOfKind(res.flow!.stages, 'evaluated') as ArgusE2dEvaluatedStage;
    expect(stage.status).toBe('failed');
  });

  it('reflects governance block status and overall blocked state', () => {
    const blockedIntent: E2dRawMutationIntentDoc = {
      ...MUTATION_INTENT,
      _source: {
        ...MUTATION_INTENT._source,
        governance_gate: { status: 'blocked', reason: 'trust tier insufficient' },
      },
    };
    const res = buildE2dFlow({
      ...baseArgs(),
      mutationIntent: blockedIntent,
      outcome: undefined,
      liveHitCount: 0,
    });
    const gov = stageOfKind(res.flow!.stages, 'governance') as ArgusE2dGovernanceStage;
    expect(gov.status).toBe('blocked');
    expect(gov.gate_status).toBe('blocked');
    expect(gov.blocked_reason).toBe('trust tier insufficient');
    expect(res.flow!.overall_status).toBe('blocked');
  });

  it('marks applied as failed and overall rolled_back when outcome.rolled_back is true', () => {
    const rolledOutcome: E2dRawOutcomeDoc = {
      ...OUTCOME_APPLIED,
      _source: {
        ...OUTCOME_APPLIED._source,
        rolled_back: true,
        rollback_mttr_ms: 45000,
        label: 'Rolled back',
      },
    };
    const res = buildE2dFlow({ ...baseArgs(), outcome: rolledOutcome, liveHitCount: 0 });
    const applied = stageOfKind(res.flow!.stages, 'applied') as ArgusE2dAppliedStage;
    expect(applied.status).toBe('failed');
    expect(applied.rolled_back).toBe(true);
    expect(applied.rollback_mttr_ms).toBe(45000);
    expect(res.flow!.overall_status).toBe('rolled_back');
    const running = stageOfKind(res.flow!.stages, 'running') as ArgusE2dRunningStage;
    expect(running.status).toBe('skipped');
    expect(running.is_live).toBe(false);
  });

  it('marks running stage as done only when applied AND liveHitCount > 0', () => {
    const res = buildE2dFlow({ ...baseArgs(), liveHitCount: 0 });
    const running = stageOfKind(res.flow!.stages, 'running') as ArgusE2dRunningStage;
    expect(running.is_live).toBe(false);
    expect(running.status).toBe('pending');
    expect(res.flow!.overall_status).toBe('applied');
  });

  it('coerces non-finite numbers to null', () => {
    const weirdEval: E2dRawEvalRunDoc = {
      ...EVAL_RUN,
      _source: {
        ...EVAL_RUN._source,
        scores: {
          precision: Number.NaN,
          recall: Number.POSITIVE_INFINITY,
          fp_rate_baseline: undefined,
          variant_coverage: 0.9,
        },
      },
    };
    const res = buildE2dFlow({ ...baseArgs(), evalRun: weirdEval });
    const stage = stageOfKind(res.flow!.stages, 'evaluated') as ArgusE2dEvaluatedStage;
    expect(stage.precision).toBeNull();
    expect(stage.recall).toBeNull();
    expect(stage.fp_rate_baseline).toBeNull();
    expect(stage.variant_coverage).toBe(0.9);
  });

  it('clamps live_hits to a non-negative integer', () => {
    const res = buildE2dFlow({ ...baseArgs(), liveHitCount: -5.7 });
    const running = stageOfKind(res.flow!.stages, 'running') as ArgusE2dRunningStage;
    expect(running.live_hits).toBe(0);
  });

  it('skips backtest stage when not present', () => {
    const res = buildE2dFlow({ ...baseArgs(), backtest: undefined });
    const stages = res.flow!.stages;
    const bt = stages.find((s) => s.kind === 'backtested');
    expect(bt?.status).toBe('skipped');
  });

  it('passes window through to flow payload and running stage', () => {
    const res = buildE2dFlow({ ...baseArgs(), window: '7d' });
    expect(res.flow!.live_hits_window).toBe('7d');
    const running = stageOfKind(res.flow!.stages, 'running') as ArgusE2dRunningStage;
    expect(running.live_hits_window).toBe('7d');
  });
});
