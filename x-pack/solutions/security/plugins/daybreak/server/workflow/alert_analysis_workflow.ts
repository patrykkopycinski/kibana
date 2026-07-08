/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import { WorkflowSchema, type WorkflowYaml } from '@kbn/workflows';

import SPIKE_WORKFLOW_YAML from './spike_workflow.yaml';

export { SPIKE_WORKFLOW_YAML as ALERT_ANALYSIS_WORKFLOW_YAML };

/**
 * Parse and validate the spike workflow YAML against the engine's schema,
 * returning a strongly-typed workflow definition (FR-005).
 *
 * The returned object conforms to the shipped {@link WorkflowYaml} schema,
 * proving the engine can express the HTTP → guard → AI step shape.
 */
export const getAlertAnalysisWorkflow = (): WorkflowYaml => {
  const parsed = parse(SPIKE_WORKFLOW_YAML);
  return WorkflowSchema.parse(parsed);
};
