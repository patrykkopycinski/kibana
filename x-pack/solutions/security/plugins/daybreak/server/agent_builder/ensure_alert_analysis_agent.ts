/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { AgentCreateRequest } from '@kbn/agent-builder-common';
import type { AgentRegistry } from '@kbn/agent-builder-server';

/**
 * The Agent Builder skill (`alert-analysis`, see
 * `x-pack/solutions/security/plugins/security_solution/server/agent_builder/skills/alert_analysis/alert_analysis_skill.ts`)
 * that the alert-analysis worker's Reason phase invokes via `ai.agent` (FR-005, FR-012, FR-013).
 *
 * The skill itself must never be modified or forked here (FR-013) — it is
 * only referenced by id.
 */
export const ALERT_ANALYSIS_SKILL_ID = 'alert-analysis';

/**
 * Id of the minimal Agent Builder agent scoped to the `alert-analysis` skill,
 * created (if missing) to resolve A-1 — the `ai.agent` workflow step invokes
 * an agent, not a skill directly, and no pre-existing agent scoped to
 * `alert-analysis` was found in the codebase (research.md Findings 3 and 4).
 */
export const ALERT_ANALYSIS_AGENT_ID = 'daybreak-alert-analysis-agent';

const createAlertAnalysisAgentRequest = (): AgentCreateRequest => ({
  id: ALERT_ANALYSIS_AGENT_ID,
  name: 'Daybreak Alert Analysis Agent',
  description:
    'Minimal agent scoped to the alert-analysis skill, invoked by the daybreak alert-analysis worker Reason phase.',
  configuration: {
    tools: [],
    skill_ids: [ALERT_ANALYSIS_SKILL_ID],
  },
});

/**
 * Ensures an Agent Builder agent scoped to the `alert-analysis` skill exists,
 * creating it if it doesn't (FR-012). Idempotent: safe to call on every
 * plugin start.
 */
export const ensureAlertAnalysisAgent = async ({
  registry,
  logger,
}: {
  registry: AgentRegistry;
  logger: Logger;
}): Promise<void> => {
  const exists = await registry.has(ALERT_ANALYSIS_AGENT_ID);
  if (exists) {
    logger.debug(`daybreak: agent "${ALERT_ANALYSIS_AGENT_ID}" already exists, skipping creation`);
    return;
  }

  logger.info(
    `daybreak: creating agent "${ALERT_ANALYSIS_AGENT_ID}" scoped to skill "${ALERT_ANALYSIS_SKILL_ID}"`
  );
  await registry.create(createAlertAnalysisAgentRequest());
};
