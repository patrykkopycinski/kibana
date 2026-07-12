/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DAYBREAK_WORKER_REF_SCHEMA_VERSION,
  DEFAULT_ALERT_ANALYSIS_WORKER_ID,
} from "./versions";

/**
 * WorkerRef — spike-canonical identity for a Watch Floor worker that emits
 * proposals. Maps to CWL WorkerRef.id when exporting stubs.
 */
export interface WorkerRef {
  id: string;
  name: string;
  capability: string;
  workflowId: string;
  schemaVersion: string;
}

/** Built-in WorkerRef for the 5-phase alert-analysis worker. */
export const ALERT_ANALYSIS_WORKER_REF: WorkerRef = {
  id: DEFAULT_ALERT_ANALYSIS_WORKER_ID,
  name: "Alert Analysis Worker",
  capability: "alert-analysis",
  workflowId: "daybreak-alert-analysis-worker",
  schemaVersion: DAYBREAK_WORKER_REF_SCHEMA_VERSION,
};
