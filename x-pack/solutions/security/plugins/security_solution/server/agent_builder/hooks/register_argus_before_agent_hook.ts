/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { HookExecutionMode, HookLifecycle } from '@kbn/agent-builder-common';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-plugin/server';
import type { BeforeAgentHookContext, ProcessedRoundInput } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import type { ExperimentalFeatures } from '../../../common';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../plugin_contract';

/** Must match `consts.daily_budget_all` in soc-simulation/workflows/soc-autonomous-applier.yaml */
const DAILY_MUTATION_BUDGET = 50;

const KILL_SWITCH_INDEX = '.soc-kill-switch';
const TRUST_SCORES_INDEX = '.soc-trust-scores';
const EVOLUTION_LOG_INDEX = '.soc-evolution-log';
const SHIFT_HANDOVER_INDEX = '.soc-shift-handover';
const AUTONOMY_DECISIONS_INDEX = '.soc-autonomy-decisions';

const ARGUS_SKILL_SUBSTRINGS: readonly string[] = [
  '/skills/security/argus',
  'skills/security/argus',
  'argus-explain-decision',
  'argus-assess-readiness',
  'argus-emulate-actor',
  'argus-run-purple-team',
  'argus-assess-cve',
  'argus-find-datasource-gaps',
  'argus-review-rule-quality',
  'security.argus.',
  'soc-attack-chain-analysis',
  'soc-containment-playbook',
  'soc-health-check',
  'soc-mutation-planning',
  'SOC Attack Chain Analysis',
  'SOC Containment Playbook',
  'SOC Health Check',
];

export interface RegisterArgusBeforeAgentHookDeps {
  logger: Logger;
  experimentalFeatures: ExperimentalFeatures;
  getStartServices: SecuritySolutionPluginCoreSetupDependencies['getStartServices'];
}

const collectRoundText = (nextInput: ProcessedRoundInput): string => {
  const fromAttachments = nextInput.attachments
    .map((a) => (a.representation.type === 'text' ? a.representation.value : ''))
    .join('\n');
  return `${nextInput.message}\n${fromAttachments}`;
};

const nextInputSuggestsArgusSkills = (
  nextInput: ProcessedRoundInput,
  agentId: string | undefined
) => {
  if (agentId?.toLowerCase().includes('argus')) {
    return true;
  }
  const blob = collectRoundText(nextInput).toLowerCase();
  return ARGUS_SKILL_SUBSTRINGS.some((s) => blob.includes(s.toLowerCase()));
};

const readKillSwitchSummary = async (es: {
  search: (
    params: Record<string, unknown>
  ) => Promise<{ hits: { hits: Array<{ _source?: unknown }> } }>;
}): Promise<{ autonomyEnabled: boolean; reason?: string }> => {
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
    return { autonomyEnabled: true };
  }
  return {
    autonomyEnabled: src.autonomy_enabled !== false,
    reason: src.reason,
  };
};

const readTrustTierSummary = async (
  es: {
    search: (
      params: Record<string, unknown>
    ) => Promise<{ hits: { hits: Array<{ _source?: unknown }> } }>;
  },
  agentId: string | undefined
): Promise<string> => {
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
      _source: ['trust_score', 'trust_tier', 'confidence_threshold'],
    });
    const hit = res.hits.hits[0]?._source as
      | { trust_score?: number; trust_tier?: string; confidence_threshold?: number }
      | undefined;
    if (hit && typeof hit.trust_score === 'number') {
      return `per_agent: tier=${hit.trust_tier ?? 'unknown'}, trust_score=${
        hit.trust_score
      }, threshold=${hit.confidence_threshold ?? 'default'}`;
    }
  }
  const aggRes = await es.search({
    index: TRUST_SCORES_INDEX,
    size: 1,
    query: { term: { scope: 'legacy_aggregate' } },
    sort: [{ '@timestamp': { order: 'desc' } }],
    _source: ['tier', 'approval_rate', 'auto_approve_eligible'],
  });
  const src = aggRes.hits.hits[0]?._source as
    | { tier?: string; approval_rate?: number; auto_approve_eligible?: boolean }
    | undefined;
  if (!src) {
    return 'no trust score documents found (fail-open)';
  }
  return `aggregate: tier=${src.tier ?? 'unknown'}, approval_rate=${String(
    src.approval_rate
  )}, auto_approve_eligible=${String(src.auto_approve_eligible)}`;
};

const readBudgetRemaining = async (es: {
  search: (params: Record<string, unknown>) => Promise<{
    aggregations?: { applied_24h?: { value?: number } };
  }>;
}): Promise<{ used: number; remaining: number }> => {
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
  return { used, remaining: Math.max(0, DAILY_MUTATION_BUDGET - used) };
};

const readGovernancePolicySummary = async (es: {
  search: (
    params: Record<string, unknown>
  ) => Promise<{ hits: { hits: Array<{ _source?: unknown }> } }>;
}): Promise<string> => {
  const handover = await es.search({
    index: SHIFT_HANDOVER_INDEX,
    size: 1,
    sort: [{ '@timestamp': { order: 'desc' } }],
    _source: ['narrative_markdown', 'highlights', 'counters'],
  });
  const hSrc = handover.hits.hits[0]?._source as
    | { narrative_markdown?: string; highlights?: unknown; counters?: unknown }
    | undefined;
  if (hSrc?.narrative_markdown && hSrc.narrative_markdown.length > 0) {
    const md = hSrc.narrative_markdown;
    return md.length > 2000 ? `${md.slice(0, 2000)}…` : md;
  }

  const decisions = await es.search({
    index: AUTONOMY_DECISIONS_INDEX,
    size: 1,
    sort: [{ '@timestamp': { order: 'desc' } }],
    _source: ['final_status', 'first_failing_gate', 'gates_passed', 'review_reason', 'trust_tier'],
  });
  const dSrc = decisions.hits.hits[0]?._source as
    | {
        final_status?: string;
        first_failing_gate?: string;
        gates_passed?: string[];
        review_reason?: string;
        trust_tier?: string;
      }
    | undefined;
  if (dSrc) {
    return `Latest autonomy decision: status=${dSrc.final_status ?? 'unknown'}, gate=${
      dSrc.first_failing_gate ?? 'none'
    }, trust_tier=${dSrc.trust_tier ?? 'unknown'}, reason=${dSrc.review_reason ?? 'n/a'}`;
  }
  return 'No recent shift handover or autonomy decision documents found.';
};

const buildGovernancePreamble = (parts: {
  killSwitch: { autonomyEnabled: boolean; reason?: string };
  trustTierLine: string;
  policySummary: string;
  budget: { used: number; remaining: number };
}): string => {
  const ks = parts.killSwitch.autonomyEnabled
    ? 'inactive (autonomy enabled)'
    : `ACTIVE — autonomy disabled${parts.killSwitch.reason ? `: ${parts.killSwitch.reason}` : ''}`;
  return [
    '## ARGUS governance context (auto-injected)',
    '',
    `- **Kill switch**: ${ks}`,
    `- **Trust tier / scores**: ${parts.trustTierLine}`,
    `- **Governance policy summary**: ${parts.policySummary}`,
    `- **24h mutation budget**: ${parts.budget.remaining} remaining of ${DAILY_MUTATION_BUDGET} (${parts.budget.used} applied in the last 24h)`,
    '',
  ].join('\n');
};

export const registerArgusBeforeAgentHook = (
  agentBuilder: AgentBuilderPluginSetup,
  deps: RegisterArgusBeforeAgentHookDeps
): void => {
  if (!deps.experimentalFeatures.argusConsoleEnabled) {
    deps.logger.debug('ARGUS beforeAgent hook skipped: argusConsoleEnabled is off');
    return;
  }

  const logger = deps.logger.get('argusBeforeAgentHook');

  agentBuilder.hooks.register({
    id: 'argus-before-agent',
    priority: 115,
    hooks: {
      [HookLifecycle.beforeAgent]: {
        mode: HookExecutionMode.blocking,
        handler: async (context: BeforeAgentHookContext) => {
          try {
            if (!nextInputSuggestsArgusSkills(context.nextInput, context.agentId)) {
              return;
            }

            const [{ elasticsearch }] = await deps.getStartServices();
            const esClient = elasticsearch.client.asScoped(context.request).asCurrentUser;

            const [killSwitch, trustTierLine, policySummary, budget] = await Promise.all([
              readKillSwitchSummary(esClient),
              readTrustTierSummary(esClient, context.agentId),
              readGovernancePolicySummary(esClient),
              readBudgetRemaining(esClient),
            ]);

            const preamble = buildGovernancePreamble({
              killSwitch,
              trustTierLine,
              policySummary,
              budget,
            });

            return {
              nextInput: {
                ...context.nextInput,
                message: `${preamble}${context.nextInput.message}`,
              },
            };
          } catch (err) {
            logger.warn(`ARGUS beforeAgent hook failed (non-blocking): ${String(err)}`);
          }
        },
      },
    },
  });
};
