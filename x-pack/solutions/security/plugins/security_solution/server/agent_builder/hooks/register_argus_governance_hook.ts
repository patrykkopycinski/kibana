/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { HookExecutionMode, HookLifecycle } from '@kbn/agent-builder-common';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-plugin/server';
import type { BeforeToolCallHookContext } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import type { ExperimentalFeatures } from '../../../common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../plugin_contract';
import { SECURITY_CREATE_DETECTION_RULE_TOOL_ID } from '../tools/create_detection_rule_tool';
import {
  ARGUS_APPROVE_REJECT_MUTATION_TOOL_ID,
  ARGUS_FILE_MUTATION_INTENT_TOOL_ID,
  ARGUS_RUN_BACKTEST_TOOL_ID,
  ARGUS_TOGGLE_KILL_SWITCH_TOOL_ID,
} from '../tools/argus_playbooks/constants';

/** Must match `consts.daily_budget_all` in soc-simulation/workflows/soc-autonomous-applier.yaml */
const DAILY_MUTATION_BUDGET = 50;

/** Must match `consts.cooldown_seconds` in soc-simulation/workflows/soc-autonomous-applier.yaml */
const COOLDOWN_SECONDS = 900;

const KILL_SWITCH_INDEX = '.soc-kill-switch';
const TRUST_SCORES_INDEX = '.soc-trust-scores';
const AUTONOMY_DECISIONS_INDEX = '.soc-autonomy-decisions';
const EVOLUTION_LOG_INDEX = '.soc-evolution-log';
const AUDIT_TRAIL_INDEX = '.soc-audit-trail';

/**
 * Tools that materially mutate ARGUS / detection state. Read-only ARGUS tools
 * (coverage summaries, navigator export, etc.) are intentionally excluded.
 */
const GOVERNED_MUTATION_TOOL_IDS: ReadonlySet<string> = new Set([
  SECURITY_CREATE_DETECTION_RULE_TOOL_ID,
  ARGUS_FILE_MUTATION_INTENT_TOOL_ID,
  ARGUS_APPROVE_REJECT_MUTATION_TOOL_ID,
  ARGUS_RUN_BACKTEST_TOOL_ID,
]);

/**
 * Break-glass: must remain callable even when autonomy is off so operators can
 * re-enable the kill switch without a cluster config change.
 */
const BYPASS_ALL_GOVERNANCE_TOOLS: ReadonlySet<string> = new Set([
  ARGUS_TOGGLE_KILL_SWITCH_TOOL_ID,
]);

export interface RegisterArgusGovernanceHookDeps {
  logger: Logger;
  experimentalFeatures: ExperimentalFeatures;
  getStartServices: SecuritySolutionPluginCoreSetupDependencies['getStartServices'];
}

function isGovernedSecurityTool(toolId: string): boolean {
  if (!toolId.startsWith('security.')) {
    return false;
  }
  if (BYPASS_ALL_GOVERNANCE_TOOLS.has(toolId)) {
    return false;
  }
  return GOVERNED_MUTATION_TOOL_IDS.has(toolId);
}

function extractArtifactId(toolParams: Record<string, unknown>): string | undefined {
  const details = toolParams.details;
  if (details && typeof details === 'object' && details !== null && 'artifact_id' in details) {
    const v = (details as { artifact_id?: unknown }).artifact_id;
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  }
  const ruleId = toolParams.rule_id;
  if (typeof ruleId === 'string' && ruleId.length > 0) {
    return ruleId;
  }
  return undefined;
}

async function readKillSwitchActive(es: {
  search: (params: Record<string, unknown>) => Promise<{ hits: { hits: Array<{ _source?: unknown }> } }>;
}): Promise<{ active: boolean; reason?: string }> {
  const res = await es.search({
    index: KILL_SWITCH_INDEX,
    size: 1,
    query: { term: { scope: 'global' } },
    sort: [{ '@timestamp': { order: 'desc' } }],
    _source: ['autonomy_enabled', 'reason'],
  });
  const src = res.hits.hits[0]?._source as
    | { autonomy_enabled?: boolean; reason?: string }
    | undefined;
  if (!src) {
    return { active: false };
  }
  return {
    active: src.autonomy_enabled === false,
    reason: src.reason,
  };
}

async function readTrustGateFailure(
  es: {
    search: (params: Record<string, unknown>) => Promise<{ hits: { hits: Array<{ _source?: unknown }> } }>;
  },
  agentId: string | undefined
): Promise<string | undefined> {
  const minTrust = 0.72;
  if (agentId) {
    const res = await es.search({
      index: TRUST_SCORES_INDEX,
      size: 1,
      query: {
        bool: {
          filter: [{ term: { scope: 'per_agent' } }, { term: { agent_id: agentId } }],
        },
      },
      sort: [{ '@timestamp': { order: 'desc' } }],
      _source: ['trust_score', 'confidence_threshold', 'trust_tier'],
    });
    const hit = res.hits.hits[0]?._source as
      | {
          trust_score?: number;
          confidence_threshold?: number;
          trust_tier?: string;
        }
      | undefined;
    if (!hit || typeof hit.trust_score !== 'number') {
      // Fail-open when no row exists yet (fresh cluster / unseeded demo).
      return undefined;
    }
    const threshold =
      typeof hit.confidence_threshold === 'number' ? hit.confidence_threshold : minTrust;
    if (hit.trust_score < threshold) {
      return `trust_scores: trust_score ${hit.trust_score} is below required threshold ${threshold} (tier=${hit.trust_tier ?? 'unknown'})`;
    }
    return undefined;
  }

  const aggRes = await es.search({
    index: TRUST_SCORES_INDEX,
    size: 1,
    query: { term: { scope: 'legacy_aggregate' } },
    sort: [{ '@timestamp': { order: 'desc' } }],
    _source: ['approval_rate', 'auto_approve_eligible', 'tier'],
  });
  const src = aggRes.hits.hits[0]?._source as
    | { approval_rate?: number; auto_approve_eligible?: boolean; tier?: string }
    | undefined;
  if (src?.auto_approve_eligible === false && (src.approval_rate ?? 0) < 0.75) {
    return `trust_scores: aggregate auto_approve_eligible=false and approval_rate ${String(src.approval_rate)} below 0.75 (tier=${src.tier ?? 'unknown'})`;
  }
  return undefined;
}

async function readBudgetCooldownFailure(
  es: {
    search: (params: Record<string, unknown>) => Promise<{
      hits?: { hits?: unknown[]; total?: number | { value: number } };
      aggregations?: { applied_24h?: { value?: number } };
    }>;
  },
  artifactId: string | undefined
): Promise<string | undefined> {
  const budgetRes = await es.search({
    index: EVOLUTION_LOG_INDEX,
    size: 0,
    query: {
      bool: {
        filter: [
          { term: { source: 'soc-autonomous-applier' } },
          { term: { result: 'applied' } },
          { range: { '@timestamp': { gte: 'now-24h' } } },
        ],
      },
    },
    aggs: {
      applied_24h: { value_count: { field: 'artifact_id' } },
    },
  });
  const used =
    typeof budgetRes.aggregations?.applied_24h?.value === 'number'
      ? budgetRes.aggregations.applied_24h.value
      : 0;
  if (used >= DAILY_MUTATION_BUDGET) {
    return `budget: global 24h mutation budget exhausted (${used}/${DAILY_MUTATION_BUDGET} applied)`;
  }

  const decisionsRes = await es.search({
    index: AUTONOMY_DECISIONS_INDEX,
    size: 1,
    query: {
      bool: {
        filter: [
          { range: { '@timestamp': { gte: 'now-1h' } } },
          { terms: { first_failing_gate: ['budget', 'cooldown'] } },
        ],
      },
    },
    sort: [{ '@timestamp': { order: 'desc' } }],
    _source: ['first_failing_gate', 'final_status', 'source_agent', 'review_reason'],
  });
  const decisionHits = decisionsRes.hits?.hits;
  if (Array.isArray(decisionHits) && decisionHits.length > 0) {
    const d = (decisionHits[0] as { _source?: unknown })._source as {
      first_failing_gate?: string;
      final_status?: string;
      review_reason?: string;
    };
    return `autonomy_decisions: recent gate failure (${d.first_failing_gate ?? d.final_status ?? 'unknown'}; ${d.review_reason ?? 'no reason'})`;
  }

  if (artifactId) {
    const coolRes = await es.search({
      index: EVOLUTION_LOG_INDEX,
      size: 0,
      track_total_hits: true,
      query: {
        bool: {
          filter: [
            { term: { source: 'soc-autonomous-applier' } },
            { term: { result: 'applied' } },
            { term: { artifact_id: artifactId } },
            { range: { '@timestamp': { gte: `now-${COOLDOWN_SECONDS}s` } } },
          ],
        },
      },
    });
    const total = coolRes.hits?.total;
    const n = typeof total === 'number' ? total : total?.value ?? 0;
    if (n >= 1) {
      return `cooldown: artifact "${artifactId}" was mutated within the last ${COOLDOWN_SECONDS}s`;
    }
  }

  return undefined;
}

async function appendAuditTrail(
  es: {
    index: (params: Record<string, unknown>) => Promise<unknown>;
  },
  doc: Record<string, unknown>
): Promise<void> {
  await es.index({
    index: AUDIT_TRAIL_INDEX,
    document: {
      '@timestamp': new Date().toISOString(),
      event_type: 'argus_agent_builder_governance',
      source: 'agent_builder_argus_governance',
      pipeline: 'security_solution',
      ...doc,
    },
    refresh: false,
  });
}

export function registerArgusGovernanceHook(
  agentBuilder: AgentBuilderPluginSetup,
  deps: RegisterArgusGovernanceHookDeps
): void {
  if (!deps.experimentalFeatures.argusConsoleEnabled) {
    deps.logger.debug('ARGUS governance hook skipped: argusConsoleEnabled is off');
    return;
  }

  const logger = deps.logger.get('argusGovernanceHook');

  agentBuilder.hooks.register({
    id: 'argus-governance',
    priority: 120,
    hooks: {
      [HookLifecycle.beforeToolCall]: {
        mode: HookExecutionMode.blocking,
        handler: async (context: BeforeToolCallHookContext) => {
          const { toolId, toolParams, request, agentId } = context;

          if (!isGovernedSecurityTool(toolId)) {
            return;
          }

          const [{ elasticsearch }] = await deps.getStartServices();
          const esClient = elasticsearch.client.asScoped(request).asCurrentUser;

          let kill: { active: boolean; reason?: string } = { active: false };
          try {
            kill = await readKillSwitchActive(esClient);
          } catch (err) {
            logger.warn(`ARGUS governance kill-switch read failed (fail-open): ${String(err)}`);
          }

          let trustFail: string | undefined;
          try {
            trustFail = await readTrustGateFailure(esClient, agentId);
          } catch (err) {
            logger.warn(
              `ARGUS governance trust read failed (fail-open, treating as minimal/unrestricted): ${String(
                err
              )}`
            );
          }

          const artifactId = extractArtifactId(toolParams);

          let budgetCooldownFail: string | undefined;
          try {
            budgetCooldownFail = await readBudgetCooldownFailure(esClient, artifactId);
          } catch (err) {
            logger.warn(`ARGUS governance budget/cooldown read failed (fail-open): ${String(err)}`);
          }

          const gateFailure =
            kill.active
              ? `kill_switch: autonomy is disabled (${kill.reason ?? 'no reason given'})`
              : trustFail ?? budgetCooldownFail;

          try {
            await appendAuditTrail(esClient, {
              status: gateFailure ? 'blocked' : 'pass',
              action: 'before_tool_call',
              agent_name: agentId,
              details: {
                tool_id: toolId,
                gate_failed: gateFailure,
                checks: {
                  kill_switch_active: kill.active,
                  trust_failed: Boolean(trustFail),
                  budget_or_cooldown_failed: Boolean(budgetCooldownFail),
                },
              },
            });
          } catch (err) {
            logger.warn(`Failed to write governance audit row: ${String(err)}`);
          }

          if (gateFailure) {
            throw new Error(`ARGUS governance blocked this tool call (${toolId}): ${gateFailure}`);
          }
        },
      },
    },
  });
}
