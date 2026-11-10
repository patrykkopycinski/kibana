/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0".
 */

import { parse } from 'yaml';

import { DETONATE_IOC_HUNT_WORKFLOW } from '.';

interface YamlStep {
  name: string;
  type: string;
  if?: string;
  foreach?: string;
  mode?: string;
  with?: Record<string, unknown>;
  'on-failure'?: { continue?: boolean };
  /** Present on `foreach` steps: the branch template repeated per entry. */
  steps?: YamlStep[];
}

interface YamlWorkflow {
  settings?: { concurrency?: { key: string; strategy: string; max: number } };
  triggers?: Array<{
    inputs?: {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
    };
  }>;
  outputs?: Array<{ name: string; type: string }>;
  steps: YamlStep[];
}

const sweep = parse(DETONATE_IOC_HUNT_WORKFLOW.yaml) as YamlWorkflow;

const stepByName = (name: string) =>
  sweep.steps
    .flatMap((step) => (step.type === 'foreach' ? (step.steps as YamlStep[]) : [step]))
    .find((step) => step.name === name);
const pathOf = (step: YamlStep | undefined) => String(step?.with?.path);
const queryOf = (step: YamlStep | undefined) => String(step?.with?.query ?? '');

describe('Detonate IOC Hunt sweep', () => {
  it('keys one sweep per space and drops a second', () => {
    const { key, strategy, max } = sweep.settings?.concurrency ?? {};
    expect(key).toBe('detonate-ioc-hunt-{{ workflow.spaceId }}');
    expect(strategy).toBe('drop');
    expect(max).toBe(1);
  });

  it('takes no inputs: the handoff list is the whole queue', () => {
    expect(sweep.triggers?.[0]?.inputs?.properties).toEqual({});
    expect(sweep.triggers?.[0]?.inputs?.additionalProperties).toBe(false);
  });

  // The route groups by run, cuts at five and orders oldest first; the
  // sweep walks whatever it returned.
  it('reads the hunt handoff list in this space', () => {
    const list = stepByName('list_handoffs');
    expect(list?.type).toBe('kibana.request');
    expect(list?.with?.method).toBe('GET');
    expect(pathOf(list)).toBe(
      '/s/{{ workflow.spaceId }}/internal/detonate_prototype/handoffs?marker=hunt'
    );
    expect(list?.['on-failure']?.continue).toBe(true);
  });

  it('fans out one branch per handoff entry, settled', () => {
    const sweepStep = sweep.steps.find((step) => step.name === 'sweep_entries');
    expect(sweepStep?.type).toBe('foreach');
    expect(sweepStep?.foreach).toBe('${{ steps.resolve_entries.output.entries }}');
    expect(sweepStep?.mode).toBe('settled');
  });

  it('resolves the three IOC families from the run record', () => {
    const iocs = stepByName('resolve_iocs');
    expect(iocs?.if).toBe('${{ steps.read_record.error == null }}');
    expect(pathOf(stepByName('read_record'))).toBe(
      '/s/{{ workflow.spaceId }}/internal/detonate_prototype/runs/{{ foreach.item.task_id }}/record'
    );

    const withBlock = (iocs?.with ?? {}) as Record<string, string>;
    expect(withBlock.domains).toContain("['detonate.iocs.domains']");
    expect(withBlock.ips).toContain("['detonate.iocs.ips']");
    expect(withBlock.file_hashes).toContain("['detonate.iocs.file_hashes']");
  });

  it('marks the run hunt-done before the hunts, and only after the record read', () => {
    const sweepStep = sweep.steps.find((step) => step.name === 'sweep_entries');
    const names = ((sweepStep?.steps ?? []) as YamlStep[]).map((step) => step.name);
    expect(names.indexOf('read_record')).toBeLessThan(names.indexOf('set_hunt_done'));
    expect(names.indexOf('resolve_iocs')).toBeLessThan(names.indexOf('set_hunt_done'));
    expect(names.indexOf('set_hunt_done')).toBeLessThan(names.indexOf('hunt_domains'));

    const done = stepByName('set_hunt_done');
    expect(done?.with?.body).toEqual({
      add: ['detonate:hunt-done'],
      remove: ['detonate:hunt-requested'],
    });
  });

  it('nullifies unmapped fields in every hunt so a missing family skips cleanly', () => {
    for (const name of ['hunt_domains', 'hunt_ips', 'hunt_file_hashes']) {
      const step = stepByName(name);
      expect(step?.type).toBe('elasticsearch.esql.query');
      expect(step?.['on-failure']?.continue).toBe(true);
      expect(queryOf(step)).toContain('SET unmapped_fields = "nullify"');
      expect(queryOf(step)).toContain('NOW() - 30d');
    }

    expect(stepByName('hunt_domains')?.if).toContain('domains.size > 0');
    expect(stepByName('hunt_ips')?.if).toContain('ips.size > 0');
    expect(stepByName('hunt_file_hashes')?.if).toContain('file_hashes.size > 0');
    expect(queryOf(stepByName('hunt_domains'))).toContain('dns.question.name IN');
    expect(queryOf(stepByName('hunt_ips'))).toContain('destination.ip IN');
    expect(queryOf(stepByName('hunt_file_hashes'))).toContain('file.hash.sha256 IN');
  });

  it('never splices raw IOCs: every IN-list is the sanitized record field', () => {
    for (const name of ['hunt_domains', 'hunt_ips', 'hunt_file_hashes']) {
      const query = queryOf(stepByName(name));
      expect(query).toContain('steps.resolve_iocs.output.');
      expect(query).not.toContain('foreach.item');
    }
  });

  it('opens one Investigation per run with exposure and notes the findings', () => {
    const create = stepByName('create_investigation');
    expect(create?.type).toBe('ai.conversation.create');
    expect(create?.if).toBe('${{ steps.resolve_hosts.output.hosts != blank }}');
    expect((create?.with as Record<string, unknown>).template_id).toBe('investigation');

    const note = stepByName('note_findings');
    expect(note?.type).toBe('ai.conversation.add_user_message');
    expect(note?.if).toBe('${{ steps.create_investigation.output.conversation_id != null }}');
    const message = String((note?.with as Record<string, unknown>).message);
    expect(message).toContain('steps.resolve_hosts.output.hosts');
    expect(message).toContain('{{ execution.url }}');
  });

  // The loop back to Detection is a marker on the run, never a cross-Worker
  // workflow call (review 5 F5), and it only fires when there was exposure.
  it('requests a coverage review through the handoff route, only on findings', () => {
    const queue = stepByName('queue_coverage');
    expect(queue?.type).toBe('kibana.request');
    expect(queue?.if).toBe('${{ steps.create_investigation.output.conversation_id != null }}');
    expect(pathOf(queue)).toBe(
      '/s/{{ workflow.spaceId }}/internal/detonate_prototype/runs/{{ foreach.item.task_id }}/handoff'
    );
    expect(queue?.with?.body).toEqual({ add: ['detonate:coverage-requested'] });
  });

  // A failed coverage request must not strand the run in hunt-done, or the
  // next tick would never pick it again. The rollback restores the requested
  // marker, and only runs when the request actually ran and failed.
  it('rolls the hunt markers back when the coverage request fails', () => {
    const rollback = stepByName('rollback_hunt_done');
    expect(rollback?.if).toBe(
      '${{ steps.queue_coverage.error != null and steps.set_hunt_done.output != null }}'
    );
    expect(rollback?.with?.body).toEqual({
      remove: ['detonate:hunt-done'],
      add: ['detonate:hunt-requested'],
    });
    expect(rollback?.['on-failure']?.continue).toBe(true);
  });

  it('is a leaf sweep: no workflow.execute step anywhere', () => {
    const all = sweep.steps.flatMap((step) =>
      step.type === 'foreach' ? (step.steps as YamlStep[]) : [step]
    );
    const dispatches = all.filter(({ type }) =>
      ['workflow.execute', 'workflow.executeAsync'].includes(type)
    );
    expect(dispatches).toEqual([]);
  });

  it('reports the list size and read failure, not host counts', () => {
    const emit = stepByName('emit_result')?.with as Record<string, string>;
    expect(emit.listed).toContain('entries | default: consts.no_rows | size');
    expect(emit.list_failed).toBe('${{ steps.list_handoffs.error != null }}');
  });
});
