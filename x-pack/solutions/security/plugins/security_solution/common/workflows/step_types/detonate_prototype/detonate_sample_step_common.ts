/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — workflow step, shared definition.
 *
 * The step submits a sample for detonation and then waits for the run to
 * finish, so a workflow can act on what the sample actually did rather than on
 * a hash reputation. Submitting and waiting are one step on purpose: a
 * detonation that is started and never collected is wasted VM time, and an
 * author who has to hand-roll a polling loop will get the completion rule
 * wrong (see `isDetonationComplete` — completion is a worker pair, not an
 * elapsed time).
 */

import { z, lazySchema } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { BaseStepDefinition } from '@kbn/workflows';
import { i18n } from '@kbn/i18n';

import {
  DETONATE_PROTOTYPE_NAMESPACE,
  DETONATE_SAMPLE_SOURCES,
  DETONATE_VM_ARCHITECTURES,
  DETONATE_VM_OS_FAMILIES,
  DETONATE_WORKERS,
  DETONATE_WORKER_STATUSES,
} from '../../../detonate_prototype';

export const DetonateSampleStepId = `${DETONATE_PROTOTYPE_NAMESPACE}.detonateSample` as const;

/**
 * The step takes a hash, not a file: a workflow runs unattended and has no
 * upload to give. Hash submission is also the path an alert-triggered workflow
 * has available, since an alert carries `file.hash.sha256`.
 */
export const detonateSampleInputSchema = lazySchema(() =>
  z.object({
    sample_hash: z
      .string()
      .min(32)
      .max(128)
      .describe(
        'Hash of the sample to detonate (sha256, sha1 or md5), typically `file.hash.sha256` from an alert.'
      ),
    tags: z
      .array(z.string().max(256))
      .max(32)
      .optional()
      .describe('Tags recorded on the detonation task, for finding the run again later.'),
    vm_os_family: z
      .enum(DETONATE_VM_OS_FAMILIES)
      .optional()
      .describe('Operating system family of the detonation VM. Defaults to the service default.'),
    vm_architecture: z
      .enum(DETONATE_VM_ARCHITECTURES)
      .optional()
      .describe('CPU architecture of the detonation VM.'),
    exec_wait_secs: z
      .number()
      .int()
      .min(0)
      .max(3600)
      .optional()
      .describe('How long the sample is left running inside the VM before the VM is torn down.'),
    /**
     * A detonation boots a VM, runs the sample, waits, tears the VM down and
     * summarises telemetry — minutes, not seconds. The ceiling is the author's
     * so a workflow cannot hang indefinitely on a stuck run.
     */
    max_wait_secs: z
      .number()
      .int()
      .min(60)
      .max(3600)
      .default(900)
      .describe('Give up waiting after this many seconds. The detonation itself is not cancelled.'),
  })
);

/**
 * A summary, not the whole task. The raw alert documents are deliberately not
 * returned: a workflow step output is rendered, logged and passed between
 * steps, and a detonation's alert documents are large and contain sample
 * content. A workflow that needs them reads the task through the API.
 */
export const detonateSampleOutputSchema = lazySchema(() =>
  z.object({
    task_id: z.string(),
    completed: z.boolean().describe('False when the step gave up waiting before the run finished.'),
    failed: z.boolean().describe('True when the detonation itself failed, not the step.'),
    last_worker_name: z.enum(DETONATE_WORKERS),
    last_worker_status: z.enum(DETONATE_WORKER_STATUSES),
    last_worker_status_details: z.string().optional(),
    sample_hash: z.string().optional(),
    sample_source: z.enum(DETONATE_SAMPLE_SOURCES).optional(),
    production_endpoint_alerts_count: z.number().int(),
    diagnostic_endpoint_alerts_count: z.number().int(),
    production_detection_alerts_count: z.number().int(),
    total_alerts_count: z.number().int(),
    /**
     * `event.code` values the detonation produced, which is what a workflow
     * branches on — 'did Defend see malware behaviour', not 'how many documents'.
     */
    endpoint_alert_event_codes: z.array(z.string()),
    detection_rule_names: z.array(z.string()),
  })
);

export type DetonateSampleStepInputSchema = typeof detonateSampleInputSchema;
export type DetonateSampleStepOutputSchema = typeof detonateSampleOutputSchema;

export const detonateSampleStepCommonDefinition: BaseStepDefinition<
  DetonateSampleStepInputSchema,
  DetonateSampleStepOutputSchema
> = {
  id: DetonateSampleStepId,
  category: StepCategory.KibanaSecurity,
  label: i18n.translate('xpack.securitySolution.workflows.steps.detonateSample.label', {
    defaultMessage: 'Detonate sample (prototype)',
  }),
  description: i18n.translate('xpack.securitySolution.workflows.steps.detonateSample.description', {
    defaultMessage:
      'Submits a sample hash for detonation in an instrumented VM and waits for the run to finish, returning the Elastic Defend alerts it produced.',
  }),
  inputSchema: detonateSampleInputSchema,
  outputSchema: detonateSampleOutputSchema,
  documentation: {
    details: i18n.translate(
      'xpack.securitySolution.workflows.steps.detonateSample.documentation.details',
      {
        defaultMessage:
          'Prototype step. Starts a detonation and polls until the run reaches its terminal worker, then reports the alert counts and the `event.code` values Elastic Defend raised inside the VM. A run that finishes with zero alerts is a real result — a benign sample or a detection gap — and is reported with `completed: true, failed: false`. `failed: true` means the detonation itself failed (for example the VM never came up); `completed: false` means the step stopped waiting and the run may still be going.',
      }
    ),
    examples: [
      `## Detonate the file on an alert and tag the alert with what it did
\`\`\`yaml
- name: detonate
  type: ${DetonateSampleStepId}
  with:
    sample_hash: "{{ event.file.hash.sha256 }}"
    tags:
      - "workflow"

- name: tag_alert
  type: security.setAlertTags
  if: "{{ steps.detonate.output.total_alerts_count > 0 }}"
  with:
    alert_ids: "{{ event.alert_id }}"
    tags_to_add:
      - "detonation-confirmed-malicious"
\`\`\``,
    ],
  },
};
