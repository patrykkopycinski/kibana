/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-plugin/server';
import type { Logger } from '@kbn/logging';
import type { ExperimentalFeatures } from '../../../common';
import { securityLabsSearchTool } from './security_labs_search_tool';
import { attackDiscoverySearchTool } from './attack_discovery_search_tool';
import { entityRiskScoreTool, getEntityTool, searchEntitiesTool } from './entity_analytics';
import { alertsTool } from './alerts_tool';
import { createDetectionRuleTool } from './create_detection_rule_tool';
import {
  argusApproveRejectMutationTool,
  argusExportNavigatorLayerTool,
  argusFileMutationIntentTool,
  argusGetDecisionGraphTool,
  argusGetMutationDetailTool,
  argusListActorCoverageTool,
  argusListUncoveredTechniquesTool,
  argusOpenInvestigationTool,
  argusRunBacktestTool,
  argusSummarizeCoverageTool,
  argusToggleKillSwitchTool,
} from './argus_playbooks';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../plugin_contract';

/**
 * Registers all security agent builder tools with the agentBuilder plugin
 */
export const registerTools = async (
  agentBuilder: AgentBuilderPluginSetup,
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  experimentalFeatures: ExperimentalFeatures
) => {
  agentBuilder.tools.register(entityRiskScoreTool(core, logger));
  agentBuilder.tools.register(attackDiscoverySearchTool(core, logger));
  agentBuilder.tools.register(securityLabsSearchTool(core));
  agentBuilder.tools.register(createDetectionRuleTool(core, logger, experimentalFeatures));
  agentBuilder.tools.register(alertsTool(core, logger));
  agentBuilder.tools.register(getEntityTool(core, logger, experimentalFeatures));
  agentBuilder.tools.register(searchEntitiesTool(core, logger, experimentalFeatures));

  if (experimentalFeatures.argusConsoleEnabled) {
    agentBuilder.tools.register(argusFileMutationIntentTool(core, logger));
    agentBuilder.tools.register(argusRunBacktestTool(core, logger));
    agentBuilder.tools.register(argusApproveRejectMutationTool(core, logger));
    agentBuilder.tools.register(argusOpenInvestigationTool(core, logger));
    agentBuilder.tools.register(argusToggleKillSwitchTool(core, logger));
    agentBuilder.tools.register(argusSummarizeCoverageTool(core, logger));
    agentBuilder.tools.register(argusListUncoveredTechniquesTool(core, logger));
    agentBuilder.tools.register(argusExportNavigatorLayerTool(core, logger));
    agentBuilder.tools.register(argusGetMutationDetailTool(core, logger));
    agentBuilder.tools.register(argusListActorCoverageTool(core, logger));
  }

  // Decision-graph tool is gated by the separate `argusDecisionGraphEnabled`
  // flag so the graph surface can be dark-launched independently of the Tier-1
  // Argus Console. Still scoped to the Console flag too so we never expose it
  // when Argus is entirely off.
  if (experimentalFeatures.argusConsoleEnabled && experimentalFeatures.argusDecisionGraphEnabled) {
    agentBuilder.tools.register(argusGetDecisionGraphTool(core, logger));
  }
};
