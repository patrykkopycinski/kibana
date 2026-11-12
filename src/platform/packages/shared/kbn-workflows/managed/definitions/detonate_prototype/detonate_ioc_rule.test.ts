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
  DETONATE_ACTION_CREATE_THREAT_MATCH_RULE_WORKFLOW,
  DETONATE_IOC_RULE_WORKFLOW,
  DETONATE_RULE_CREATION_WORKFLOW,
} from '.';

interface YamlStep {
  name: string;
  type: string;
  if?: string;
  foreach?: string;
  with?: Record<string, unknown>;
  steps?: YamlStep[];
  timeout?: string;
  'on-failure'?: { continue?: boolean };
}

interface YamlWorkflow {
  settings?: {
    timeout?: string;
    concurrency?: { key: string; strategy: string; max: number };
    'on-failure'?: { fallback?: YamlStep[] };
  };
  triggers?: Array<{
    inputs?: {
      properties?: Record<string, { type?: string; maxLength?: number }>;
      required?: string[];
    };
  }>;
  outputs?: Array<{ name: string; type: string }>;
  steps: YamlStep[];
}

interface ThreatMappingEntry {
  entries: Array<{ field: string; type: string; value: string }>;
}

const worker = parse(DETONATE_IOC_RULE_WORKFLOW.yaml) as YamlWorkflow;

const stepByName = (name: string) => worker.steps.find((step) => step.name === name);
const names = worker.steps.map(({ name }) => name);
const inputsOf = (step: YamlStep | undefined) =>
  (step?.with?.inputs ?? {}) as Record<string, unknown>;
const bodyOf = (step: YamlStep | undefined) => (step?.with?.body ?? {}) as Record<string, unknown>;
const hours = (timeout: unknown) => Number(String(timeout).replace(/h$/, ''));
const rule = (stepByName('candidate')?.with?.rule ?? {}) as Record<string, unknown>;
const emit = stepByName('emit_result')?.with as Record<string, string>;

const FAMILIES = [
  { family: 'domain', list: 'domain_list_id', count: 'domain_count', type: 'keyword' },
  { family: 'ip', list: 'ip_list_id', count: 'ip_count', type: 'ip' },
  { family: 'hash', list: 'hash_list_id', count: 'hash_count', type: 'keyword' },
] as const;

const PLURAL = { domain: 'domains', ip: 'ips', hash: 'hashes' } as const;

describe('Detonate IOC Rule worker', () => {
  it('takes the same identity inputs as the rule-creation copy, with no model text', () => {
    const inputs = worker.triggers?.[0]?.inputs;
    expect(inputs?.required).toEqual(['task_id', 'investigation_id']);
    expect(inputs?.properties?.task_id?.maxLength).toBe(128);
    expect(inputs?.properties?.gap_description).toBeUndefined();
  });

  // Shares the rule-creation copy's key, so a run can only ever have one
  // candidate in flight, whichever worker the sweep picked.
  it('shares the per-run drop key with the rule-creation copy', () => {
    const own = worker.settings?.concurrency;
    const sibling = (parse(DETONATE_RULE_CREATION_WORKFLOW.yaml) as YamlWorkflow).settings
      ?.concurrency;
    expect(own).toEqual({
      key: 'detonate-coverage-{{ inputs.task_id }}',
      strategy: 'drop',
      max: 1,
    });
    expect(own).toEqual(sibling);
  });

  it('outlives the create decision deadline (72h)', () => {
    const propose = stepByName('propose_creation');
    expect(inputsOf(propose).expiresIn).toBe('72h');
    expect(inputsOf(propose).autoApprove).toBe(false);
    expect(hours(worker.settings?.timeout)).toBeGreaterThanOrEqual(80);
    expect(hours(worker.settings?.timeout)).toBeLessThanOrEqual(176);
  });

  it('proposes the threat match action with the candidate rule as its input', () => {
    const propose = stepByName('propose_creation');
    expect(propose?.with?.['run-as-mode']).toBe('inherit');
    expect(inputsOf(propose).actionWorkflowId).toBe(
      DETONATE_ACTION_CREATE_THREAT_MATCH_RULE_WORKFLOW.id
    );
    expect(inputsOf(propose).actionInput).toBe('${{ steps.candidate.output.rule }}');
    expect(propose?.if).toBe('${{ steps.proposal_ready.output.ok == true }}');
  });

  // Every value comes from the run record, which sanitized it at extraction;
  // no model output reaches the rule.
  it('reads the IOCs from the run record only', () => {
    const resolved = stepByName('resolve_iocs')?.with as Record<string, string>;
    expect(resolved.domains).toContain("steps.read_record.output['detonate.iocs.domains']");
    expect(resolved.ips).toContain("steps.read_record.output['detonate.iocs.ips']");
    expect(resolved.file_hashes).toContain("steps.read_record.output['detonate.iocs.file_hashes']");
    expect(names.some((name) => name.startsWith('draft'))).toBe(false);
  });

  describe.each(FAMILIES)('the $family list', ({ family, list, count, type }) => {
    const create = stepByName(`create_${family}_list`);
    const load = stepByName(`load_${PLURAL[family]}`);
    const countStep = stepByName(`count_${PLURAL[family]}`);

    it(`is created as a ${type} list only when the family is non-empty`, () => {
      expect(create?.if).toBe(`\${{ steps.resolve_iocs.output.${count} > 0 }}`);
      expect(create?.with?.path).toBe('/s/{{ workflow.spaceId }}/api/lists');
      expect(bodyOf(create).id).toBe(`{{ steps.resolve_iocs.output.${list} }}`);
      expect(bodyOf(create).type).toBe(type);
    });

    // A step retry re-posts the same ids; the 409 is tolerated and the count
    // check below is the real gate.
    it('loads items with deterministic ids and only the last one waits for a refresh', () => {
      const [add] = load?.steps ?? [];
      expect(load?.type).toBe('foreach');
      expect(add?.['on-failure']?.continue).toBe(true);
      expect(bodyOf(add).list_id).toBe(`{{ steps.resolve_iocs.output.${list} }}`);
      expect(bodyOf(add).id).toBe(`{{ steps.resolve_iocs.output.${list} }}-{{ foreach.index }}`);
      expect(String(bodyOf(add).refresh)).toContain('wait_for');
      expect(String(bodyOf(add).refresh)).toContain('foreach.total');
    });

    it('counts the loaded items against the IOC count', () => {
      expect(String(countStep?.with?.path)).toContain('/api/lists/items/_find?per_page=1');
      expect(String(countStep?.with?.path)).toContain(list);
      const loaded = stepByName('lists_loaded')?.with as Record<string, string>;
      const ok = loaded[`${PLURAL[family]}_ok`];
      expect(ok).toContain(`steps.count_${PLURAL[family]}.output.total`);
      expect(ok).toContain(`steps.resolve_iocs.output.${count}`);
    });

    it('is deleted when no rule references it', () => {
      const del = stepByName(`delete_${family}_list`);
      expect(del?.with?.method).toBe('DELETE');
      expect(String(del?.with?.path)).toContain(`steps.resolve_iocs.output.${list}`);
      expect(del?.if).toContain('steps.discard_lists.output.ok == true');
      expect(del?.if).toContain(`steps.resolve_iocs.output.${count} > 0`);
      expect(del?.['on-failure']?.continue).toBe(true);
    });
  });

  // The list type decides which item field the mapping reads: a keyword item
  // mapped to an ip field fails the rule ("is not an IP string literal").
  it('maps each family to the list item field matching its list type', () => {
    const mapping = rule.threat_mapping as ThreatMappingEntry[];
    expect(mapping.map(({ entries }) => entries)).toEqual([
      [{ field: 'dns.question.name', type: 'mapping', value: 'keyword' }],
      [{ field: 'destination.ip', type: 'mapping', value: 'ip' }],
      [{ field: 'file.hash.sha256', type: 'mapping', value: 'keyword' }],
    ]);
  });

  // Without the filter every value list in the space would act as indicators.
  it('scopes the indicator search to this candidate lists only', () => {
    expect(rule.type).toBe('threat_match');
    expect(rule.threat_index).toEqual(['.items-{{ workflow.spaceId }}']);
    expect(rule.threat_filters).toEqual([
      {
        query: {
          terms: {
            list_id: FAMILIES.map(({ list }) => `{{ steps.resolve_iocs.output.${list} }}`),
          },
        },
      },
    ]);
    expect(rule.index).toEqual(['logs-*']);
    expect(JSON.stringify(rule.index)).not.toContain('detonate-sandbox');
    expect(rule.tags).toEqual([
      'detonate:trial',
      'detonate:{{ inputs.task_id }}',
      '{{ steps.resolve_iocs.output.candidate_tag }}',
    ]);
  });

  it('gates the candidate on every list holding its full IOC count', () => {
    const gate = String(stepByName('candidate')?.if);
    for (const family of ['domains', 'ips', 'hashes']) {
      expect(gate).toContain(`steps.lists_loaded.output.${family}_ok == true`);
    }
    expect(names.indexOf('lists_loaded')).toBeLessThan(names.indexOf('candidate'));
    expect(names.indexOf('candidate')).toBeLessThan(names.indexOf('preview_creation'));
    expect(stepByName('preview_creation')?.if).toBe('${{ steps.candidate.output.ok == true }}');
    expect(stepByName('attach_draft')?.if).toBe('${{ steps.candidate.output.ok == true }}');
  });

  it('previews whole days of history over the source indices', () => {
    const preview = stepByName('preview_creation');
    const body = inputsOf(preview).preview_body as Record<string, unknown>;
    expect(preview?.with?.['workflow-id']).toBe('system-security-rule-preview');
    expect(inputsOf(preview).indices).toEqual(['logs-*']);
    expect(body.type).toBe('threat_match');
    expect(body.interval).toBe('24h');
    expect(body.from).toBe('now-25h');
    expect(body.threat_filters).toBe('${{ steps.candidate.output.rule.threat_filters }}');
    expect(body.threat_mapping).toBe('${{ steps.candidate.output.rule.threat_mapping }}');
  });

  describe('post-approval re-check', () => {
    it('finds the created rule by the candidate tag', () => {
      const find = stepByName('find_created_rule');
      expect(find?.if).toBe("${{ steps.propose_creation.output.decision == 'approved' }}");
      const path = String(find?.with?.path);
      expect(path).toContain('/s/{{ workflow.spaceId }}/api/detection_engine/rules/_find');
      expect(path).toContain('alert.attributes.tags');
      expect(path).toContain('candidate_tag');
    });

    // An edit that drops the list filter would turn every list in the space
    // into indicators; it disables the rule like any other drift.
    it('re-verifies type, query and the list filter, and fails closed', () => {
      const ok = String((stepByName('verify_ok')?.with as Record<string, string>).ok);
      expect(ok).toContain('steps.resolve_found_rule.output.found == true');
      expect(ok).toContain("steps.resolve_found_rule.output.type_found == 'threat_match'");
      expect(ok).toContain("steps.resolve_found_rule.output.language_found == 'kuery'");
      expect(ok).toContain(
        'steps.resolve_found_rule.output.query_found == steps.candidate.output.rule.query'
      );
      expect(ok).toContain(
        'steps.resolve_found_rule.output.lists_found == steps.resolve_found_rule.output.lists_proposed'
      );
      const resolved = stepByName('resolve_found_rule')?.with as Record<string, string>;
      expect(resolved.lists_found).toContain('threat_filters[0].query.terms.list_id');

      const disable = stepByName('disable_changed_rule');
      expect(disable?.with?.method).toBe('PATCH');
      expect(bodyOf(disable).enabled).toBe(false);
      expect(disable?.if).toContain('steps.verify_ok.output.ok == false');
    });

    it('queues the hunt only on a verified create', () => {
      const queue = stepByName('queue_hunt');
      expect(queue?.if).toBe('${{ steps.verify_ok.output.ok == true }}');
      expect(bodyOf(queue)).toEqual({ add: ['detonate:hunt-requested'] });
    });
  });

  // An approved candidate keeps its lists even when the re-check disabled the
  // rule: the rule still reads them. Every other outcome discards them.
  it('discards the lists on any outcome but approval', () => {
    const discard = stepByName('discard_lists');
    expect(discard?.if).toBe('${{ steps.has_iocs.output.ok == true }}');
    expect((discard?.with as Record<string, string>).ok).toBe(
      "${{ steps.propose_creation.output.decision != 'approved' }}"
    );
    expect(names.indexOf('queue_hunt')).toBeLessThan(names.indexOf('discard_lists'));
  });

  it('always clears the coverage lock before emitting, on every path', () => {
    const clear = stepByName('clear_in_progress');
    expect(clear?.if).toBeUndefined();
    expect(clear?.['on-failure']?.continue).toBe(true);
    expect(bodyOf(clear)).toEqual({ remove: ['detonate:coverage-in-progress'] });
    expect(names.indexOf('delete_hash_list')).toBeLessThan(names.indexOf('clear_in_progress'));
    expect(names.indexOf('clear_in_progress')).toBeLessThan(names.indexOf('emit_result'));

    const [release] = worker.settings?.['on-failure']?.fallback ?? [];
    expect(release?.with?.path).toBe(clear?.with?.path);
    expect(bodyOf(release)).toEqual({ remove: ['detonate:coverage-in-progress'] });
  });

  it('never fails the run on a list write: every write tolerates failure', () => {
    const writes = worker.steps
      .flatMap((step) => [step, ...(step.steps ?? [])])
      .filter(({ type, with: w }) => type === 'kibana.request' && w?.method !== 'GET');
    expect(writes.length).toBeGreaterThan(0);
    for (const step of writes) {
      expect([step.name, step['on-failure']?.continue]).toEqual([step.name, true]);
    }
  });

  it('explains every skip and declares the outputs the coverage sweep reads', () => {
    expect(emit.skip_reason).toContain('could not be read');
    expect(emit.skip_reason).toContain('carries no IOCs');
    expect(emit.skip_reason).toContain('did not load completely');
    expect(emit.skip_reason).toContain('could not be attached');
    expect(worker.outputs?.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['created', 'reviewed', 'decision', 'rule_name', 'skip_reason'])
    );
  });
});
