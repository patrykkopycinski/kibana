/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Ids are inlined instead of imported from `@kbn/alertzero-common` / `@kbn/workflows`:
 * Playwright's esbuild transform cannot load the managed-workflow YAML those barrels pull in.
 */
export const ATTACK_DISCOVERY_WORKER_WORKFLOW_ID = 'system-security-attack-discovery-worker';
export const FLOOR_ATTACK_DISCOVERY_WORKER_ID = 'system-security-floor-attack-discovery';
export const FLOOR_ALERT_TRIAGE_WORKER_ID = 'system-security-floor-alert-triage';
export const FORENSICS_ENDPOINT_ANALYSIS_WORKER_ID = 'system-security-forensics-endpoint-analysis';
export const HANDOFF_TO_FORENSICS_ACTION_ID = 'system-alertzero-action-handoff-to-forensics';
export const ISOLATE_HOST_ACTION_ID = 'system-alertzero-action-isolate-host';

// P2 (flows 3-5): the standalone endpoint analysis run, and the tuning / coverage workers.
// The run workflow is global and enabled; the two workers are per-space and install their own
// workflow on settings save, so the spec reads the workflow id from the worker record instead.
export const FORENSICS_RUN_ENDPOINT_ANALYSIS_WORKFLOW_ID =
  'system-security-forensics-run-endpoint-analysis';
export const RULE_TUNING_WORKER_ID = 'system-security-detection-rule-tuning';
export const RULE_COVERAGE_WORKER_ID = 'system-security-detection-rule-coverage';
export const ADD_RULE_EXCEPTION_ACTION_ID = 'system-alertzero-action-add-rule-exception';
export const EDIT_RULE_ACTION_ID = 'system-alertzero-action-edit-rule';
export const ENABLE_RULE_ACTION_ID = 'system-alertzero-action-enable-rule';
export const INSTALL_PREBUILT_RULE_ACTION_ID = 'system-alertzero-action-install-prebuilt-rule';

/** Managed AI index the AlertZero producers write knowledge indicators into. */
export const SECURITY_INVESTIGATIONS_AI_INDEX_ID = 'security-investigations';
export const AI_INDEX_KI_BACKING_INDEX = `ai-index-idx-${SECURITY_INVESTIGATIONS_AI_INDEX_ID}`;

export const AI_INDEX_URL = '/api/context_engine/ai_index';
export const PROPOSALS_URL = '/internal/proposals';
export const CONVERSATIONS_URL = '/api/agent_builder/conversations';

export const ALERTS_INDEX = '.alerts-security.alerts-default';
export const ATTACK_DISCOVERY_ADHOC_INDEX =
  '.adhoc.alerts-security.attack.discovery.alerts-default';

export const AZ_VERDICT_TAGS = [
  'az:true_positive',
  'az:false_positive',
  'az:inconclusive',
] as const;

/** Scenario the positive flow seeds: Word -> encoded PowerShell -> C2 -> persistence -> SMB copy. */
export const ATTACK_SCENARIO_KEY = 'encoded-powershell';

export const PUBLIC_HEADERS = {
  'kbn-xsrf': 'scout',
  'x-elastic-internal-origin': 'kibana',
  'elastic-api-version': '2023-10-31',
} as const;

export const INTERNAL_HEADERS = {
  'kbn-xsrf': 'scout',
  'x-elastic-internal-origin': 'kibana',
  'elastic-api-version': '1',
} as const;

/** Attack Discovery generation, the per-attack review and forensics each call a real model. */
export const GENERATION_TIMEOUT_MS = 15 * 60_000;
export const PROPOSAL_TIMEOUT_MS = 10 * 60_000;
export const ACTION_TIMEOUT_MS = 3 * 60_000;
export const POLL_INTERVAL_MS = 5_000;
