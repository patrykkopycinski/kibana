/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  A2aSkillCapability,
  ArgusSkillDescriptor,
  ArgusToolAnnotations,
  GovernanceSnapshot,
  McpToolDescriptor,
  Principal,
  PrincipalProfile,
  ProjectedManifest,
  Protocol,
} from './src/types';

export { ARGUS_SKILL_INPUT_SCHEMA, ARGUS_SKILL_OUTPUT_SCHEMA } from './src/schemas';

export { computeToolAnnotations } from './src/annotations';

export {
  MCP_TOOL_NAMESPACE,
  applyGovernance,
  isSkillExposedToProfile,
  projectManifestFor,
  projectSkillToA2a,
  projectSkillToMcp,
} from './src/projection';

export { loadSkillsFromDisk, parseSkill } from './src/skill_loader';

export { ARGUS_A2A_AGENT_ID, assembleAgentCard, type A2aAgentCard } from './src/agent_card';
