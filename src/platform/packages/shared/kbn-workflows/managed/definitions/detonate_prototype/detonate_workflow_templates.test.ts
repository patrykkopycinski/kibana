/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';

import {
  DETONATE_EMAIL_ATTACHMENTS_WORKFLOW,
  DETONATE_FILE_HASH_WORKFLOW,
  DETONATE_HIGH_SEVERITY_ALERTS_WORKFLOW,
} from '.';
import { createWorkflowLiquidEngine } from '../../../common/utils';
import { WorkflowSchema } from '../../../spec/schema';

interface YamlStep {
  name: string;
  type: string;
  if?: string;
  foreach?: string;
  with?: Record<string, unknown>;
  'on-failure'?: { continue?: boolean };
  steps?: YamlStep[];
}

interface YamlWorkflow {
  enabled?: boolean;
  tags?: string[];
  triggers: Array<{
    type: string;
    with?: { every?: string };
    inputs?: {
      properties?: Record<string, { type?: string; enum?: string[]; default?: unknown }>;
      required?: string[];
    };
  }>;
  steps: YamlStep[];
}

const SHA256 = 'a'.repeat(64);

const load = (yaml: string) => parse(yaml) as YamlWorkflow;
const flatten = (steps: YamlStep[]): YamlStep[] =>
  steps.flatMap((step) => [step, ...flatten(step.steps ?? [])]);
const stepNamed = (workflow: YamlWorkflow, name: string) =>
  flatten(workflow.steps).find((step) => step.name === name);
const expressionOf = (template: string | undefined) =>
  String(template)
    .replace(/^\$\{\{/, '{{')
    .replace(/\}\}$/, '}}');

describe('Detonate file hash workflow', () => {
  const workflow = load(DETONATE_FILE_HASH_WORKFLOW.yaml);

  it('parses as a workflow and is on, with a manual trigger only', () => {
    expect(WorkflowSchema.safeParse(workflow).success).toBe(true);
    expect(workflow.enabled).toBe(true);
    expect(workflow.tags).toContain('detonate_prototype');
    expect(workflow.triggers.map(({ type }) => type)).toEqual(['manual']);
  });

  it('requires a sha256 and accepts only the OS families the step accepts', () => {
    const { properties, required } = workflow.triggers[0].inputs ?? {};
    expect(required).toEqual(['sha256']);
    expect(properties?.vm_os_family?.enum).toEqual(['linux', 'windows', 'darwin']);
    expect(properties?.vm_os_family?.default).toBe('linux');
  });

  it('calls the detonate step directly with the input hash', () => {
    const detonate = stepNamed(workflow, 'detonate');
    expect(detonate?.type).toBe('detonate.prototype.detonateSample');
    expect(detonate?.with?.sample_hash).toBe('{{ inputs.sha256 }}');
  });
});

describe('Detonate high severity alerts workflow', () => {
  const workflow = load(DETONATE_HIGH_SEVERITY_ALERTS_WORKFLOW.yaml);

  it('parses as a workflow and is off, triggered by alerts', () => {
    expect(WorkflowSchema.safeParse(workflow).success).toBe(true);
    expect(workflow.enabled).toBe(false);
    expect(workflow.tags).toContain('detonate_prototype');
    expect(workflow.triggers.map(({ type }) => type)).toEqual(['alert']);
    expect(DETONATE_HIGH_SEVERITY_ALERTS_WORKFLOW.yaml).toContain('Epic #20877 §7');
  });

  it('detonates only a sample with no earlier run in this space', () => {
    expect(stepNamed(workflow, 'reputation')?.type).toBe('detonate.prototype.detonateReputation');
    const detonate = stepNamed(workflow, 'detonate');
    expect(detonate?.type).toBe('detonate.prototype.detonateSample');
    expect(detonate?.if).toContain('steps.reputation.output.last_task_id == blank');
  });

  it('keeps high and critical alerts that carry a hash, capped at 10', async () => {
    const [loop] = workflow.steps;
    const alert = (severity: string, hash?: string) => ({
      kibana: { alert: { severity } },
      ...(hash ? { file: { hash: { sha256: hash } } } : {}),
    });
    const alerts = [
      alert('low', 'l'.repeat(64)),
      alert('high', 'h'.repeat(64)),
      alert('critical', 'c'.repeat(64)),
      alert('high'),
      ...Array.from({ length: 20 }, () => alert('high', SHA256)),
    ];
    const rendered = await createWorkflowLiquidEngine().parseAndRender(
      `{{ ${expressionOf(loop.foreach).slice(3, -2)} | size }}`,
      { event: { alerts } }
    );
    expect(rendered).toBe('10');

    const kept = await createWorkflowLiquidEngine().parseAndRender(
      `{% assign kept = ${expressionOf(loop.foreach).slice(
        3,
        -2
      )} %}{{ kept[0].file.hash.sha256 | slice: 0, 1 }}{{ kept[1].file.hash.sha256 | slice: 0, 1 }}`,
      { event: { alerts } }
    );
    expect(kept).toBe('hc');
  });
});

describe('Detonate email attachments workflow', () => {
  const workflow = load(DETONATE_EMAIL_ATTACHMENTS_WORKFLOW.yaml);

  it('parses as a workflow and is off, on an hourly schedule', () => {
    expect(WorkflowSchema.safeParse(workflow).success).toBe(true);
    expect(workflow.enabled).toBe(false);
    expect(workflow.tags).toContain('detonate_prototype');
    expect(workflow.triggers).toEqual([{ type: 'scheduled', with: { every: '1h' } }]);
    expect(DETONATE_EMAIL_ATTACHMENTS_WORKFLOW.yaml).toContain('Epic #20877 §7');
  });

  it('searches at most 10 distinct hashes from the last hour', () => {
    const search = stepNamed(workflow, 'find_attachments');
    expect(search?.type).toBe('elasticsearch.search');
    expect(search?.with?.size).toBe(10);
    expect(search?.with?.collapse).toEqual({ field: 'email.attachments.file.hash.sha256' });
    expect(JSON.stringify(search?.with?.query)).toContain('now-1h');
  });

  it('detonates only unknown samples, and one bad hash does not stop the others', async () => {
    const detonate = stepNamed(workflow, 'detonate');
    expect(detonate?.if).toContain("steps.reputation.output.status == 'unknown'");
    expect(detonate?.if).toContain('steps.reputation.output.last_task_id == blank');
    expect(stepNamed(workflow, 'reputation')?.['on-failure']?.continue).toBe(true);
    expect(detonate?.['on-failure']?.continue).toBe(true);

    const hash = await createWorkflowLiquidEngine().parseAndRender(
      String(stepNamed(workflow, 'reputation')?.with?.sha256),
      {
        foreach: {
          item: { fields: { 'email.attachments.file.hash.sha256': [SHA256] } },
        },
      }
    );
    expect(hash).toBe(SHA256);
  });
});
