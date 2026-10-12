/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutServerConfig } from '../../../../../types';
import { servers as evalsAgentBuilderConfig } from '../../evals_agent_builder/stateful/classic.stateful.config';

/**
 * `evals_agent_builder` with the endpoint-forensic-analysis Agent Builder skill ENABLED.
 *
 * The skill ships dark (`endpointForensicAnalysisSkill: false` in
 * `common/experimental_features.ts`), so it is absent from the Agent Builder catalog under the
 * default eval stack — and a skill that is not registered cannot be misrouted to. The
 * routing-collision A/B (`collision.playwright.config.ts`) therefore needs this second set for its
 * candidate arm; the baseline arm keeps `evals_agent_builder` so the only difference between the
 * arms is whether the skill is in the catalog.
 */
export const servers: ScoutServerConfig = {
  ...evalsAgentBuilderConfig,
  kbnTestServer: {
    ...evalsAgentBuilderConfig.kbnTestServer,
    serverArgs: [
      ...evalsAgentBuilderConfig.kbnTestServer.serverArgs,
      `--xpack.securitySolution.enableExperimental=${JSON.stringify([
        'dexAiSkillRecommendPrebuiltRules',
        'dexAiSkillFindRules',
        'dexAiSkillDetectionCoverage',
        'siemRuleMigrationsAgentBuilderEnabled',
        'endpointForensicAnalysisSkill',
      ])}`,
    ],
  },
};
