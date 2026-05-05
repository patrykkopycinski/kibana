/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkflowsExtensionsServerPluginSetup } from '@kbn/workflows-extensions/server';
import type { CoreStart } from '@kbn/core/server';
import { renderAlertNarrativeStepDefinition } from './render_alert_narrative_step';
import { buildAlertEntityGraphStepDefinition } from './build_alert_entity_graph_step';
import { backtestRuleStepDefinition } from './backtest_rule_step';
import { shadowExecuteRuleStepDefinition } from './shadow_execute_rule_step';
import { syncDetectionCorpusStepDefinition } from './sync_detection_corpus_step';
import { resolveEntityContextStepDefinition } from './resolve_entity_context_step';
import { evaluateRuleDriftStepDefinition } from './evaluate_rule_drift_step';
import { retryWithBackoffStepDefinition } from './retry_with_backoff_step';
import { argusSynthesizeAdvisoryStepDefinition } from './argus_synthesize_advisory_step';
import {
  REGISTER_ALERT_VALIDATION_STEPS_FEATURE_FLAG,
  REGISTER_ALERT_VALIDATION_STEP_FEATURE_FLAG_DEFAULT,
} from '../../../common/constants';

export interface RegisterWorkflowStepsOptions {
  argusConsoleEnabled: boolean;
}

/**
 * Registers all security workflow steps with the workflowsExtensions plugin
 */
export const registerWorkflowSteps = async (
  workflowsExtensions: WorkflowsExtensionsServerPluginSetup,
  coreStart: CoreStart,
  options: RegisterWorkflowStepsOptions
): Promise<void> => {
  const registerAlertValidationStepsEnabled = await coreStart.featureFlags.getBooleanValue(
    REGISTER_ALERT_VALIDATION_STEPS_FEATURE_FLAG,
    REGISTER_ALERT_VALIDATION_STEP_FEATURE_FLAG_DEFAULT
  );

  const registerArgusRuleWorkflowSteps =
    registerAlertValidationStepsEnabled || options.argusConsoleEnabled;

  if (registerAlertValidationStepsEnabled) {
    workflowsExtensions.registerStepDefinition(renderAlertNarrativeStepDefinition);
    workflowsExtensions.registerStepDefinition(buildAlertEntityGraphStepDefinition);
  }

  if (registerArgusRuleWorkflowSteps) {
    workflowsExtensions.registerStepDefinition(backtestRuleStepDefinition);
    workflowsExtensions.registerStepDefinition(shadowExecuteRuleStepDefinition);
    workflowsExtensions.registerStepDefinition(syncDetectionCorpusStepDefinition);
    workflowsExtensions.registerStepDefinition(resolveEntityContextStepDefinition);
    workflowsExtensions.registerStepDefinition(evaluateRuleDriftStepDefinition);
    workflowsExtensions.registerStepDefinition(retryWithBackoffStepDefinition);
    workflowsExtensions.registerStepDefinition(argusSynthesizeAdvisoryStepDefinition);
  }
};
