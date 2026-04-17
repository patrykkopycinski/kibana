/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useKibana } from '../../common/lib/kibana';

import { AUTO_REFRESH_MS } from './constants';

/**
 * Individual alert classification extracted from the triage_output JSON blob.
 * Each triage document contains a batch of these.
 */
export interface TriageClassification {
  '@timestamp': string;
  alert_id?: string;
  classification?: string;
  disposition?: string;
  threat_category?: string;
  kill_chain_stage?: string;
  business_impact?: {
    data_at_risk?: string[];
    systems_at_risk?: number;
    criticality?: string;
  };
  attack_chain?: {
    chain_id?: string;
    position_in_chain?: number;
    chain_length?: number;
    related_alert_ids?: string[];
  };
  confidence?: number;
  next_step?: string;
  reasoning?: string;
  mitre_techniques?: string[];
  source?: string;
}

interface TriageDocRaw {
  '@timestamp': string;
  source?: string;
  stage?: string;
  batch_size?: string;
  triage_output?: string;
}

export interface OutcomeRecord {
  '@timestamp': string;
  correlation_id?: string;
  disposition?: string;
  agents_involved?: string;
  pipeline_complete?: boolean;
}

interface CoverageGapRaw {
  '@timestamp': string;
  source?: string;
  health_report?: string;
}

export interface HealthIssue {
  type?: string;
  description?: string;
  severity?: string;
}

export interface TechniqueGap {
  technique_id?: string;
  occurrences?: number;
  avg_confidence?: number;
}

export interface AgentStatus {
  agent_id?: string;
  status?: string;
}

export interface CoverageGap {
  '@timestamp': string;
  source?: string;
  status?: string;
  summary?: string;
  agents: AgentStatus[];
  issues: HealthIssue[];
  techniqueGaps: TechniqueGap[];
}

export interface RuleTuning {
  rule_id?: string;
  action?: string;
  before?: string;
}

export interface EvolutionRefinement {
  target_agent_id?: string;
  reasoning?: string;
  updated_instructions?: string;
}

export interface EvolutionEvent {
  /**
   * Elasticsearch document _id. Used to join with Recommendation.source_doc_id
   * so the Evolution Log can surface "review & approve/reject" actions inline.
   */
  _id?: string;
  '@timestamp': string;
  source?: string;
  event_type?: string;
  action?: string;
  result?: string;
  summary?: string;
  reasoning?: string;
  refinement?: EvolutionRefinement;
  agentId?: string;
  agentName?: string;
  skillId?: string;
  skillName?: string;
  workflowId?: string;
  workflowName?: string;
  rulesTuned: RuleTuning[];
  rulesCreated: RuleTuning[];
  rulesDisabled: RuleTuning[];
}

export interface ResponseInvestigation {
  alert_id?: string;
  final_classification?: string;
  final_confidence?: number;
  next_step?: string;
  findings?: string;
  mitre_techniques?: string[];
}

export interface ResponseAction {
  '@timestamp': string;
  source?: string;
  stage?: string;
  action_type?: string;
  status?: string;
  investigations: ResponseInvestigation[];
}

export interface AuditEntry {
  '@timestamp': string;
  event_type?: string;
  source?: string;
  details?: string;
  stalled_count?: string;
}

/**
 * One document per reasoning step emitted by an AutoSOC agent.
 * step_type === 'run_summary' is a rollup written once per run_id on completion.
 * Mirrors soc-simulation/schemas/reasoning_trace.schema.json.
 */
export interface ReasoningTraceStep {
  '@timestamp': string;
  run_id: string;
  agent_id: string;
  step_index: number;
  step_type:
    | 'thought'
    | 'tool_call'
    | 'tool_result'
    | 'decision'
    | 'recommendation'
    | 'run_summary';
  content?: string | null;
  tool_name?: string | null;
  tool_args?: Record<string, unknown> | null;
  tool_result_ref?: string | null;
  // run_summary only
  total_steps?: number;
  tool_call_count?: number;
  total_duration_ms?: number;
  final_status?: 'success' | 'failure' | 'aborted';
  final_output_ref?: string | null;
}

export interface PipelineMetric {
  '@timestamp': string;
  pipeline?: string;
  cycle_id?: string;
  alerts_processed?: number;
  stages_completed?: string;
  case_created?: boolean;
  status?: string;
}

export interface TrustScore {
  tier: string;
  total_proposals: number;
  approved_count: number;
  rejected_count: number;
  applied_count: number;
  failed_count: number;
  approval_rate: number;
  auto_approve_eligible: boolean;
}

export interface SystemHealth {
  metrics: PipelineMetric[];
  trustScores: TrustScore[];
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  skippedCycles: number;
  avgAlertsPerCycle: number;
  /** Percent of executed (non-skipped) cycles that completed successfully. */
  pipelineSuccessRate: number;
}

export type RecommendationStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'failed';

export interface SubItemDecision {
  status: RecommendationStatus;
  rejection_reason?: string;
  reviewed_at?: string;
  kibana_rule_id?: string;
  provisioned_rule_id?: string;
}

export interface Recommendation {
  _id: string;
  '@timestamp': string;
  rec_id?: string;
  type?: string;
  source?: string;
  source_doc_id?: string;
  status: RecommendationStatus;
  title?: string;
  summary?: string;
  details?: Record<string, unknown> | string;
  reasoning?: string;
  confidence?: number;
  reviewed_by?: string;
  reviewed_at?: string;
  review_decision?: string;
  rejection_reason?: string;
  applied_at?: string;
  apply_error?: string;
  sub_items?: Record<string, SubItemDecision>;
}

export interface FlatRecommendation {
  parentId: string;
  subIndex: number;
  parentTimestamp: string;
  parentSource?: string;
  parentConfidence?: number;
  parentStatus: RecommendationStatus;
  category:
    | 'rule_tuning'
    | 'rule_creation'
    | 'rule_disabled'
    | 'agent_action'
    | 'architecture_review'
    | 'capability_gap';
  title: string;
  description: string;
  ruleId?: string;
  kibanaRuleId?: string;
  technique?: string;
  details: Record<string, unknown>;
  status: RecommendationStatus;
  rejection_reason?: string;
}

export interface SocKPIs {
  automationRate: number;
  falsePositiveRate: number;
  truePositiveRate: number;
  suspiciousRate: number;
  avgConfidence: number | null;
  alertsProcessedToday: number;
  alertsProcessedTotal: number;
  totalClassifications: number;
  casesCreated: number;
  agentsActive: number;
  agentsDegraded: number;
}

export interface RecommendationCounts {
  pending: number;
  approved: number;
  rejected: number;
  applied: number;
  failed: number;
  total: number;
}

export interface SocData {
  kpis: SocKPIs;
  triageClassifications: TriageClassification[];
  outcomes: OutcomeRecord[];
  coverageGaps: CoverageGap[];
  evolutionEvents: EvolutionEvent[];
  responseActions: ResponseAction[];
  auditTrail: AuditEntry[];
  reasoningTraces: ReasoningTraceStep[];
  recommendations: Recommendation[];
  flatRecommendations: FlatRecommendation[];
  recommendationCounts: RecommendationCounts;
  systemHealth: SystemHealth;
  classificationBreakdown: Array<{ key: string; doc_count: number }>;
  techniqueBreakdown: Array<{ key: string; doc_count: number }>;
  agentWorkload: Array<{ key: string; doc_count: number }>;
  timelineData: Array<{ key_as_string: string; doc_count: number }>;
  outcomeTimeline: Array<{ key_as_string: string; doc_count: number }>;
  outcomeDispositions: Array<{ key: string; doc_count: number }>;
  counts: {
    triageDocs: number;
    outcomes: number;
    responseActions: number;
    coverageGaps: number;
    evolution: number;
    audit: number;
    investigations: number;
  };
}

const DEFAULT_KPIS: SocKPIs = {
  automationRate: 0,
  falsePositiveRate: 0,
  truePositiveRate: 0,
  suspiciousRate: 0,
  avgConfidence: null,
  alertsProcessedToday: 0,
  alertsProcessedTotal: 0,
  totalClassifications: 0,
  casesCreated: 0,
  agentsActive: 0,
  agentsDegraded: 0,
};

const DEFAULT_REC_COUNTS: RecommendationCounts = {
  pending: 0,
  approved: 0,
  rejected: 0,
  applied: 0,
  failed: 0,
  total: 0,
};

const DEFAULT_SYSTEM_HEALTH: SystemHealth = {
  metrics: [],
  trustScores: [],
  totalCycles: 0,
  successfulCycles: 0,
  failedCycles: 0,
  skippedCycles: 0,
  avgAlertsPerCycle: 0,
  pipelineSuccessRate: 0,
};

const DEFAULT_DATA: SocData = {
  kpis: DEFAULT_KPIS,
  triageClassifications: [],
  outcomes: [],
  coverageGaps: [],
  evolutionEvents: [],
  responseActions: [],
  auditTrail: [],
  reasoningTraces: [],
  recommendations: [],
  flatRecommendations: [],
  recommendationCounts: DEFAULT_REC_COUNTS,
  systemHealth: DEFAULT_SYSTEM_HEALTH,
  classificationBreakdown: [],
  techniqueBreakdown: [],
  agentWorkload: [],
  timelineData: [],
  outcomeTimeline: [],
  outcomeDispositions: [],
  counts: {
    triageDocs: 0,
    outcomes: 0,
    responseActions: 0,
    coverageGaps: 0,
    evolution: 0,
    audit: 0,
    investigations: 0,
  },
};

const esRawSearch = async (
  http: ReturnType<typeof useKibana>['services']['http'],
  index: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown> | null> => {
  try {
    const result = await http.post<{ rawResponse?: Record<string, unknown> }>(
      `/internal/search/es`,
      {
        version: '1',
        body: JSON.stringify({ params: { index, body } }),
      }
    );
    return result?.rawResponse ?? null;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status !== 404) {
      // eslint-disable-next-line no-console
      console.warn(`[AutoSOC] ES search for "${index}" failed:`, err);
    }
    return null;
  }
};

const extractTotal = (res: Record<string, unknown> | null): number => {
  const hits = res?.hits as { total?: { value?: number } | number } | undefined;
  if (!hits?.total) return 0;
  return typeof hits.total === 'number' ? hits.total : hits.total.value ?? 0;
};

const extractHits = <T>(res: Record<string, unknown> | null): T[] => {
  const hits = res?.hits as { hits?: Array<{ _source: T }> } | undefined;
  return (hits?.hits ?? []).map((h) => h._source);
};

const extractBuckets = (
  res: Record<string, unknown> | null,
  aggName: string
): Array<{ key: string; key_as_string?: string; doc_count: number }> => {
  const aggs = res?.aggregations as Record<string, { buckets?: unknown[] }> | undefined;
  return (aggs?.[aggName]?.buckets ?? []) as Array<{
    key: string;
    key_as_string?: string;
    doc_count: number;
  }>;
};

/**
 * Parse a double-encoded JSON field (common pattern in SOC indices).
 * Structure: JSON string -> { message: "JSON string" } -> actual data
 */
const parseJsonField = (raw: string | undefined): Record<string, unknown> | null => {
  if (!raw) return null;
  try {
    const outer = JSON.parse(raw);
    if (typeof outer?.message === 'string') {
      try {
        const cleaned = outer.message.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        return JSON.parse(cleaned);
      } catch (_e) {
        return outer;
      }
    }
    return outer;
  } catch (_e) {
    return null;
  }
};

/**
 * Extract individual classifications from triage_output JSON blobs.
 * Each triage document may contain a batch of 10+ classifications.
 */
const parseTriageClassifications = (docs: TriageDocRaw[]): TriageClassification[] => {
  const results: TriageClassification[] = [];

  for (const doc of docs) {
    const parsed = parseJsonField(doc.triage_output);
    if (parsed) {
      const classifications = parsed.classifications as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(classifications)) {
        for (const c of classifications) {
          const bi = c.business_impact as Record<string, unknown> | undefined;
          const ac = c.attack_chain as Record<string, unknown> | undefined;
          // The triage agent is free to ship extra prose or empty strings;
          // normalize so the dashboard only ever sees strings-or-undefined.
          const stringOr = (v: unknown): string | undefined => {
            if (typeof v !== 'string') return undefined;
            const trimmed = v.trim();
            return trimmed.length ? trimmed : undefined;
          };
          results.push({
            '@timestamp': doc['@timestamp'],
            alert_id: stringOr(c.alert_id),
            classification: stringOr(c.classification),
            disposition: stringOr(c.disposition),
            threat_category: stringOr(c.threat_category),
            kill_chain_stage: stringOr(c.kill_chain_stage),
            business_impact: bi
              ? {
                  data_at_risk: bi.data_at_risk as string[] | undefined,
                  systems_at_risk: bi.systems_at_risk as number | undefined,
                  criticality: bi.criticality as string | undefined,
                }
              : undefined,
            attack_chain: ac
              ? {
                  chain_id: ac.chain_id as string | undefined,
                  position_in_chain: ac.position_in_chain as number | undefined,
                  chain_length: ac.chain_length as number | undefined,
                  related_alert_ids: ac.related_alert_ids as string[] | undefined,
                }
              : undefined,
            // Confidence can arrive as a number, a 0–1 float, or a
            // stringified number from the LLM. Final coercion/clamping
            // happens in the dashboard renderer; preserve the original
            // value here so it can distinguish "missing" from "0".
            confidence:
              typeof c.confidence === 'number' && Number.isFinite(c.confidence)
                ? c.confidence
                : typeof c.confidence === 'string' && c.confidence.trim().length
                ? Number(c.confidence)
                : undefined,
            next_step: stringOr(c.next_step),
            reasoning: stringOr(c.reasoning),
            mitre_techniques: Array.isArray(c.mitre_techniques)
              ? (c.mitre_techniques as unknown[]).filter(
                  (t): t is string => typeof t === 'string' && t.length > 0
                )
              : undefined,
            source: doc.source,
          });
        }
      }
    }
  }

  return results;
};

/**
 * Compute in-memory aggregation from parsed classifications.
 */
const computeBreakdown = (
  items: TriageClassification[],
  fieldFn: (item: TriageClassification) => string | string[] | undefined
): Array<{ key: string; doc_count: number }> => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const val = fieldFn(item);
    if (Array.isArray(val)) {
      for (const v of val) {
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    } else if (val) {
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([key, doc_count]) => ({ key, doc_count }))
    .sort((a, b) => b.doc_count - a.doc_count);
};

interface ResponseActionRaw {
  '@timestamp': string;
  source?: string;
  stage?: string;
  action_type?: string;
  status?: string;
  investigation_summary?: string;
}

const parseResponseAction = (raw: ResponseActionRaw): ResponseAction => {
  const parsed = parseJsonField(raw.investigation_summary);
  const investigations: ResponseInvestigation[] = [];

  if (parsed && Array.isArray(parsed.investigations)) {
    for (const inv of parsed.investigations as Array<Record<string, unknown>>) {
      investigations.push({
        alert_id: inv.alert_id as string | undefined,
        final_classification: inv.final_classification as string | undefined,
        final_confidence: inv.final_confidence as number | undefined,
        next_step: inv.next_step as string | undefined,
        findings: inv.findings as string | undefined,
        mitre_techniques: inv.mitre_techniques as string[] | undefined,
      });
    }
  }

  return {
    '@timestamp': raw['@timestamp'],
    source: raw.source,
    stage: raw.stage,
    action_type: raw.action_type,
    status: raw.status,
    investigations,
  };
};

const asStringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const parseCoverageGap = (raw: CoverageGapRaw): CoverageGap => {
  const parsed = parseJsonField(raw.health_report);
  return {
    '@timestamp': raw['@timestamp'],
    source: raw.source,
    // Watchdog payloads have historically shipped non-string `status` values
    // (numbers, booleans, nested objects). Coerce so downstream EuiHealth /
    // statusHealth consumers never see an unexpected shape.
    status: asStringOrUndefined(parsed?.status),
    summary: asStringOrUndefined(parsed?.summary),
    agents: Array.isArray(parsed?.agents_checked) ? (parsed.agents_checked as AgentStatus[]) : [],
    issues: Array.isArray(parsed?.issues) ? (parsed.issues as HealthIssue[]) : [],
    techniqueGaps: Array.isArray(parsed?.coverage_gaps)
      ? (parsed.coverage_gaps as TechniqueGap[])
      : [],
  };
};

interface EvolutionEventRaw {
  '@timestamp': string;
  source?: string;
  event_type?: string;
  evolution_output?: string;
  analysis_output?: string;
}

const parseEvolutionEvent = (raw: EvolutionEventRaw, id?: string): EvolutionEvent => {
  const parsed = parseJsonField(raw.evolution_output ?? raw.analysis_output);
  const asArr = (field: unknown): RuleTuning[] =>
    Array.isArray(field) ? (field as RuleTuning[]) : [];

  const action = (parsed?.action as string) ?? undefined;
  const result = (parsed?.result as string) ?? undefined;

  const agentDef = parsed?.agent_definition as Record<string, unknown> | undefined;
  const refinement = parsed?.refinement ? (parsed.refinement as EvolutionRefinement) : undefined;

  const isSkillAction = action === 'create_skill' || action === 'update_skill';
  const isWorkflowAction = action === 'create_workflow';

  const agentId =
    !isSkillAction && !isWorkflowAction
      ? (agentDef?.id as string | undefined) ??
        refinement?.target_agent_id ??
        (parsed?.target_id as string | undefined)
      : undefined;
  const agentName = agentId ? (agentDef?.name as string | undefined) ?? agentId : undefined;

  const skillDef = parsed?.skill_definition as Record<string, unknown> | undefined;
  const skillId = isSkillAction
    ? (skillDef?.id as string | undefined) ??
      (parsed?.target as string | undefined) ??
      (parsed?.target_id as string | undefined)
    : undefined;
  const skillName = skillId ? (skillDef?.name as string | undefined) ?? skillId : undefined;

  const workflowDef = parsed?.workflow_definition as Record<string, unknown> | undefined;
  const workflowId = isWorkflowAction
    ? (workflowDef?.id as string | undefined) ??
      (parsed?.target as string | undefined) ??
      (parsed?.target_id as string | undefined)
    : undefined;
  const workflowName = workflowId
    ? (workflowDef?.name as string | undefined) ??
      (parsed?.workflow_name as string | undefined) ??
      workflowId
    : undefined;

  return {
    _id: id,
    '@timestamp': raw['@timestamp'],
    source: raw.source,
    event_type: raw.event_type,
    action,
    result,
    summary: (parsed?.summary as string) ?? undefined,
    reasoning: (parsed?.reasoning as string) ?? undefined,
    refinement,
    agentId,
    agentName,
    skillId,
    skillName,
    workflowId,
    workflowName,
    rulesTuned: asArr(parsed?.rules_tuned),
    rulesCreated: asArr(parsed?.rules_created),
    rulesDisabled: asArr(parsed?.rules_disabled),
  };
};

/**
 * Parse a batch recommendation into individual actionable items.
 * DetEng recs contain { rules_tuned[], rules_created[], rules_disabled[] }.
 * Meta recs contain a single { action, agent_definition|refinement }.
 */
const flattenRecommendation = (rec: Recommendation): FlatRecommendation[] => {
  const items: FlatRecommendation[] = [];
  const subDecisions = rec.sub_items ?? {};

  const subStatus = (idx: number): RecommendationStatus =>
    subDecisions[String(idx)]?.status ?? rec.status;
  const subKibanaRuleId = (idx: number): string | undefined =>
    subDecisions[String(idx)]?.kibana_rule_id;
  const subProvisionedRuleId = (idx: number): string | undefined =>
    subDecisions[String(idx)]?.provisioned_rule_id;
  const subRejection = (idx: number): string | undefined =>
    subDecisions[String(idx)]?.rejection_reason;

  let summaryParsed: Record<string, unknown> | null = null;
  if (typeof rec.summary === 'string') {
    try {
      summaryParsed = JSON.parse(rec.summary);
    } catch {
      /* plain text summary */
    }
  }

  if (summaryParsed) {
    let idx = 0;

    const rulesTuned = summaryParsed.rules_tuned;
    if (Array.isArray(rulesTuned)) {
      for (const r of rulesTuned as Array<Record<string, unknown>>) {
        const action = (r.action as string) ?? 'tune';
        items.push({
          parentId: rec._id,
          subIndex: idx,
          parentTimestamp: rec['@timestamp'],
          parentSource: rec.source,
          parentConfidence: rec.confidence,
          parentStatus: rec.status,
          category: 'rule_tuning',
          title: `${action}: ${(r.rule_id as string) ?? 'unknown rule'}`,
          description: (r.after as string) ?? (r.before as string) ?? '',
          ruleId: r.rule_id as string | undefined,
          technique: (r.technique as string) ?? extractTechnique(r),
          details: r,
          status: subStatus(idx),
          rejection_reason: subRejection(idx),
        });
        idx++;
      }
    }

    const rulesCreated = summaryParsed.rules_created;
    if (Array.isArray(rulesCreated)) {
      for (const r of rulesCreated as Array<Record<string, unknown>>) {
        const provisionedId = subProvisionedRuleId(idx);
        items.push({
          parentId: rec._id,
          subIndex: idx,
          parentTimestamp: rec['@timestamp'],
          parentSource: rec.source,
          parentConfidence: rec.confidence,
          parentStatus: rec.status,
          category: 'rule_creation',
          title: (r.name as string) ?? 'New rule',
          description: (r.description as string) ?? (r.query as string) ?? '',
          ruleId: provisionedId ?? (r.rule_id as string | undefined),
          kibanaRuleId: subKibanaRuleId(idx),
          technique: (r.technique as string) ?? extractTechnique(r),
          details: r,
          status: subStatus(idx),
          rejection_reason: subRejection(idx),
        });
        idx++;
      }
    }

    const rulesDisabled = summaryParsed.rules_disabled;
    if (Array.isArray(rulesDisabled)) {
      for (const r of rulesDisabled as Array<Record<string, unknown>>) {
        items.push({
          parentId: rec._id,
          subIndex: idx,
          parentTimestamp: rec['@timestamp'],
          parentSource: rec.source,
          parentConfidence: rec.confidence,
          parentStatus: rec.status,
          category: 'rule_disabled',
          title: `Disable: ${(r.rule_id as string) ?? (r.name as string) ?? 'unknown'}`,
          description: (r.reason as string) ?? '',
          ruleId: r.rule_id as string | undefined,
          technique: (r.technique as string) ?? extractTechnique(r),
          details: r,
          status: subStatus(idx),
          rejection_reason: subRejection(idx),
        });
        idx++;
      }
    }

    const findings = summaryParsed.findings;
    if (Array.isArray(findings) && rec.type === 'architecture_review') {
      for (const f of findings as Array<Record<string, unknown>>) {
        items.push({
          parentId: rec._id,
          subIndex: idx,
          parentTimestamp: rec['@timestamp'],
          parentSource: rec.source,
          parentConfidence: rec.confidence,
          parentStatus: rec.status,
          category: 'architecture_review',
          title: `${(f.recommendation as string) ?? 'Review'}: ${
            (f.component as string) ?? 'system'
          }`,
          description: (f.finding as string) ?? (f.justification as string) ?? '',
          details: f,
          status: subStatus(idx),
          rejection_reason: subRejection(idx),
        });
        idx++;
      }
    }

    if (Array.isArray(findings) && rec.type === 'capability_gap') {
      for (const f of findings as Array<Record<string, unknown>>) {
        items.push({
          parentId: rec._id,
          subIndex: idx,
          parentTimestamp: rec['@timestamp'],
          parentSource: rec.source,
          parentConfidence: rec.confidence,
          parentStatus: rec.status,
          category: 'capability_gap',
          title: `${(f.signal as string) ?? 'gap'}: ${(f.component as string) ?? 'system'}`,
          description: (f.opportunity as string) ?? (f.finding as string) ?? '',
          details: f,
          status: subStatus(idx),
          rejection_reason: subRejection(idx),
        });
        idx++;
      }
    }

    if (summaryParsed.action && items.length === 0) {
      const action = summaryParsed.action as string;
      let actionTitle: string;
      if (action === 'create_skill') {
        const skillDef = summaryParsed.skill_definition as Record<string, unknown> | undefined;
        actionTitle = `Create Skill: ${skillDef?.name ?? skillDef?.id ?? 'new skill'}`;
      } else if (action === 'update_skill') {
        actionTitle = `Update Skill: ${(summaryParsed.skill_id as string) ?? 'skill'}`;
      } else if (action === 'enrich_agent') {
        actionTitle = `Enrich Agent: ${(summaryParsed.target_agent_id as string) ?? 'agent'}`;
      } else if (action === 'create_workflow') {
        actionTitle = `Create Workflow`;
      } else if (action === 'create_agent') {
        const agentDef = summaryParsed.agent_definition as Record<string, unknown> | undefined;
        actionTitle = `Create Agent: ${agentDef?.name ?? agentDef?.id ?? 'new agent'}`;
      } else {
        actionTitle = `${action}: ${
          (summaryParsed.refinement as Record<string, unknown>)?.target_agent_id ??
          (summaryParsed.agent_definition as Record<string, unknown>)?.name ??
          'system'
        }`;
      }

      items.push({
        parentId: rec._id,
        subIndex: 0,
        parentTimestamp: rec['@timestamp'],
        parentSource: rec.source,
        parentConfidence: rec.confidence,
        parentStatus: rec.status,
        category: 'agent_action',
        title: actionTitle,
        description: (summaryParsed.summary as string) ?? (summaryParsed.reasoning as string) ?? '',
        details: summaryParsed,
        status: subStatus(0),
        rejection_reason: subRejection(0),
      });
    }
  }

  if (items.length === 0) {
    items.push({
      parentId: rec._id,
      subIndex: 0,
      parentTimestamp: rec['@timestamp'],
      parentSource: rec.source,
      parentConfidence: rec.confidence,
      parentStatus: rec.status,
      category: 'agent_action',
      title: rec.title ?? 'Recommendation',
      description: typeof rec.summary === 'string' ? rec.summary.slice(0, 300) : '',
      details: {},
      status: rec.status,
      rejection_reason: rec.rejection_reason,
    });
  }

  return items;
};

const extractTechnique = (obj: Record<string, unknown>): string | undefined => {
  const before = (obj.before as string) ?? '';
  const after = (obj.after as string) ?? '';
  const combined = `${before} ${after}`;
  const match = combined.match(/T\d{4}(?:\.\d{3})?/);
  return match?.[0];
};

/**
 * Derive the parent document status from sub-item decisions.
 * - All pending → pending
 * - All approved → approved
 * - All rejected → rejected
 * - Mix of approved/rejected (none pending) → approved (partial)
 * - Any applied → applied
 */
const deriveParentStatus = (
  subItems: Record<string, SubItemDecision>,
  totalCount: number
): RecommendationStatus => {
  const statuses = Object.values(subItems).map((s) => s.status);
  if (statuses.length === 0 || statuses.length < totalCount) return 'pending';
  if (statuses.every((s) => s === 'rejected')) return 'rejected';
  if (statuses.every((s) => s === 'approved')) return 'approved';
  if (statuses.every((s) => s === 'applied')) return 'applied';
  if (statuses.some((s) => s === 'pending')) return 'pending';
  return 'approved';
};

const esUpdateDoc = async (
  http: ReturnType<typeof useKibana>['services']['http'],
  index: string,
  docId: string,
  updates: Record<string, unknown>
): Promise<boolean> => {
  try {
    await http.post<unknown>(`/api/console/proxy`, {
      query: {
        path: `${index}/_update/${encodeURIComponent(docId)}?refresh=true`,
        method: 'POST',
      },
      body: JSON.stringify({ doc: updates }),
    });
    return true;
  } catch (_e) {
    return false;
  }
};

interface ExceptionEntry {
  field: string;
  operator: 'included' | 'excluded';
  type: 'match' | 'wildcard' | 'match_any' | 'exists';
  value: string | string[];
}

const KNOWN_FIELD_PREFIXES = [
  'process',
  'host',
  'user',
  'file',
  'source',
  'destination',
  'network',
  'event',
  'agent',
  'url',
  'dns',
  'http',
  'registry',
  'dll',
  'service',
  'cloud',
  'container',
  'rule',
  'threat',
];

const FIELD_PATTERN = new RegExp(
  `(?:${KNOWN_FIELD_PREFIXES.join('|')})\\.(?:[a-z_]+\\.)*[a-z_]+`,
  'gi'
);

const cleanValue = (raw: string): string =>
  raw
    .replace(/^[\[\("']+/, '')
    .replace(/[\]\)"']+$/, '')
    .trim();

/**
 * Parse a single `field:"value"` or `field:("a" OR "b")` condition into an ExceptionEntry.
 */
const parseCondition = (condition: string): ExceptionEntry | null => {
  const m = condition.match(FIELD_PATTERN);
  if (!m) return null;

  const field = m[0].toLowerCase();
  const rest = condition.slice((m.index ?? 0) + m[0].length);

  const opMatch = rest.match(/^\s*(?::|(?:is\s+not|IS\s+NOT|!=|<>)|(is|IS|=|:))\s*/);
  const isExcluded = opMatch?.[0] ? /is\s+not|IS\s+NOT|!=|<>/i.test(opMatch[0]) : false;
  const operator: 'included' | 'excluded' = isExcluded ? 'excluded' : 'included';
  const valueStr = opMatch ? rest.slice(opMatch[0].length).trim() : rest.trim();

  const quotedPattern = /["']([^"']+)["']/g;
  const quotedValues: string[] = [];
  let qm: RegExpExecArray | null;
  while ((qm = quotedPattern.exec(valueStr)) !== null) {
    const cleaned = cleanValue(qm[1]);
    if (cleaned) quotedValues.push(cleaned);
  }

  if (quotedValues.length === 0) {
    const bare = valueStr.match(/^([^\s,)"']+)/);
    if (bare) {
      const val = cleanValue(bare[1]);
      if (val)
        return { field, operator, type: val.includes('*') ? 'wildcard' : 'match', value: val };
    }
    return null;
  }
  if (quotedValues.length === 1) {
    const val = quotedValues[0];
    return { field, operator, type: val.includes('*') ? 'wildcard' : 'match', value: val };
  }
  if (quotedValues.some((v) => v.includes('*'))) {
    const first = quotedValues[0];
    return { field, operator, type: 'wildcard' as const, value: first };
  }
  return { field, operator, type: 'match_any', value: quotedValues };
};

/**
 * Split the "after" text into exception groups (one per `- Exception N …:` line or
 * top-level parenthesised clause) and parse each group's AND-separated conditions.
 * Returns an array of exception items — each item is an array of AND-ed entries.
 */
const parseExceptionGroups = (afterText: string): ExceptionEntry[][] => {
  const linePattern = /^[\s\-*]*(?:Exception\s+\d+[^:]*:\s*)?(.+)$/gm;
  const clauses: string[] = [];
  let lm: RegExpExecArray | null;
  while ((lm = linePattern.exec(afterText)) !== null) {
    const line = lm[1].trim();
    if (line.match(FIELD_PATTERN)) {
      clauses.push(line);
    }
  }

  if (clauses.length === 0) {
    const paren = afterText.match(/\(([^)]+)\)/g);
    if (paren) {
      for (const p of paren) {
        const inner = p.slice(1, -1).trim();
        if (inner.match(FIELD_PATTERN)) clauses.push(inner);
      }
    }
  }

  if (clauses.length === 0 && afterText.match(FIELD_PATTERN)) {
    clauses.push(afterText);
  }

  const groups: ExceptionEntry[][] = [];
  for (const clause of clauses) {
    const conditions = clause.split(/\s+AND\s+/i);
    const entries: ExceptionEntry[] = [];
    for (const cond of conditions) {
      const entry = parseCondition(cond.trim());
      if (entry) entries.push(entry);
    }
    if (entries.length > 0) groups.push(entries);
  }

  return groups;
};

const validateEntries = (entries: ExceptionEntry[]): { valid: boolean; error?: string } => {
  if (entries.length === 0) {
    return {
      valid: false,
      error: 'No exception entries could be parsed from the recommendation text',
    };
  }
  for (const entry of entries) {
    if (!entry.field || entry.field.trim().length === 0) {
      return { valid: false, error: `Invalid entry: empty field name` };
    }
    if (Array.isArray(entry.value)) {
      if (entry.value.length === 0) {
        return { valid: false, error: `Invalid entry for "${entry.field}": no values provided` };
      }
      for (const v of entry.value) {
        if (!v || v.trim().length === 0) {
          return {
            valid: false,
            error: `Invalid entry for "${entry.field}": contains empty value`,
          };
        }
      }
    } else if (!entry.value || entry.value.trim().length === 0) {
      return { valid: false, error: `Invalid entry for "${entry.field}": empty value` };
    }
  }
  return { valid: true };
};

const toApiEntries = (
  entries: ExceptionEntry[]
): Array<{ field: string; operator: string; type: string; value: string | string[] }> =>
  entries.map((e) => ({
    field: e.field,
    operator: e.operator,
    type: e.type,
    value: e.value,
  }));

const applyRuleException = async (
  http: ReturnType<typeof useKibana>['services']['http'],
  ruleId: string,
  name: string,
  description: string,
  entries: ExceptionEntry[],
  entryGroups?: ExceptionEntry[][]
): Promise<{ ok: boolean; error?: string }> => {
  const groups = entryGroups && entryGroups.length > 0 ? entryGroups : [entries];
  for (const g of groups) {
    const validation = validateEntries(g);
    if (!validation.valid) {
      return { ok: false, error: validation.error };
    }
  }
  try {
    await http.post(`/api/detection_engine/rules/${encodeURIComponent(ruleId)}/exceptions`, {
      version: '2023-10-31',
      body: JSON.stringify({
        items: groups.map((g, idx) => ({
          name: groups.length > 1 ? `${name} (${idx + 1})` : name,
          description,
          type: 'simple',
          entries: toApiEntries(g),
          tags: ['soc-simulation', 'auto-generated'],
        })),
      }),
    });
    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to create exception on rule: ${errMsg}` };
  }
};

const createRuleFromRecommendation = async (
  http: ReturnType<typeof useKibana>['services']['http'],
  details: Record<string, unknown>,
  enabled: boolean
): Promise<{ ok: boolean; ruleId?: string; error?: string }> => {
  const name = (details.name as string) ?? 'Auto-generated rule';
  const technique = (details.technique as string) ?? '';
  const query = (details.query as string) ?? `process.name: *`;
  const description =
    (details.description as string) ??
    `Auto-generated by Detection Engineering Agent for technique ${technique}`;
  const riskScore = (details.risk_score as number) ?? 50;
  const severity = (details.severity as string) ?? 'medium';
  const ruleId = (details.rule_id as string) ?? undefined;

  const threatMapping = technique
    ? [
        {
          framework: 'MITRE ATT&CK',
          tactic: {
            id: 'TA0007',
            name: 'Discovery',
            reference: 'https://attack.mitre.org/tactics/TA0007/',
          },
          technique: [
            {
              id: technique,
              name: technique,
              reference: `https://attack.mitre.org/techniques/${technique}/`,
            },
          ],
        },
      ]
    : [];

  try {
    const res = await http.post<{ id: string; rule_id: string }>(`/api/detection_engine/rules`, {
      version: '2023-10-31',
      body: JSON.stringify({
        type: 'query',
        language: 'kuery',
        query,
        name,
        description,
        risk_score: riskScore,
        severity,
        enabled,
        tags: ['soc-simulation', 'auto-generated'],
        ...(ruleId ? { rule_id: ruleId } : {}),
        index: ['.alerts-security.alerts-*', 'logs-*', 'endgame-*'],
        ...(threatMapping.length ? { threat: threatMapping } : {}),
      }),
    });
    return { ok: true, ruleId: res?.id ?? ruleId };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to create rule: ${errMsg}` };
  }
};

const enableRule = async (
  http: ReturnType<typeof useKibana>['services']['http'],
  ruleId: string
): Promise<{ ok: boolean; error?: string }> => {
  try {
    await http.fetch(`/api/detection_engine/rules`, {
      method: 'PATCH',
      version: '2023-10-31',
      body: JSON.stringify({ rule_id: ruleId, enabled: true }),
    });
    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to enable rule: ${errMsg}` };
  }
};

const patchRule = async (
  http: ReturnType<typeof useKibana>['services']['http'],
  ruleId: string,
  patchFields: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> => {
  try {
    await http.fetch(`/api/detection_engine/rules`, {
      method: 'PATCH',
      version: '2023-10-31',
      body: JSON.stringify({ rule_id: ruleId, ...patchFields }),
    });
    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to patch rule: ${errMsg}` };
  }
};

const deleteRule = async (
  http: ReturnType<typeof useKibana>['services']['http'],
  ruleId: string
): Promise<{ ok: boolean; error?: string }> => {
  try {
    await http.fetch(`/api/detection_engine/rules`, {
      method: 'DELETE',
      version: '2023-10-31',
      query: { rule_id: ruleId },
    });
    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to delete rule: ${errMsg}` };
  }
};

export const useSocData = (
  autoRefreshMs = AUTO_REFRESH_MS
): {
  data: SocData;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  approveRecommendation: (docId: string) => Promise<boolean>;
  rejectRecommendation: (docId: string, reason: string) => Promise<boolean>;
  revokeRecommendation: (docId: string) => Promise<boolean>;
  approveSubItem: (docId: string, subIndex: number, totalCount: number) => Promise<boolean>;
  approveAndApplySubItem: (
    docId: string,
    subIndex: number,
    totalCount: number
  ) => Promise<{ ok: boolean; error?: string }>;
  rejectSubItem: (
    docId: string,
    subIndex: number,
    totalCount: number,
    reason: string
  ) => Promise<boolean>;
  revokeSubItem: (docId: string, subIndex: number, totalCount: number) => Promise<boolean>;
  createEnableRuleAndApprove: (
    docId: string,
    subIndex: number,
    totalCount: number,
    details: Record<string, unknown>
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteRuleAndReject: (
    docId: string,
    subIndex: number,
    totalCount: number,
    ruleId: string,
    reason: string
  ) => Promise<{ ok: boolean; error?: string }>;
} => {
  const { services } = useKibana();
  const [data, setData] = useState<SocData>(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;

    const markComplete = () => {
      fetchingRef.current = false;
    };

    fetchingRef.current = true;

    try {
      const { http } = services;

      const latestQuery = (index: string, size = 25) =>
        esRawSearch(http, index, {
          size,
          sort: [{ '@timestamp': { order: 'desc' } }],
          track_total_hits: true,
        });

      const [
        triageWithAggs,
        outcomesWithAggs,
        recommendationsWithAggs,
        responseCounts,
        coverageLatest,
        evolutionLatest,
        responseLatest,
        auditLatest,
        coverageCounts,
        evolutionCounts,
        auditCounts,
        investigationCounts,
        triageTodayDocs,
        metricsLatest,
        trustScoresLatest,
        reasoningLatest,
      ] = await Promise.all([
        esRawSearch(http, '.soc-triage-results', {
          size: 50,
          sort: [{ '@timestamp': { order: 'desc' } }],
          track_total_hits: true,
          aggs: {
            timeline: { date_histogram: { field: '@timestamp', calendar_interval: 'hour' } },
            agents: { terms: { field: 'source', size: 20 } },
          },
        }),
        esRawSearch(http, '.soc-outcomes', {
          size: 30,
          sort: [{ '@timestamp': { order: 'desc' } }],
          track_total_hits: true,
          aggs: {
            timeline: { date_histogram: { field: '@timestamp', calendar_interval: 'hour' } },
            dispositions: { terms: { field: 'disposition', size: 20 } },
          },
        }),
        esRawSearch(http, '.soc-recommendations', {
          size: 50,
          sort: [{ '@timestamp': { order: 'desc' } }],
          track_total_hits: true,
          aggs: {
            statuses: { terms: { field: 'status', size: 10 } },
          },
        }),
        esRawSearch(http, '.soc-response-actions', { size: 0, track_total_hits: true }),
        latestQuery('.soc-coverage-gaps', 30),
        latestQuery('.soc-evolution-log', 40),
        latestQuery('.soc-response-actions', 30),
        latestQuery('.soc-audit-trail', 40),
        esRawSearch(http, '.soc-coverage-gaps', { size: 0, track_total_hits: true }),
        esRawSearch(http, '.soc-evolution-log', { size: 0, track_total_hits: true }),
        esRawSearch(http, '.soc-audit-trail', { size: 0, track_total_hits: true }),
        esRawSearch(http, '.soc-hunt-findings', { size: 0, track_total_hits: true }),
        esRawSearch(http, '.soc-triage-results', {
          size: 0,
          query: { range: { '@timestamp': { gte: 'now/d', lte: 'now' } } },
          track_total_hits: true,
        }),
        latestQuery('.soc-metrics', 50),
        latestQuery('.soc-trust-scores', 5),
        // Reasoning trace: newest 500 steps across all runs. Index may not
        // exist yet on older clusters; esRawSearch swallows 404 silently.
        latestQuery('.soc-reasoning-trace', 500),
      ]);

      const totalTriageDocs = extractTotal(triageWithAggs);

      const rawTriageDocs = extractHits<TriageDocRaw>(triageWithAggs);
      const allClassifications = parseTriageClassifications(rawTriageDocs);
      const totalClassifications = allClassifications.length;

      const classificationBreakdown = computeBreakdown(allClassifications, (c) => c.classification);
      const techniqueBreakdown = computeBreakdown(allClassifications, (c) => c.mitre_techniques);

      const fpCount = classificationBreakdown
        .filter((d) => d.key === 'FALSE_POSITIVE' || d.key === 'BENIGN')
        .reduce((sum, d) => sum + d.doc_count, 0);
      const tpCount = classificationBreakdown
        .filter((d) => d.key === 'TRUE_POSITIVE')
        .reduce((sum, d) => sum + d.doc_count, 0);
      const suspiciousCount = classificationBreakdown
        .filter((d) => d.key === 'SUSPICIOUS')
        .reduce((sum, d) => sum + d.doc_count, 0);

      const automatedCount = fpCount + suspiciousCount;
      const automationRate =
        totalClassifications > 0 ? (automatedCount / totalClassifications) * 100 : 0;

      const confidences = allClassifications
        .map((c) => c.confidence)
        .filter((c): c is number => c != null);
      const avgConfidence =
        confidences.length > 0
          ? Math.round(confidences.reduce((sum, c) => sum + c, 0) / confidences.length)
          : null;

      const outcomeDispositions = extractBuckets(outcomesWithAggs, 'dispositions');
      const casesCreated =
        outcomeDispositions
          .filter((d) => d.key === 'case_created')
          .reduce((sum, d) => sum + d.doc_count, 0) || extractTotal(outcomesWithAggs);

      const todayDocCount = extractTotal(triageTodayDocs);
      const rawTodayDocs = extractHits<TriageDocRaw>(triageTodayDocs);
      const todayClassifications = parseTriageClassifications(rawTodayDocs);

      const rawCoverageGaps = extractHits<CoverageGapRaw>(coverageLatest);
      const parsedCoverageGaps = rawCoverageGaps.map(parseCoverageGap);

      const latestCoverage = parsedCoverageGaps[0];
      const agentsActive = latestCoverage
        ? latestCoverage.agents.filter(
            (a) => a.status === 'running' || a.status === 'healthy' || a.status === 'active'
          ).length
        : 0;
      const agentsDegraded = latestCoverage
        ? latestCoverage.agents.filter(
            (a) => a.status === 'degraded' || a.status === 'error' || a.status === 'failed'
          ).length
        : 0;

      const kpis: SocKPIs = {
        automationRate: Math.min(Math.round(automationRate), 100),
        falsePositiveRate:
          totalClassifications > 0 ? Math.round((fpCount / totalClassifications) * 100) : 0,
        truePositiveRate:
          totalClassifications > 0 ? Math.round((tpCount / totalClassifications) * 100) : 0,
        suspiciousRate:
          totalClassifications > 0 ? Math.round((suspiciousCount / totalClassifications) * 100) : 0,
        avgConfidence,
        alertsProcessedToday: todayClassifications.length || todayDocCount,
        alertsProcessedTotal: totalTriageDocs,
        totalClassifications,
        casesCreated,
        agentsActive,
        agentsDegraded,
      };

      const recHits =
        (
          recommendationsWithAggs?.hits as {
            hits?: Array<{ _id: string; _source: Omit<Recommendation, '_id'> }>;
          }
        )?.hits ?? [];
      const parsedRecommendations: Recommendation[] = recHits.map((h) => ({
        _id: h._id,
        ...h._source,
      }));

      const allFlatRecs: FlatRecommendation[] = [];
      for (const rec of parsedRecommendations) {
        allFlatRecs.push(...flattenRecommendation(rec));
      }

      const recCounts: RecommendationCounts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        applied: 0,
        failed: 0,
        total: 0,
      };
      for (const flat of allFlatRecs) {
        recCounts.total++;
        const s = flat.status;
        if (s === 'pending') recCounts.pending++;
        else if (s === 'approved') recCounts.approved++;
        else if (s === 'rejected') recCounts.rejected++;
        else if (s === 'applied') recCounts.applied++;
        else if (s === 'failed') recCounts.failed++;
      }

      const evolutionHits =
        (
          evolutionLatest?.hits as {
            hits?: Array<{ _id: string; _source: EvolutionEventRaw }>;
          }
        )?.hits ?? [];
      const parsedEvolution = evolutionHits.map((h) => parseEvolutionEvent(h._source, h._id));

      const timelineDataResult = extractBuckets(triageWithAggs, 'timeline');
      const outcomeTimelineResult = extractBuckets(outcomesWithAggs, 'timeline');

      const rawMetrics = extractHits<PipelineMetric>(metricsLatest);
      const totalCycles = rawMetrics.length;
      const successfulCycles = rawMetrics.filter((m) => m.status === 'success').length;
      const failedCycles = rawMetrics.filter(
        (m) => m.status === 'error' || m.status === 'failure'
      ).length;
      const skippedCycles = rawMetrics.filter((m) => (m.status ?? '').startsWith('skipped')).length;
      // Average alerts per *executed* cycle — skipped cycles carry 0 and would
      // otherwise deflate the average to near-zero on idle systems.
      const executedCycles = successfulCycles + failedCycles;
      const alertsSum = rawMetrics
        .filter((m) => !(m.status ?? '').startsWith('skipped'))
        .reduce((sum, m) => sum + (m.alerts_processed ?? 0), 0);
      const avgAlertsPerCycle = executedCycles > 0 ? Math.round(alertsSum / executedCycles) : 0;

      const rawTrustDocs = extractHits<{ scores?: string }>(trustScoresLatest);
      const trustScores: TrustScore[] = [];
      for (const doc of rawTrustDocs) {
        const parsed = parseJsonField(doc.scores);
        if (Array.isArray(parsed)) {
          for (const ts of parsed as TrustScore[]) {
            trustScores.push(ts);
          }
          break;
        }
      }

      const systemHealth: SystemHealth = {
        metrics: rawMetrics,
        trustScores,
        totalCycles,
        successfulCycles,
        failedCycles,
        skippedCycles,
        avgAlertsPerCycle,
        pipelineSuccessRate:
          executedCycles > 0 ? Math.round((successfulCycles / executedCycles) * 100) : 0,
      };

      setData({
        kpis,
        triageClassifications: allClassifications,
        outcomes: extractHits<OutcomeRecord>(outcomesWithAggs),
        coverageGaps: parsedCoverageGaps,
        evolutionEvents: parsedEvolution,
        responseActions: extractHits<ResponseActionRaw>(responseLatest).map(parseResponseAction),
        auditTrail: extractHits<AuditEntry>(auditLatest),
        reasoningTraces: extractHits<ReasoningTraceStep>(reasoningLatest),
        recommendations: parsedRecommendations,
        flatRecommendations: allFlatRecs,
        recommendationCounts: recCounts,
        systemHealth,
        classificationBreakdown,
        techniqueBreakdown,
        agentWorkload: extractBuckets(triageWithAggs, 'agents'),
        timelineData: timelineDataResult as Array<{
          key_as_string: string;
          doc_count: number;
        }>,
        outcomeTimeline: outcomeTimelineResult as Array<{
          key_as_string: string;
          doc_count: number;
        }>,
        outcomeDispositions,
        counts: {
          triageDocs: totalTriageDocs,
          outcomes: extractTotal(outcomesWithAggs),
          responseActions: extractTotal(responseCounts),
          coverageGaps: extractTotal(coverageCounts),
          evolution: extractTotal(evolutionCounts),
          audit: extractTotal(auditCounts),
          investigations: extractTotal(investigationCounts),
        },
      });
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown fetch error');
    } finally {
      setLoading(false);
      markComplete();
    }
  }, [services]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, autoRefreshMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      fetchingRef.current = false;
    };
  }, [fetchData, autoRefreshMs]);

  const approveRecommendation = useCallback(
    async (docId: string): Promise<boolean> => {
      const { http } = services;
      const now = new Date().toISOString();
      const ok = await esUpdateDoc(http, '.soc-recommendations', docId, {
        status: 'approved',
        reviewed_by: 'soc-analyst',
        reviewed_at: now,
        review_decision: 'approved',
      });
      if (ok) fetchData();
      return ok;
    },
    [services, fetchData]
  );

  const rejectRecommendation = useCallback(
    async (docId: string, reason: string): Promise<boolean> => {
      const { http } = services;
      const now = new Date().toISOString();
      const ok = await esUpdateDoc(http, '.soc-recommendations', docId, {
        status: 'rejected',
        reviewed_by: 'soc-analyst',
        reviewed_at: now,
        review_decision: 'rejected',
        rejection_reason: reason,
      });
      if (ok) fetchData();
      return ok;
    },
    [services, fetchData]
  );

  const revokeRecommendation = useCallback(
    async (docId: string): Promise<boolean> => {
      const { http } = services;
      const ok = await esUpdateDoc(http, '.soc-recommendations', docId, {
        status: 'pending',
        reviewed_by: '',
        review_decision: '',
        rejection_reason: '',
        sub_items: {},
      });
      if (ok) fetchData();
      return ok;
    },
    [services, fetchData]
  );

  const updateSubItem = useCallback(
    async (
      docId: string,
      subIndex: number,
      totalCount: number,
      decision: SubItemDecision
    ): Promise<boolean> => {
      const { http } = services;
      const rec = data.recommendations.find((r) => r._id === docId);
      const existing = rec?.sub_items ?? {};
      const updated = { ...existing, [String(subIndex)]: decision };
      const parentStatus = deriveParentStatus(updated, totalCount);
      const now = new Date().toISOString();
      const ok = await esUpdateDoc(http, '.soc-recommendations', docId, {
        sub_items: updated,
        status: parentStatus,
        reviewed_by: 'soc-analyst',
        reviewed_at: now,
      });
      if (ok) fetchData();
      return ok;
    },
    [services, data.recommendations, fetchData]
  );

  const approveSubItem = useCallback(
    async (docId: string, subIndex: number, totalCount: number): Promise<boolean> =>
      updateSubItem(docId, subIndex, totalCount, {
        status: 'approved',
        reviewed_at: new Date().toISOString(),
      }),
    [updateSubItem]
  );

  const approveAndApplySubItem = useCallback(
    async (
      docId: string,
      subIndex: number,
      totalCount: number
    ): Promise<{ ok: boolean; error?: string }> => {
      const { http } = services;
      const rec = data.recommendations.find((r) => r._id === docId);
      if (!rec) return { ok: false, error: 'Recommendation not found' };

      const flat = data.flatRecommendations.find(
        (f) => f.parentId === docId && f.subIndex === subIndex
      );
      if (!flat) return { ok: false, error: 'Sub-item not found' };

      if (flat.category === 'rule_tuning' && flat.ruleId) {
        const action = (flat.details.action as string) ?? '';

        if (
          action === 'add_exception' ||
          action === 'update_exception' ||
          action === 'modify_exception'
        ) {
          const afterText = (flat.details.after as string) ?? flat.description;
          const groups = parseExceptionGroups(afterText);
          const entries = groups.flat();
          const result = await applyRuleException(
            http,
            flat.ruleId,
            `Auto-applied: ${flat.title}`,
            `Applied via SOC Dashboard recommendation. ${flat.description.slice(0, 200)}`,
            entries,
            groups
          );
          if (result.ok) {
            await updateSubItem(docId, subIndex, totalCount, {
              status: 'applied',
              reviewed_at: new Date().toISOString(),
            });
            return { ok: true };
          }
          return result;
        }

        if (action === 'raise_threshold' || action === 'lower_threshold') {
          const patchFields: Record<string, unknown> = {
            ...((flat.details.patch_fields as Record<string, unknown>) ?? {}),
          };
          if (Object.keys(patchFields).length === 0) {
            const afterValue = flat.details.after;
            if (typeof afterValue === 'number') {
              patchFields.risk_score = afterValue;
            } else if (typeof afterValue === 'string' && /^\d+$/.test(afterValue.trim())) {
              patchFields.risk_score = parseInt(afterValue.trim(), 10);
            }
            if (flat.details.query && typeof flat.details.query === 'string') {
              patchFields.query = flat.details.query;
            }
            if (flat.details.risk_score && typeof flat.details.risk_score === 'number') {
              patchFields.risk_score = flat.details.risk_score;
            }
            if (flat.details.severity && typeof flat.details.severity === 'string') {
              patchFields.severity = flat.details.severity;
            }
          }
          if (Object.keys(patchFields).length === 0) {
            return {
              ok: false,
              error:
                'No patch_fields found in this recommendation. ' +
                'The Detection Engineering agent needs to include explicit patch_fields ' +
                'for threshold changes to be auto-applied.',
            };
          }
          const result = await patchRule(http, flat.ruleId, patchFields);
          if (result.ok) {
            await updateSubItem(docId, subIndex, totalCount, {
              status: 'applied',
              reviewed_at: new Date().toISOString(),
            });
            return { ok: true };
          }
          return result;
        }
      }

      const approved = await updateSubItem(docId, subIndex, totalCount, {
        status: 'approved',
        reviewed_at: new Date().toISOString(),
      });
      return { ok: approved, error: approved ? undefined : 'Failed to approve' };
    },
    [services, data.recommendations, data.flatRecommendations, updateSubItem]
  );

  const rejectSubItem = useCallback(
    async (docId: string, subIndex: number, totalCount: number, reason: string): Promise<boolean> =>
      updateSubItem(docId, subIndex, totalCount, {
        status: 'rejected',
        rejection_reason: reason,
        reviewed_at: new Date().toISOString(),
      }),
    [updateSubItem]
  );

  const revokeSubItem = useCallback(
    async (docId: string, subIndex: number, totalCount: number): Promise<boolean> =>
      updateSubItem(docId, subIndex, totalCount, {
        status: 'pending',
        reviewed_at: new Date().toISOString(),
      }),
    [updateSubItem]
  );

  const createEnableRuleAndApprove = useCallback(
    async (
      docId: string,
      subIndex: number,
      totalCount: number,
      details: Record<string, unknown>,
      ruleIdOverride?: string
    ): Promise<{ ok: boolean; error?: string }> => {
      const ruleId = ruleIdOverride ?? (details.rule_id as string | undefined);

      if (ruleId) {
        const enableResult = await enableRule(services.http, ruleId);
        if (enableResult.ok) {
          await updateSubItem(docId, subIndex, totalCount, {
            status: 'applied',
            reviewed_at: new Date().toISOString(),
          });
          return { ok: true };
        }
      }

      const createResult = await createRuleFromRecommendation(services.http, details, true);
      if (!createResult.ok) return createResult;

      await updateSubItem(docId, subIndex, totalCount, {
        status: 'applied',
        reviewed_at: new Date().toISOString(),
      });
      return { ok: true };
    },
    [services.http, updateSubItem]
  );

  const deleteRuleAndReject = useCallback(
    async (
      docId: string,
      subIndex: number,
      totalCount: number,
      ruleId: string,
      reason: string
    ): Promise<{ ok: boolean; error?: string }> => {
      const result = await deleteRule(services.http, ruleId);
      if (!result.ok) return result;
      await updateSubItem(docId, subIndex, totalCount, {
        status: 'rejected',
        rejection_reason: reason,
        reviewed_at: new Date().toISOString(),
      });
      return { ok: true };
    },
    [services.http, updateSubItem]
  );

  return {
    data,
    loading,
    error,
    lastUpdated,
    approveRecommendation,
    rejectRecommendation,
    revokeRecommendation,
    approveSubItem,
    approveAndApplySubItem,
    rejectSubItem,
    revokeSubItem,
    createEnableRuleAndApprove,
    deleteRuleAndReject,
  };
};
