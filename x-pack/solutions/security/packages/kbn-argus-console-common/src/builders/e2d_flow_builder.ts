/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ArgusE2dAppliedStage,
  ArgusE2dBacktestedStage,
  ArgusE2dEvaluatedStage,
  ArgusE2dExploitProbabilityStage,
  ArgusE2dFlowPayload,
  ArgusE2dFlowResponse,
  ArgusE2dGovernanceStage,
  ArgusE2dIngestedStage,
  ArgusE2dOverallStatus,
  ArgusE2dRunningStage,
  ArgusE2dStage,
  ArgusE2dStageStatus,
  ArgusE2dSynthesizedStage,
} from '../types/e2d_flow';
import { ARGUS_SOC_INDICES } from '../constants';

export interface E2dRawAdvisoryDoc {
  readonly _id: string;
  readonly _index?: string;
  readonly _source?: {
    readonly '@timestamp'?: string;
    readonly advisory_id?: string;
    readonly cve_id?: string;
    readonly title?: string;
    readonly severity?: string;
    readonly status?: string;
    readonly source?: string;
    readonly published_at?: string;
    readonly corpus_id?: string;
    readonly recommendation_id?: string;
    readonly draft_rule_id?: string;
    readonly kev?: Readonly<Record<string, unknown>> | null;
    readonly mitre_techniques?: ReadonlyArray<{
      readonly technique_id?: string;
      readonly technique_name?: string;
    }>;
  };
}

export interface E2dRawMutationIntentDoc {
  readonly _id?: string;
  readonly _index?: string;
  readonly _source?: {
    readonly '@timestamp'?: string;
    readonly mutation_intent_id?: string;
    readonly rule_id?: string;
    readonly governance_gate?: { readonly status?: string; readonly reason?: string };
    readonly status?: string;
    readonly argus?: { readonly actor?: { readonly trust_tier?: string } };
    readonly actor?: { readonly trust_tier?: string };
  };
}

export interface E2dRawRecommendationDoc {
  readonly _id?: string;
  readonly _index?: string;
  readonly _source?: {
    readonly '@timestamp'?: string;
    readonly rec_id?: string;
    readonly status?: string;
    readonly confidence?: number;
    readonly argus?: { readonly decision?: { readonly confidence?: number } };
  };
}

export interface E2dRawEvalRunDoc {
  readonly _id?: string;
  readonly _index?: string;
  readonly _source?: {
    readonly '@timestamp'?: string;
    readonly rule_id?: string;
    readonly scores?: {
      readonly precision?: number;
      readonly recall?: number;
      readonly fp_rate_baseline?: number;
      readonly variant_coverage?: number;
    };
    readonly gate_decision?: string;
    readonly gate_reason?: string;
  };
}

export interface E2dRawBacktestDoc {
  readonly _id?: string;
  readonly _index?: string;
  readonly _source?: {
    readonly '@timestamp'?: string;
    readonly windows_tested?: number;
    readonly true_positives?: number;
    readonly false_positives?: number;
    readonly gate_decision?: string;
  };
}

export interface E2dRawOutcomeDoc {
  readonly _id?: string;
  readonly _index?: string;
  readonly _source?: {
    readonly '@timestamp'?: string;
    readonly rule_id?: string;
    readonly mutation_intent_id?: string;
    readonly rolled_back?: boolean;
    readonly applied_at?: string;
    readonly rolled_back_at?: string;
    readonly rollback_mttr_ms?: number;
    readonly label?: string;
  };
}

export interface BuildE2dFlowArgs {
  readonly cveQuery: string;
  readonly window: '24h' | '7d';
  readonly advisory: E2dRawAdvisoryDoc | undefined;
  readonly mutationIntent: E2dRawMutationIntentDoc | undefined;
  readonly recommendation: E2dRawRecommendationDoc | undefined;
  readonly evalRun: E2dRawEvalRunDoc | undefined;
  readonly backtest: E2dRawBacktestDoc | undefined;
  readonly outcome: E2dRawOutcomeDoc | undefined;
  readonly liveHitCount: number;
}

const toFiniteOrNull = (v: unknown): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
};

const toStringOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length === 0) return null;
  return v;
};

const buildIngestedStage = (advisory: E2dRawAdvisoryDoc | undefined): ArgusE2dIngestedStage => {
  const src = advisory?._source;
  const status: ArgusE2dStageStatus = advisory ? 'done' : 'skipped';
  const cveId = toStringOrNull(src?.cve_id) ?? toStringOrNull(src?.advisory_id);
  const techniques = (src?.mitre_techniques ?? [])
    .map((t) => toStringOrNull(t?.technique_id))
    .filter((t): t is string => t !== null);

  return {
    kind: 'ingested',
    status,
    title: advisory
      ? toStringOrNull(src?.title) ?? cveId ?? 'CVE advisory ingested'
      : 'No advisory',
    subtitle: advisory
      ? [cveId, toStringOrNull(src?.severity), src?.kev ? 'CISA KEV' : undefined]
          .filter(Boolean)
          .join(' · ')
      : 'No matching CVE advisory was found',
    timestamp:
      toStringOrNull(src?.['@timestamp']) ?? toStringOrNull(src?.published_at) ?? undefined,
    source_doc_id: advisory?._id,
    source_index: advisory?._index ?? ARGUS_SOC_INDICES.cveAdvisories,
    cve_id: cveId,
    advisory_id: toStringOrNull(src?.advisory_id) ?? advisory?._id ?? null,
    severity: toStringOrNull(src?.severity),
    kev: Boolean(src?.kev),
    mitre_techniques: techniques,
    source: toStringOrNull(src?.source),
  };
};

const buildExploitProbabilityStage = (
  advisory: E2dRawAdvisoryDoc | undefined,
  recommendation: E2dRawRecommendationDoc | undefined
): ArgusE2dExploitProbabilityStage => {
  const kev = Boolean(advisory?._source?.kev);
  const rawConfidence =
    recommendation?._source?.argus?.decision?.confidence ??
    (typeof recommendation?._source?.confidence === 'number'
      ? recommendation._source.confidence / 100
      : undefined);
  const score = kev ? 1.0 : rawConfidence ?? null;
  const hasScore = score !== null && score !== undefined;

  return {
    kind: 'exploit_probability',
    status: hasScore || kev ? 'done' : advisory ? 'pending' : 'skipped',
    title: kev
      ? 'Exploit probability · CISA KEV'
      : hasScore
      ? `Exploit probability ${Math.round((score as number) * 100)}%`
      : 'Exploit probability',
    subtitle: kev ? 'Known exploited (CISA KEV feed)' : 'derived from recommendation confidence',
    timestamp: recommendation?._source?.['@timestamp'],
    source_doc_id: recommendation?._id,
    source_index: recommendation?._index ?? ARGUS_SOC_INDICES.recommendations,
    score: toFiniteOrNull(score),
    kev,
  };
};

const buildSynthesizedStage = (
  advisory: E2dRawAdvisoryDoc | undefined,
  mutationIntent: E2dRawMutationIntentDoc | undefined
): ArgusE2dSynthesizedStage => {
  const advSrc = advisory?._source;
  const miSrc = mutationIntent?._source;
  const draftRuleId = toStringOrNull(miSrc?.rule_id) ?? toStringOrNull(advSrc?.draft_rule_id);

  return {
    kind: 'synthesized',
    status: mutationIntent ? 'done' : advSrc?.draft_rule_id ? 'done' : 'pending',
    title: 'Rule synthesized',
    subtitle: draftRuleId ? `Draft rule · ${draftRuleId}` : 'Awaiting draft rule',
    timestamp: miSrc?.['@timestamp'] ?? undefined,
    source_doc_id: mutationIntent?._id,
    source_index: mutationIntent?._index ?? ARGUS_SOC_INDICES.mutationIntents,
    draft_rule_id: draftRuleId,
    mutation_intent_id: toStringOrNull(miSrc?.mutation_intent_id) ?? mutationIntent?._id ?? null,
    recommendation_id: toStringOrNull(advSrc?.recommendation_id),
    corpus_id: toStringOrNull(advSrc?.corpus_id),
  };
};

const buildEvaluatedStage = (evalRun: E2dRawEvalRunDoc | undefined): ArgusE2dEvaluatedStage => {
  const src = evalRun?._source;
  const gate = toStringOrNull(src?.gate_decision);
  const status: ArgusE2dStageStatus = !evalRun ? 'pending' : gate === 'fail' ? 'failed' : 'done';

  return {
    kind: 'evaluated',
    status,
    title: evalRun ? `Eval ${gate ?? 'complete'}` : 'Offline eval pending',
    subtitle:
      src?.scores?.precision !== undefined && src?.scores?.recall !== undefined
        ? `precision ${(src.scores.precision * 100).toFixed(0)}% · recall ${(
            src.scores.recall * 100
          ).toFixed(0)}%`
        : undefined,
    timestamp: src?.['@timestamp'],
    source_doc_id: evalRun?._id,
    source_index: evalRun?._index ?? ARGUS_SOC_INDICES.detectionEvalRuns,
    precision: toFiniteOrNull(src?.scores?.precision),
    recall: toFiniteOrNull(src?.scores?.recall),
    fp_rate_baseline: toFiniteOrNull(src?.scores?.fp_rate_baseline),
    variant_coverage: toFiniteOrNull(src?.scores?.variant_coverage),
    gate_decision: gate,
    gate_reason: toStringOrNull(src?.gate_reason),
  };
};

const buildBacktestedStage = (backtest: E2dRawBacktestDoc | undefined): ArgusE2dBacktestedStage => {
  const src = backtest?._source;
  const gate = toStringOrNull(src?.gate_decision);
  const status: ArgusE2dStageStatus = !backtest ? 'skipped' : gate === 'fail' ? 'failed' : 'done';

  return {
    kind: 'backtested',
    status,
    title: backtest ? `Backtest ${gate ?? 'complete'}` : 'Backtest not run',
    subtitle:
      src?.true_positives !== undefined
        ? `TP ${src.true_positives ?? 0} · FP ${src.false_positives ?? 0}`
        : undefined,
    timestamp: src?.['@timestamp'],
    source_doc_id: backtest?._id,
    source_index: backtest?._index ?? ARGUS_SOC_INDICES.backtestResults,
    windows_tested: toFiniteOrNull(src?.windows_tested),
    true_positives: toFiniteOrNull(src?.true_positives),
    false_positives: toFiniteOrNull(src?.false_positives),
    gate_decision: gate,
  };
};

const buildGovernanceStage = (
  mutationIntent: E2dRawMutationIntentDoc | undefined
): ArgusE2dGovernanceStage => {
  const src = mutationIntent?._source;
  const gateStatus = toStringOrNull(src?.governance_gate?.status);
  const trustTier =
    toStringOrNull(src?.argus?.actor?.trust_tier) ?? toStringOrNull(src?.actor?.trust_tier);
  const isBlocked = gateStatus === 'blocked';
  const status: ArgusE2dStageStatus = !mutationIntent
    ? 'pending'
    : isBlocked
    ? 'blocked'
    : gateStatus === 'approved'
    ? 'done'
    : 'pending';

  return {
    kind: 'governance',
    status,
    title: isBlocked
      ? 'Governance blocked'
      : gateStatus === 'approved'
      ? 'Governance approved'
      : 'Governance review',
    subtitle: trustTier ? `Actor trust tier · ${trustTier}` : undefined,
    timestamp: src?.['@timestamp'],
    source_doc_id: mutationIntent?._id,
    source_index: mutationIntent?._index ?? ARGUS_SOC_INDICES.mutationIntents,
    gate_status: gateStatus,
    trust_tier: trustTier,
    blocked_reason: isBlocked ? toStringOrNull(src?.governance_gate?.reason) : null,
  };
};

const buildAppliedStage = (outcome: E2dRawOutcomeDoc | undefined): ArgusE2dAppliedStage => {
  const src = outcome?._source;
  const rolledBack = Boolean(src?.rolled_back);
  const status: ArgusE2dStageStatus = !outcome ? 'skipped' : rolledBack ? 'failed' : 'done';

  return {
    kind: 'applied',
    status,
    title: rolledBack ? 'Applied then rolled back' : outcome ? 'Applied' : 'Not yet applied',
    subtitle:
      rolledBack && typeof src?.rollback_mttr_ms === 'number'
        ? `Rollback MTTR ${(src.rollback_mttr_ms / 1000).toFixed(1)}s`
        : toStringOrNull(src?.label) ?? undefined,
    timestamp: src?.['@timestamp'] ?? src?.applied_at,
    source_doc_id: outcome?._id,
    source_index: outcome?._index ?? ARGUS_SOC_INDICES.outcomes,
    rule_id: toStringOrNull(src?.rule_id),
    rolled_back: rolledBack,
    rollback_mttr_ms: toFiniteOrNull(src?.rollback_mttr_ms),
    applied_at: toStringOrNull(src?.applied_at),
  };
};

const buildRunningStage = (
  outcome: E2dRawOutcomeDoc | undefined,
  mutationIntent: E2dRawMutationIntentDoc | undefined,
  liveHitCount: number,
  window: '24h' | '7d'
): ArgusE2dRunningStage => {
  const src = outcome?._source;
  const ruleId = toStringOrNull(src?.rule_id) ?? toStringOrNull(mutationIntent?._source?.rule_id);
  const rolledBack = Boolean(src?.rolled_back);
  const applied = outcome && !rolledBack;
  const isLive = Boolean(applied) && liveHitCount > 0;

  const status: ArgusE2dStageStatus = rolledBack
    ? 'skipped'
    : !applied
    ? 'pending'
    : isLive
    ? 'done'
    : 'pending';

  return {
    kind: 'running',
    status,
    title: isLive
      ? 'Running · detections firing'
      : applied
      ? 'Running · awaiting first detection'
      : 'Not yet running',
    subtitle: applied
      ? `${liveHitCount} detection hit${liveHitCount === 1 ? '' : 's'} in last ${window}`
      : undefined,
    source_index: '.alerts-security.alerts-*',
    rule_id: ruleId,
    live_hits: Math.max(0, Math.floor(liveHitCount)),
    live_hits_window: window,
    is_live: isLive,
  };
};

const computeOverallStatus = (stages: readonly ArgusE2dStage[]): ArgusE2dOverallStatus => {
  const byKind = new Map(stages.map((s) => [s.kind, s] as const));
  const running = byKind.get('running') as ArgusE2dRunningStage | undefined;
  const applied = byKind.get('applied') as ArgusE2dAppliedStage | undefined;
  const governance = byKind.get('governance') as ArgusE2dGovernanceStage | undefined;
  const backtested = byKind.get('backtested');
  const evaluated = byKind.get('evaluated');
  const synthesized = byKind.get('synthesized');

  if (running?.is_live) return 'running';
  if (applied?.rolled_back) return 'rolled_back';
  if (applied?.status === 'done') return 'applied';
  if (governance?.gate_status === 'blocked') return 'blocked';
  if (governance?.gate_status === 'approved') return 'approved';
  if (backtested?.status === 'done' || backtested?.status === 'failed') return 'backtested';
  if (evaluated?.status === 'done' || evaluated?.status === 'failed') return 'evaluated';
  if (synthesized?.status === 'done') return 'synthesized';
  return 'ingested';
};

export const buildE2dFlow = (args: BuildE2dFlowArgs): ArgusE2dFlowResponse => {
  const {
    cveQuery,
    window,
    advisory,
    mutationIntent,
    recommendation,
    evalRun,
    backtest,
    outcome,
    liveHitCount,
  } = args;

  if (!advisory) {
    return {
      reason_code: 'not_found',
      query: { cve: cveQuery, window },
    };
  }

  const stages: ArgusE2dStage[] = [
    buildIngestedStage(advisory),
    buildExploitProbabilityStage(advisory, recommendation),
    buildSynthesizedStage(advisory, mutationIntent),
    buildEvaluatedStage(evalRun),
    buildBacktestedStage(backtest),
    buildGovernanceStage(mutationIntent),
    buildAppliedStage(outcome),
    buildRunningStage(outcome, mutationIntent, liveHitCount, window),
  ];

  const advSrc = advisory._source;
  const payload: ArgusE2dFlowPayload = {
    cve_id: toStringOrNull(advSrc?.cve_id) ?? toStringOrNull(advSrc?.advisory_id),
    advisory_id: toStringOrNull(advSrc?.advisory_id) ?? advisory._id,
    title: toStringOrNull(advSrc?.title),
    overall_status: computeOverallStatus(stages),
    stages,
    live_hits_window: window,
  };

  return {
    reason_code: 'ok',
    flow: payload,
    query: { cve: cveQuery, window },
  };
};
