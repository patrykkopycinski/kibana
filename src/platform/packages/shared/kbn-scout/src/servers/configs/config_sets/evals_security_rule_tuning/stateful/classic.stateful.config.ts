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
 * Config set for the security-rule-tuning eval suite. The suite drives the managed
 * rule-tuning workflow the pnd plugin installs at start, so pnd must be enabled; the
 * workflow's ai.agent diagnose step additionally requires the Workflows UI and agent
 * settings, and the HITL approval gate is answered through the inbox plugin's respond
 * route, which is disabled by default.
 *
 * `agentBuilder:tracing:includeToolDetails` defaults to false, which strips tool
 * invocations from the exported spans. The suite's SkillInvoked evaluator reads those
 * spans, so without the override every model scores 0 on skill usage regardless of what
 * it actually did — a silent false negative rather than a failed run.
 *
 * `investigateRuleSkill` is enabled here because the diagnose step invokes
 * `skill://investigate-rule`: chat and the tuning worker share one rule-investigation
 * path, and the schema fence turns that investigation into the structured proposal the
 * workflow auto-applies. Without the flag the skill reference 404s and the step runs on a
 * degraded prompt, so the suite would measure a path production never takes.
 */
export const servers: ScoutServerConfig = {
  ...evalsTracingConfig,
  kbnTestServer: {
    ...evalsTracingConfig.kbnTestServer,
    serverArgs: [
      ...evalsTracingConfig.kbnTestServer.serverArgs,
      '--xpack.pnd.enabled=true',
      '--xpack.inbox.enabled=true',
      '--uiSettings.overrides.workflows:ui:enabled=true',
      '--uiSettings.overrides.workflows:aiAgent:enabled=true',
      '--uiSettings.overrides.agentBuilder:tracing:includeToolDetails=true',
      '--xpack.securitySolution.enableExperimental=["investigateRuleSkill"]',
    ],
  },
};
