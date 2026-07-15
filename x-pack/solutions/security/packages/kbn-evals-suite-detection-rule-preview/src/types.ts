/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface PreviewConverseStep {
  type?: string;
  tool_id?: string;
  params?: Record<string, unknown>;
  results?: Array<{ type?: string; data?: Record<string, unknown> }>;
}

export interface PreviewConverseTaskInput {
  prompt: string;
  connectorId: string;
}

export interface PreviewConverseTaskOutput {
  steps: PreviewConverseStep[];
  message: string;
  previewIds: string[];
  previewAlertCounts: number[];
}
