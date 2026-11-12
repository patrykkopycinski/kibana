/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under
 * one or more contributor license agreements. Licensed under the Elastic
 * License 2.0; you may use this file only in compliance with the Elastic
 * License 2.0.
 */

import { parse } from 'yaml';

import { DETONATE_COVERAGE_GAP_WORKFLOW } from '.';

interface YamlStep {
  name: string;
  type: string;
  if?: string;
  with?: Record<string, unknown>;
  'on-failure'?: { continue?: boolean };
  /** Present on `foreach` steps: the branch template repeated per entry. */
  foreach?: string;
  steps?: YamlStep[];
}

interface YamlWorkflow {
  settings?: { concurrency?: { key: string; strategy: string; max: number } };
  triggers?: Array<{
    inputs?: {
      properties?: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  }>;
  outputs?: Array<{ name: string; type: string }>;
  steps: YamlStep[];
  [key: string]: unknown;
}

const sweep = parse(DETONATE_COVERAGE_GAP_WORKFLOW.yaml) as YamlWorkflow;

const stepByName = (name: string) =>
  sweep.steps
    .flatMap((step) => (step.type === 'foreach' ? (step.steps as YamlStep[]) : [step]))
    .find((step) => step.name === name);
const inputsOf = (step: YamlStep | undefined) =>
  (step?.with?.inputs ?? {}) as Record<string, unknown>;
const pathOf = (step: YamlStep | undefined) => String(step?.with?.path);

describe('Detonate Coverage Gap sweep', () => {
  it('keys one sweep per space and drops a second', () => {
    const { key, strategy, max } = sweep.settings?.concurrency ?? {};
    expect(key).toBe('detonate-coverage-gap-{{ workflow.spaceId }}');
    expect(strategy).toBe('drop');
    expect(max).toBe(1);
  });

  it('takes no inputs: the handoff list is the whole queue', () => {
    expect(sweep.triggers?.[0]?.inputs?.properties).toEqual({});
    expect(sweep.triggers?.[0]?.inputs?.additionalProperties).toBe(false);
  });

  it('reads the coverage handoff list in this space', () => {
    const list = stepByName('list_handoffs');
    expect(list?.type).toBe('kibana.request');
    expect(list?.with?.method).toBe('GET');
    expect(pathOf(list)).toBe(
      '/s/{{ workflow.spaceId }}/internal/detonate_prototype/handoffs?marker=coverage'
    );
    expect(list?.['on-failure']?.continue).toBe(true);
  });

  // The handoff route groups by run and cuts at five, so the sweep does not
  // re-derive the cap; it just walks whatever the route returned.
  it('fans out one branch per handoff entry, settled', () => {
    const sweepStep = sweep.steps.find((step) => step.name === 'sweep_entries');
    expect(sweepStep?.type).toBe('foreach');
    expect(sweepStep?.foreach).toBe('${{ steps.resolve_entries.output.entries }}');
    expect((sweepStep as { mode?: string }).mode).toBe('settled');
  });

  it('builds the rule-creation inputs from the run record, not the alert', () => {
    const record = stepByName('read_record');
    expect(pathOf(record)).toBe(
      '/s/{{ workflow.spaceId }}/internal/detonate_prototype/runs/{{ foreach.item.task_id }}/record'
    );

    const gap = (stepByName('gap_text')?.with ?? {}) as Record<string, string>;
    // kibana.request output is the response body itself (no wrapper): the
    // record route returns the record fields flat.
    expect(gap.gap_description).toContain("output['detonate.verdict']");
    expect(gap.gap_description).toContain("output['detonate.detections_to_review']");
    expect(gap.evidence).toContain("output['detonate.evidence']");
    expect(gap.evidence).toContain("output['detonate.detection_rule_names']");
    // The technique stays empty: the record carries no ATT&CK mapping.
    expect(inputsOf(stepByName('dispatch_rule_creation')).technique).toBeUndefined();
  });

  it('opens one Investigation per gap before any marker write', () => {
    const create = stepByName('create_investigation');
    expect(create?.type).toBe('ai.conversation.create');
    expect(create?.if).toBe(
      '${{ steps.read_record.error == null and steps.resolve_coverage.output.covered != true }}'
    );
    expect((create?.with as Record<string, unknown>).template_id).toBe('investigation');
  });

  // The hunt re-queues coverage after every enable approval; without this
  // check each loop drafts a duplicate rule for an already covered run.
  it('closes a run that already has an enabled rule without drafting', () => {
    const steps = sweep.steps.find((step) => step.name === 'sweep_entries')?.steps as YamlStep[];
    const names = steps.map((step) => step.name);
    expect(names.slice(0, 3)).toEqual(['find_existing_rule', 'resolve_coverage', 'mark_covered']);

    const find = stepByName('find_existing_rule');
    expect(find?.type).toBe('kibana.request');
    expect(find?.with?.method).toBe('GET');
    expect(find?.with?.headers).toEqual({ 'elastic-api-version': '2023-10-31' });
    expect(pathOf(find)).toContain('/api/detection_engine/rules/_find?per_page=1&filter=');
    expect(pathOf(find)).toContain(`prepend: 'alert.attributes.tags:"detonate:'`);
    expect(pathOf(find)).toContain(`append: '" AND alert.attributes.enabled:true'`);
    expect(find?.['on-failure']?.continue).toBe(true);

    // A failed lookup must read as not covered, so the draft path still runs.
    const covered = String((stepByName('resolve_coverage')?.with ?? {}).covered);
    expect(covered).toContain('steps.find_existing_rule.error == null');
    expect(covered).toContain('steps.find_existing_rule.output.total > 0');

    const mark = stepByName('mark_covered');
    expect(mark?.if).toBe('${{ steps.resolve_coverage.output.covered == true }}');
    expect(mark?.['on-failure']?.continue).toBe(true);
    expect(pathOf(mark)).toBe(
      '/s/{{ workflow.spaceId }}/internal/detonate_prototype/runs/{{ foreach.item.task_id }}/handoff'
    );
    // No lock: nothing is dispatched for a covered run.
    expect(mark?.with?.body).toEqual({
      add: ['detonate:coverage-reviewed'],
      remove: ['detonate:coverage-requested'],
    });
  });

  // The marker must flip before dispatch, or the next tick would pick the
  // same run; the copy's per-task drop key is only the backstop.
  it('marks the run reviewed before dispatching, then dispatches detached', () => {
    const steps = sweep.steps.find((step) => step.name === 'sweep_entries')?.steps as YamlStep[];
    const names = steps.map((step) => step.name);
    expect(names.indexOf('set_reviewed')).toBeLessThan(names.indexOf('dispatch_rule_creation'));

    const reviewed = stepByName('set_reviewed');
    expect(reviewed?.if).toBe('${{ steps.create_investigation.output.conversation_id != null }}');
    expect(reviewed?.with?.body).toEqual({
      add: ['detonate:coverage-reviewed', 'detonate:coverage-in-progress'],
      remove: ['detonate:coverage-requested'],
    });

    expect(names.indexOf('set_reviewed')).toBeLessThan(names.indexOf('dispatch_ioc_rule'));

    const dispatch = stepByName('dispatch_rule_creation');
    expect(dispatch?.type).toBe('workflow.executeAsync');
    expect(dispatch?.with?.['workflow-id']).toBe('system-security-detonate-rule-creation');
    expect(dispatch?.with?.['run-as-mode']).toBe('inherit');
    expect(dispatch?.['on-failure']?.continue).toBe(true);
    expect(inputsOf(dispatch).task_id).toBe('{{ foreach.item.task_id }}');
    expect(inputsOf(dispatch).investigation_id).toBe(
      '{{ steps.create_investigation.output.conversation_id }}'
    );
  });

  // Both workers hold the same per-task drop key, so exactly one is
  // dispatched: the IOC rule worker when the record carries IOCs, the ES|QL
  // copy otherwise. A record read failure dispatches neither.
  it('dispatches the IOC rule worker for a run with IOCs and the ES|QL copy otherwise', () => {
    const counts = stepByName('ioc_counts');
    expect(counts?.if).toBe('${{ steps.create_investigation.output.conversation_id != null }}');
    const countsWith = counts?.with as Record<string, string>;
    expect(countsWith.domains).toContain("steps.read_record.output['detonate.iocs.domains']");
    expect(countsWith.ips).toContain("steps.read_record.output['detonate.iocs.ips']");
    expect(countsWith.file_hashes).toContain(
      "steps.read_record.output['detonate.iocs.file_hashes']"
    );

    const hasIocs = String((stepByName('has_iocs')?.with ?? {}).ok);
    for (const family of ['domains', 'ips', 'file_hashes']) {
      expect(hasIocs).toContain(`steps.ioc_counts.output.${family} > 0`);
    }

    const ioc = stepByName('dispatch_ioc_rule');
    expect(ioc?.type).toBe('workflow.executeAsync');
    expect(ioc?.if).toBe('${{ steps.has_iocs.output.ok == true }}');
    expect(ioc?.with?.['workflow-id']).toBe('system-security-detonate-ioc-rule');
    expect(ioc?.with?.['run-as-mode']).toBe('inherit');
    expect(ioc?.['on-failure']?.continue).toBe(true);
    // The IOC worker reads the IOCs from the record itself; it takes no gap text.
    expect(inputsOf(ioc)).toEqual({
      task_id: '{{ foreach.item.task_id }}',
      investigation_id: '{{ steps.create_investigation.output.conversation_id }}',
    });

    expect(stepByName('dispatch_rule_creation')?.if).toBe(
      '${{ steps.has_iocs.output.ok == false }}'
    );
  });

  // A failed dispatch must not strand the run in coverage-reviewed, or the
  // next tick would never pick it again. The rollback restores the requested
  // marker, and only runs when the dispatch actually ran and failed.
  it('rolls the reviewed marker back when the dispatch fails', () => {
    const failed = String((stepByName('dispatch_failed')?.with ?? {}).ok);
    expect(failed).toContain('steps.dispatch_ioc_rule.error != null');
    expect(failed).toContain('steps.dispatch_rule_creation.error != null');

    const rollback = stepByName('rollback_reviewed');
    expect(rollback?.if).toBe(
      '${{ steps.dispatch_failed.output.ok == true and steps.set_reviewed.output != null }}'
    );
    expect(rollback?.with?.body).toEqual({
      remove: ['detonate:coverage-reviewed', 'detonate:coverage-in-progress'],
      add: ['detonate:coverage-requested'],
    });
    expect(rollback?.['on-failure']?.continue).toBe(true);
  });

  it('reports the list size and a failed list read honestly', () => {
    const emit = stepByName('emit_result')?.with as Record<string, string>;
    expect(emit.listed).toContain('size');
    expect(emit.list_failed).toBe('${{ steps.list_handoffs.error != null }}');
  });
});
