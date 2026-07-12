/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import { createDaybreakAlertAnalysisSkill } from './index';

interface RegisterSkillsOpts {
  agentBuilder: AgentBuilderPluginSetup;
  logger: Logger;
}

export const registerSkills = async ({ agentBuilder, logger }: RegisterSkillsOpts): Promise<void> => {
  try {
    agentBuilder.skills.register(createDaybreakAlertAnalysisSkill());
    logger.debug('daybreak: registered alert-analysis skill with agent builder');
  } catch (error) {
    logger.error(`daybreak: failed to register alert-analysis skill: ${(error as Error).message}`);
    throw error;
  }
};
