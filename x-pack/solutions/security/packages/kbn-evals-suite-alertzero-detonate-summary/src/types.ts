/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Example } from '@kbn/evals';

/** Label of a corpus entry: what the ground truth says about the sample. */
export type DetonateCorpusLabel =
  /** Known-good: completed benign run, zero alerts anywhere. */
  | 'known_good_quiet'
  /** Known-malware: completed run with production endpoint/detection alerts. */
  | 'known_malicious'
  /** Evasive: sandbox-evasion or no-op behaviour — nothing hard to report. */
  | 'evasive_no_alerts';

/** The subset of the DetonateTask contract a summary needs. */
export interface DetonateCorpusTask {
  id: string;
  sample_filename?: string;
  sample_hash?: string;
  last_worker_name: string;
  last_worker_status: string;
  last_worker_status_details?: string;
  production_endpoint_alerts_count?: number;
  diagnostic_endpoint_alerts_count?: number;
  production_detection_alerts_count?: number;
  production_endpoint_alert_groups: Array<{
    event_code: string;
    alerts_count: number;
    quarantined_count?: number;
  }>;
  diagnostic_endpoint_alert_groups: Array<{
    event_code: string;
    alerts_count: number;
    quarantined_count?: number;
  }>;
  production_detection_alert_groups: Array<{
    alerts_count: number;
    kibana_alert_rule_name: string;
    kibana_alert_rule_parameters_severity?: string;
  }>;
}

/** One recorded detonation result with its ground-truth label. */
export interface DetonateCorpusEntry {
  id: string;
  label: DetonateCorpusLabel;
  task: DetonateCorpusTask;
}

/**
 * Dataset example. `taskContext` is the rendered recording, so the LLM judge
 * sees the same evidence the summarizer saw.
 */
export interface DetonateSummaryExample extends Example {
  input: { entryId: string; taskContext: string };
  output: { expected: string };
  metadata: { label: DetonateCorpusLabel };
}

export interface DetonateSummaryOutput extends Record<string, unknown> {
  summary: string;
}

/** CODE-gate verdict carried in `EvaluationResult.metadata` for counting. */
export interface DetonateGateMetadata extends Record<string, unknown> {
  label: DetonateCorpusLabel;
  falseMalicious: boolean;
  falseBenign: boolean;
  summary: string;
}
