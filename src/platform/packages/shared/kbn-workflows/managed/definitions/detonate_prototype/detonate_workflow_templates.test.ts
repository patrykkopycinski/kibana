/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { toValue } from 'liquidjs';
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
      properties?: Record<
        string,
        { type?: string; enum?: string[]; default?: unknown; pattern?: string }
      >;
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
// The engine renders `${{ }}` as `toValue(evalValueSync(<expression>))`.
const evaluateIf = (template: string | undefined, ctx: Record<string, unknown>) =>
  toValue(createWorkflowLiquidEngine().evalValueSync(String(template).slice(3, -2).trim(), ctx));
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

  it('accepts only a 64-character hex sha256 as input', () => {
    const { pattern } = workflow.triggers[0].inputs?.properties?.sha256 ?? {};
    expect(pattern).toBe('^[a-fA-F0-9]{64}$');
    const sha256 = new RegExp(pattern as string);
    expect(sha256.test('a'.repeat(64))).toBe(true);
    expect(sha256.test('A1'.repeat(32))).toBe(true);
    expect(sha256.test('g'.repeat(64))).toBe(false);
    expect(sha256.test(`${'a'.repeat(63)}-`)).toBe(false);
  });

  it('calls the detonate step directly with the input hash, lowercased', () => {
    const detonate = stepNamed(workflow, 'detonate');
    expect(detonate?.type).toBe('detonate.prototype.detonateSample');
    expect(detonate?.with?.sample_hash).toBe('{{ inputs.sha256 | downcase }}');
  });

  it('renders an uppercase input hash lowercase, since the rest of the feature matches lowercase', () => {
    const template = String(stepNamed(workflow, 'detonate')?.with?.sample_hash);
    const render = (sha256: string) =>
      createWorkflowLiquidEngine().parseAndRenderSync(template, { inputs: { sha256 } });
    expect(render(`${'ABCDEF'.repeat(10)}ABCD`)).toBe(`${'abcdef'.repeat(10)}abcd`);
    expect(render(SHA256)).toBe(SHA256);
  });

  it('leaves the verdict null, not an empty string, when the run has none', async () => {
    const verdict = expressionOf(String(stepNamed(workflow, 'emit_result')?.with?.verdict));
    expect(String(stepNamed(workflow, 'emit_result')?.with?.verdict)).toMatch(/^\$\{\{/);
    // The engine renders `${{ }}` as `toValue(evalValueSync(<expression>))`.
    const evaluate = (expression: string, ctx: Record<string, unknown>) =>
      toValue(createWorkflowLiquidEngine().evalValueSync(expression.slice(2, -2).trim(), ctx));
    const context = (output: Record<string, unknown>) => ({ steps: { detonate: { output } } });
    expect(evaluate(verdict, context({ completed: false }))).toBeNull();
    expect(evaluate(verdict, context({ verdict: 'malicious' }))).toBe('malicious');
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

  it('detonates only a sample with no completed run in this space', () => {
    expect(stepNamed(workflow, 'reputation')?.type).toBe('detonate.prototype.detonateReputation');
    const detonate = stepNamed(workflow, 'detonate');
    expect(detonate?.type).toBe('detonate.prototype.detonateSample');
    expect(detonate?.if).toContain('steps.reputation.output.last_task_id == blank');
  });

  it('does not detonate when the lookup failed, and only for an unknown hash with no completed run', () => {
    const condition = stepNamed(workflow, 'detonate')?.if;
    const ctx = (output: Record<string, unknown>) => ({ steps: { reputation: { output } } });
    expect(evaluateIf(condition, { steps: { reputation: {} } })).toBeFalsy();
    expect(evaluateIf(condition, ctx({ status: 'unknown' }))).toBeTruthy();
    expect(evaluateIf(condition, ctx({ status: 'unknown', last_task_id: 't1' }))).toBeFalsy();
  });

  it('lets one failed hash skip, not stop, the rest of the loop', () => {
    expect(stepNamed(workflow, 'reputation')?.['on-failure']?.continue).toBe(true);
    expect(stepNamed(workflow, 'detonate')?.['on-failure']?.continue).toBe(true);
  });

  it('keeps the distinct hashes of high and critical alerts, capped at 10', async () => {
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
    // 20 alerts share one hash and must not use up the cap: h, c and that hash.
    const rendered = await createWorkflowLiquidEngine().parseAndRender(
      `{{ ${expressionOf(loop.foreach).slice(3, -2)} | size }}`,
      { event: { alerts } }
    );
    expect(rendered).toBe('3');

    const manyDistinct = Array.from({ length: 25 }, (_, i) =>
      alert('high', String(i).padStart(64, '0'))
    );
    expect(
      await createWorkflowLiquidEngine().parseAndRender(
        `{{ ${expressionOf(loop.foreach).slice(3, -2)} | size }}`,
        { event: { alerts: [...manyDistinct, ...manyDistinct] } }
      )
    ).toBe('10');

    const kept = await createWorkflowLiquidEngine().parseAndRender(
      `{% assign kept = ${expressionOf(loop.foreach).slice(
        3,
        -2
      )} %}{{ kept[0] | slice: 0, 1 }}{{ kept[1] | slice: 0, 1 }}{{ kept[2] | slice: 0, 1 }}`,
      { event: { alerts } }
    );
    expect(kept).toBe('hca');
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
    // `email.attachments` is nested, so hashes come from a nested terms aggregation.
    expect(search?.with?.size).toBe(0);
    expect(search?.with?.aggregations).toEqual({
      attachments: {
        nested: { path: 'email.attachments' },
        aggregations: {
          hashes: { terms: { field: 'email.attachments.file.hash.sha256', size: 10 } },
        },
      },
    });
    expect(JSON.stringify(search?.with?.query)).toContain('now-1h');
    expect(stepNamed(workflow, 'detonate_each_hash')?.foreach).toContain(
      'steps.find_attachments.output.aggregations.attachments.hashes.buckets'
    );
  });

  it('detonates only unknown samples, and one bad hash does not stop the others', async () => {
    const detonate = stepNamed(workflow, 'detonate');
    expect(detonate?.if).toContain("steps.reputation.output.status == 'unknown'");
    expect(detonate?.if).toContain('steps.reputation.output.last_task_id == blank');
    expect(stepNamed(workflow, 'reputation')?.['on-failure']?.continue).toBe(true);
    expect(detonate?.['on-failure']?.continue).toBe(true);

    const condition = detonate?.if;
    const ctx = (output: Record<string, unknown>) => ({ steps: { reputation: { output } } });
    expect(evaluateIf(condition, { steps: { reputation: {} } })).toBeFalsy();
    expect(evaluateIf(condition, ctx({ status: 'unknown' }))).toBeTruthy();
    expect(evaluateIf(condition, ctx({ status: 'unknown', last_task_id: 't1' }))).toBeFalsy();

    const hash = await createWorkflowLiquidEngine().parseAndRender(
      String(stepNamed(workflow, 'reputation')?.with?.sha256),
      { foreach: { item: { key: SHA256, doc_count: 3 } } }
    );
    expect(hash).toBe(SHA256);
  });
});
