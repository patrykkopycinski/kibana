/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutServerConfig } from '../../../../../types';
import { servers as evalsTracingConfig } from '../../evals_tracing/stateful/classic.stateful.config';

/**
 * Merged Scout stateful server configuration for ALL security eval suites.
 *
 * Unions every security suite's feature flags into a single boot so that the
 * same Scout instance can serve any security suite without restart. This
 * eliminates the `isScoutStale` config-set-change restart that kills 10+ min
 * per suite transition in the local batch runner.
 *
 * Flags unioned from: evals_security_ai_rules, evals_security_alert_triage,
 * evals_siem_readiness, evals_agent_builder, evals_skill_selection,
 * evals_endpoint, evals_entity_analytics, evals_entity_analytics_v2,
 * evals_pci_compliance, evals_lead_generation, evals_workflows.
 *
 * Usage:
 *   node scripts/scout start-server --arch stateful --domain classic --serverConfigSet evals_security_all
 */
export const servers: ScoutServerConfig = {
  ...evalsTracingConfig,
  kbnTestServer: {
    ...evalsTracingConfig.kbnTestServer,
    serverArgs: [
      ...evalsTracingConfig.kbnTestServer.serverArgs,
      // AI Assistant + Agent Builder
      '--feature_flags.overrides.aiAssistant.aiAgents.enabled=true',
      '--feature_flags.overrides.streams.significantEventsMemoryEnabled=true',
      '--uiSettings.overrides.agentBuilder:experimentalFeatures=true',
      // Enable Agent Builder inference tracing so gen_ai.* spans (tool name,
      // token usage, latency) reach the OTLP exporter. Without this,
      // AgentBuilderSpanProcessor.onStart() bails early and Skill Invoked /
      // ExpectedToolCalled / token evaluators all return 0/null.
      '--uiSettings.overrides.agentBuilder:tracing:enabled=true',
      // Without includeToolDetails, AgentBuilderSpanProcessor.onEnd() calls
      // stripToolCallIO() and deletes gen_ai.tool.call.arguments/result from
      // every span before export (privacy-by-default). The SkillInvoked
      // evaluator (kbn-evals-suite-security-persona-matrix) queries
      // `attributes.gen_ai.tool.call.arguments LIKE "*/${skillName}/SKILL.md*"`
      // to see which skill a `load_skill` tool call loaded — the tool name
      // alone ("load_skill") never reveals which skill, only the stripped
      // arguments do. Without this override SkillInvoked always returns
      // null/"Unknown column" even with tracing:enabled=true and correct ES
      // mappings. Matches the reference `agent_builder` config set.
      '--uiSettings.overrides.agentBuilder:tracing:includeToolDetails=true',
      // includeRealNames/includeRealIds: without these, tool/agent names and
      // ids are anonymized to 'custom' for non-builtin tools before export —
      // also breaks skill/tool-name-based trace evaluators. Matches the
      // reference `agent_builder` config set.
      '--uiSettings.overrides.agentBuilder:tracing:includeRealNames=true',
      '--uiSettings.overrides.agentBuilder:tracing:includeRealIds=true',
      '--uiSettings.overrides.aiAssistant:preferredChatExperience=agent',
      // Workflows
      '--uiSettings.overrides.workflows:ui:enabled=true',
      '--uiSettings.overrides.workflows:aiAgent:enabled=true',
      // Entity Store V2
      '--uiSettings.overrides.securitySolution:entityStoreEnableV2=true',
      // Alerting v2
      '--xpack.alerting_v2.enabled=true',
      // Actions timeout (entity analytics needs longer; L4-class local vLLM
      // deploys under concurrent load can exceed 120s per request — bumped
      // to 300s after observing genuine 500 "Request timed out" failures
      // on Qwen3-14B-AWQ at KV-cache saturation, not a connector defect)
      '--xpack.actions.responseTimeout=300s',
      // Fleet endpoint package
      '--xpack.fleet.packages.0.name=endpoint',
      '--xpack.fleet.packages.0.version=latest',
      // Security Solution experimental flags — union of all suites
      `--xpack.securitySolution.enableExperimental=${JSON.stringify([
        'aiRuleCreationEnabled',
        'dexAiSkillFindRules',
        'dexAiSkillRecommendPrebuiltRules',
        'entityAnalyticsEntityStoreV2',
        'automaticTroubleshootingSkill',
        'pciComplianceAgentBuilder',
        'leadGenerationEnabled',
        'investigateRuleSkill',
      ])}`,
    ],
  },
};
