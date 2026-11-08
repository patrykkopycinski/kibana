/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import DETONATE_COVERAGE_GAP_YAML from './detonate_coverage_gap.yaml';
import DETONATE_FP_VALIDATION_YAML from './detonate_fp_validation.yaml';
import DETONATE_IOC_HUNT_YAML from './detonate_ioc_hunt.yaml';
import DETONATE_RULE_CREATION_YAML from './detonate_rule_creation.yaml';
import DETONATE_TRIAGE_YAML from './detonate_triage.yaml';
import type { ManagedWorkflowDefinition } from '../../types';

export const DETONATE_FP_VALIDATION_WORKFLOW_ID = 'system-security-detonate-fp-validation';

export const DETONATE_COVERAGE_GAP_WORKFLOW_ID = 'system-security-detonate-coverage-gap';

export const DETONATE_IOC_HUNT_WORKFLOW_ID = 'system-security-detonate-ioc-hunt';

/**
 * Detonate prototype: one sweep over the runs whose alerts wait for the
 * Detection Worker. Reads the coverage handoff list (oldest first, at most
 * five tasks), builds the rule-creation inputs from each run record, opens
 * an Investigation for the gap, marks the run coverage-reviewed before
 * dispatch so the next tick does not pick it again, and starts the D10 rule
 * creation copy detached. A failed dispatch rolls the markers back so the
 * next tick retries the run. The AlertZero Detection Worker's tick calls
 * this sweep when the detonate prototype dev setting is on.
 */
export const DETONATE_COVERAGE_GAP_WORKFLOW = {
  id: DETONATE_COVERAGE_GAP_WORKFLOW_ID,
  pluginId: 'securitySolution',
  version: 3,
  billable: false,
  yaml: DETONATE_COVERAGE_GAP_YAML,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'enforced',
  },
} as const satisfies ManagedWorkflowDefinition;

/**
 * Detonate prototype: the F1 round trip as one stored workflow. Detonate the
 * sample a hash names, derive the verdict, write it back to the alert (tag +
 * note, never status). Manual-trigger only: the automated tier (Wave 3) needs
 * an alert trigger that does not exist in the registry yet.
 */
export const DETONATE_FP_VALIDATION_WORKFLOW = {
  id: DETONATE_FP_VALIDATION_WORKFLOW_ID,
  pluginId: 'securitySolution',
  version: 3,
  billable: false,
  yaml: DETONATE_FP_VALIDATION_YAML,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'enforced',
  },
} as const satisfies ManagedWorkflowDefinition;

export const DETONATE_TRIAGE_WORKFLOW_ID = 'system-security-detonate-triage';

/**
 * Detonate prototype: the thin relay to the Forensics Watch's Detonate sample
 * worker, which owns the detonation chain. Forwards a manual run or a sweep's
 * dispatch to the worker's per-run mode in the caller's space.
 */
export const DETONATE_TRIAGE_WORKFLOW = {
  id: DETONATE_TRIAGE_WORKFLOW_ID,
  pluginId: 'securitySolution',
  version: 14,
  billable: false,
  yaml: DETONATE_TRIAGE_YAML,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'enforced',
  },
} as const satisfies ManagedWorkflowDefinition;

export const DETONATE_RULE_CREATION_WORKFLOW_ID = 'system-security-detonate-rule-creation';

/**
 * Detonate prototype: a detonation-origin copy of the Detection Rule Creation
 * Worker (D10). Drafts an ES|QL rule for a coverage gap a detonation
 * surfaced, gates it through the `validateDraft` guard (the only security
 * boundary on model output), backtests it (separate 90-day production count
 * plus a sandbox match through the sandbox_count route), and proposes
 * creation on the run's Investigation. Approval creates the rule disabled;
 * a second proposal enables the trial rule after a time-of-use check, and a
 * verified enable queues the Hunt Worker via the handoff route.
 */
export const DETONATE_RULE_CREATION_WORKFLOW = {
  id: DETONATE_RULE_CREATION_WORKFLOW_ID,
  pluginId: 'securitySolution',
  version: 3,
  billable: false,
  yaml: DETONATE_RULE_CREATION_YAML,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'enforced',
  },
} as const satisfies ManagedWorkflowDefinition;

/**
 * Detonate prototype: one sweep over the runs whose alerts wait for the Hunt
 * Worker. Reads the hunt handoff list (oldest first, at most five tasks),
 * hunts each run record's extracted IOCs across production logs, and opens
 * one Investigation per run whose hunt found exposure on other hosts, then
 * requests a coverage review from the Detection Worker via a handoff marker. The AlertZero Hunt Worker's tick calls this sweep when the detonate
 * prototype dev setting is on.
 */
export const DETONATE_IOC_HUNT_WORKFLOW = {
  id: DETONATE_IOC_HUNT_WORKFLOW_ID,
  pluginId: 'securitySolution',
  version: 3,
  billable: false,
  yaml: DETONATE_IOC_HUNT_YAML,
  management: {
    lifecycle: 'static',
    versionStrategy: 'auto',
    enablement: 'enforced',
  },
} as const satisfies ManagedWorkflowDefinition;
