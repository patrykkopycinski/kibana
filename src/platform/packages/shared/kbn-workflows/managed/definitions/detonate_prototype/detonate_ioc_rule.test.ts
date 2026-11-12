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
import { createWorkflowLiquidEngine } from '../../../common/utils';
import { buildFieldsZodValidator } from '../../../spec/lib/build_fields_zod_validator';
import { getInputsFromDefinition } from '../../../spec/lib/field_conversion';
import { WorkflowSchema } from '../../../spec/schema';

interface YamlStep {
  name: string;
  type: string;
  if?: string;
  condition?: string;
  foreach?: string | string[];
  with?: Record<string, unknown>;
  steps?: YamlStep[];
  timeout?: string;
  'on-failure'?: { continue?: boolean; fallback?: YamlStep[] };
}

interface YamlWorkflow {
  settings?: {
    timeout?: string;
    concurrency?: { key: string; strategy: string; max: number };
    'on-failure'?: { fallback?: YamlStep[] };
  };
  triggers?: Array<{
    inputs?: {
      properties?: Record<string, { type?: string; maxLength?: number; maximum?: number }>;
      required?: string[];
    };
  }>;
  outputs?: Array<{ name: string; type: string }>;
  steps: YamlStep[];
}

interface ThreatMappingEntry {
  entries: Array<{ field: string; type: string; value: string }>;
}

/** Every step, nested ones included (loops, if branches, fallbacks). */
const flatten = (steps: YamlStep[]): YamlStep[] =>
  steps.flatMap((step) => [
    step,
    ...flatten(step.steps ?? []),
    ...flatten(step['on-failure']?.fallback ?? []),
  ]);

const worker = parse(DETONATE_IOC_RULE_WORKFLOW.yaml) as YamlWorkflow;
const action = parse(DETONATE_ACTION_CREATE_THREAT_MATCH_RULE_WORKFLOW.yaml) as YamlWorkflow;

const stepByName = (name: string) => worker.steps.find((step) => step.name === name);
const actionStep = (name: string) => flatten(action.steps).find((step) => step.name === name);
const names = worker.steps.map(({ name }) => name);
const actionNames = action.steps.map(({ name }) => name);
const inputsOf = (step: YamlStep | undefined) =>
  (step?.with?.inputs ?? {}) as Record<string, unknown>;
const bodyOf = (step: YamlStep | undefined) => (step?.with?.body ?? {}) as Record<string, unknown>;
const hours = (timeout: unknown) => Number(String(timeout).replace(/h$/, ''));
const rule = (stepByName('candidate')?.with?.rule ?? {}) as Record<string, unknown>;
const emit = stepByName('emit_result')?.with as Record<string, string>;

const FAMILIES = [
  {
    family: 'domain',
    plural: 'domains',
    list: 'domain_list_id',
    count: 'domain_count',
    type: 'keyword',
  },
  { family: 'ip', plural: 'ips', list: 'ip_list_id', count: 'ip_count', type: 'ip' },
  { family: 'hash', plural: 'hashes', list: 'hash_list_id', count: 'hash_count', type: 'keyword' },
] as const;

const LIST_IDS = FAMILIES.map(({ list }) => `{{ steps.lists.output.${list} }}`);

describe('Detonate IOC Rule worker', () => {
  it('parses as a workflow', () => {
    expect(WorkflowSchema.safeParse(worker).success).toBe(true);
  });

  it('takes the same identity inputs as the rule-creation copy, with no model text', () => {
    const inputs = worker.triggers?.[0]?.inputs;
    expect(inputs?.required).toEqual(['task_id', 'investigation_id']);
    expect(inputs?.properties?.task_id?.maxLength).toBe(128);
    expect(inputs?.properties?.estimate_days?.maximum).toBe(30);
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

  // Every value comes from the run record, which sanitized it at extraction;
  // no model output reaches the rule.
  it('reads the IOCs from the run record only', () => {
    const resolved = stepByName('resolve_iocs')?.with as Record<string, string>;
    expect(resolved.domains).toContain("steps.read_record.output['detonate.iocs.domains']");
    expect(resolved.ips).toContain("steps.read_record.output['detonate.iocs.ips']");
    expect(resolved.file_hashes).toContain("steps.read_record.output['detonate.iocs.file_hashes']");
    expect(names.some((name) => name.startsWith('draft'))).toBe(false);
  });

  // The worker runs as a service account that may not write list indices, and
  // a threat_match preview reads them as the current user: it writes nothing
  // before approval and previews nothing.
  it('writes no list and runs no preview before approval', () => {
    const all = flatten(worker.steps);
    expect(all.some(({ with: w }) => String(w?.path ?? '').includes('/api/lists'))).toBe(false);
    expect(all.some(({ name }) => /preview|_list$|^load_|^count_/.test(name))).toBe(false);
    expect(all.some(({ with: w }) => w?.['workflow-id'] === 'system-security-rule-preview')).toBe(
      false
    );
  });

  it('estimates matches over the rule source index with the rule field mappings', () => {
    const estimate = stepByName('estimate_matches');
    expect(estimate?.type).toBe('elasticsearch.search');
    expect(estimate?.if).toBe('${{ steps.has_iocs.output.ok == true }}');
    expect(estimate?.['on-failure']?.continue).toBe(true);
    expect(estimate?.with?.index).toBe('logs-*');
    expect(estimate?.with?.size).toBe(0);
    expect(estimate?.with?.ignore_unavailable).toBe(true);

    const query = JSON.stringify(estimate?.with?.query);
    const aggs = estimate?.with?.aggregations as Record<string, unknown>;
    const mapped = (rule.threat_mapping as ThreatMappingEntry[]).map(
      ({ entries }) => entries[0].field
    );
    for (const field of mapped) {
      expect(query).toContain(field);
    }
    expect(Object.keys(aggs)).toEqual(['domains', 'ips', 'hashes']);
    expect(query).toContain('now-{{ inputs.estimate_days }}d');
    expect(names.indexOf('estimate_matches')).toBeLessThan(names.indexOf('propose_creation'));
  });

  it('proposes the threat match action with the drafted action input', () => {
    const propose = stepByName('propose_creation');
    expect(propose?.with?.['run-as-mode']).toBe('inherit');
    expect(inputsOf(propose).actionWorkflowId).toBe(
      DETONATE_ACTION_CREATE_THREAT_MATCH_RULE_WORKFLOW.id
    );
    expect(inputsOf(propose).actionInput).toBe('${{ steps.action_input.output.value }}');
    expect(propose?.if).toBe('${{ steps.proposal_ready.output.ok == true }}');
    expect(String(inputsOf(propose).comment)).toContain('steps.estimate_matches.output');
  });

  // The action derives the indicator index and filter from candidate_id, so
  // the input carries neither: a tampered input cannot widen the indicators.
  it('drafts an action input without the indicator index or filter', () => {
    const value = stepByName('action_input')?.with?.value as Record<string, unknown>;
    const draftRule = value.rule as Record<string, unknown>;
    expect(value.candidate_id).toBe('{{ execution.id }}');
    expect(Object.keys(value.iocs as object)).toEqual(['domains', 'ips', 'hashes']);
    expect(draftRule.threat_index).toBeUndefined();
    expect(draftRule.threat_filters).toBeUndefined();
    expect(Object.keys(draftRule).sort()).toEqual(
      Object.keys(rule)
        .filter((key) => key !== 'threat_index' && key !== 'threat_filters')
        .sort()
    );
  });

  // The ids the worker shows and re-verifies must be the ids the action writes.
  it('names the lists exactly as the action derives them', () => {
    const resolved = stepByName('resolve_iocs')?.with as Record<string, string>;
    const derived = actionStep('lists')?.with as Record<string, string>;
    for (const { list } of FAMILIES) {
      expect(resolved[list].replace('execution.id', 'ID')).toBe(
        derived[list].replace('inputs.actionInput.candidate_id', 'ID')
      );
    }
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

  it('drafts the rule over the source indices, scoped to this candidate lists', () => {
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

  it('gates the draft and the proposal on the run carrying IOCs', () => {
    expect(stepByName('candidate')?.if).toBe('${{ steps.has_iocs.output.ok == true }}');
    expect(stepByName('action_input')?.if).toBe('${{ steps.candidate.output.ok == true }}');
    expect(stepByName('attach_draft')?.if).toBe('${{ steps.candidate.output.ok == true }}');
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
      expect(resolved.lists_proposed).toContain(
        'steps.candidate.output.rule.threat_filters[0].query.terms.list_id'
      );

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

  it('always clears the coverage lock before emitting, on every path', () => {
    const clear = stepByName('clear_in_progress');
    expect(clear?.if).toBeUndefined();
    expect(clear?.['on-failure']?.continue).toBe(true);
    expect(bodyOf(clear)).toEqual({ remove: ['detonate:coverage-in-progress'] });
    expect(names.indexOf('queue_hunt')).toBeLessThan(names.indexOf('clear_in_progress'));
    expect(names.indexOf('clear_in_progress')).toBeLessThan(names.indexOf('emit_result'));

    const [release] = worker.settings?.['on-failure']?.fallback ?? [];
    expect(release?.with?.path).toBe(clear?.with?.path);
    expect(bodyOf(release)).toEqual({ remove: ['detonate:coverage-in-progress'] });
  });

  it('explains every skip and declares the outputs the coverage sweep reads', () => {
    expect(emit.skip_reason).toContain('could not be read');
    expect(emit.skip_reason).toContain('carries no IOCs');
    expect(emit.skip_reason).toContain('could not be attached');
    expect(emit.skip_reason).not.toContain('count_');
    expect(worker.outputs?.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['created', 'reviewed', 'decision', 'rule_name', 'skip_reason'])
    );
  });
});

describe('Create indicator match rule action', () => {
  const validator = buildFieldsZodValidator(getInputsFromDefinition(action as never));
  const validInput = {
    candidate_id: 'a1b2c3d4-0000-4000-8000-000000000001',
    sample_label: '0123456789ab',
    task_id: 'task-1',
    iocs: {
      domains: ['evil.example.com'],
      ips: ['203.0.113.7', '2001:db8::1'],
      hashes: ['a'.repeat(64)],
    },
    rule: {
      type: 'threat_match',
      language: 'kuery',
      name: 'Detonate IOC match',
      description: 'desc',
      query: '*:*',
      index: ['logs-*'],
      threat_query: '*:*',
      threat_language: 'kuery',
      threat_mapping: [{ entries: [{ field: 'destination.ip', type: 'mapping', value: 'ip' }] }],
      interval: '5m',
      from: 'now-6m',
      severity: 'medium',
      risk_score: 47,
      tags: ['detonate:trial'],
    },
  };
  const accepts = (actionInput: unknown) => validator.safeParse({ actionInput }).success;
  const withIocs = (iocs: Record<string, unknown>) => ({
    ...validInput,
    iocs: { ...validInput.iocs, ...iocs },
  });
  const withRule = (patch: Record<string, unknown>) => ({
    ...validInput,
    rule: { ...validInput.rule, ...patch },
  });

  it('parses as a workflow', () => {
    expect(WorkflowSchema.safeParse(action).success).toBe(true);
  });

  describe('input bounds', () => {
    it('accepts the input the worker drafts', () => {
      expect(accepts(validInput)).toBe(true);
    });

    // The list ids and the indicator filter derive from candidate_id; a value
    // outside the id alphabet could rename or break out of them.
    it.each(['', 'a b', 'x'.repeat(65), 'id,other', 'id"}'])(
      'rejects candidate_id %p',
      (candidateId) => {
        expect(accepts({ ...validInput, candidate_id: candidateId })).toBe(false);
      }
    );

    it('rejects an indicator index or filter in the rule', () => {
      expect(accepts(withRule({ threat_index: ['.items-default'] }))).toBe(false);
      expect(accepts(withRule({ threat_filters: [] }))).toBe(false);
    });

    it('rejects a rule that is not an indicator match over KQL', () => {
      expect(accepts(withRule({ type: 'query' }))).toBe(false);
      expect(accepts(withRule({ language: 'esql' }))).toBe(false);
      expect(accepts(withRule({ risk_score: 101 }))).toBe(false);
    });

    it('rejects more than 100 IOCs per family and malformed values', () => {
      expect(accepts(withIocs({ domains: Array.from({ length: 101 }, (_, i) => `d${i}.x`) }))).toBe(
        false
      );
      expect(accepts(withIocs({ domains: ['Evil.example.com/path'] }))).toBe(false);
      expect(accepts(withIocs({ ips: ['not an ip'] }))).toBe(false);
      expect(accepts(withIocs({ hashes: ['abc'] }))).toBe(false);
      expect(accepts(withIocs({ extra: [] }))).toBe(false);
    });
  });

  it('derives the list ids from candidate_id', () => {
    const derived = actionStep('lists')?.with as Record<string, string>;
    expect(derived).toMatchObject({
      domain_list_id: 'detonate-ioc-domains-{{ inputs.actionInput.candidate_id }}',
      ip_list_id: 'detonate-ioc-ips-{{ inputs.actionInput.candidate_id }}',
      hash_list_id: 'detonate-ioc-hashes-{{ inputs.actionInput.candidate_id }}',
    });
  });

  describe.each(FAMILIES)('the $family list', ({ family, plural, list, count, type }) => {
    const create = actionStep(`create_${family}_list`);
    const load = actionStep(`load_${plural}`);
    const countStep = actionStep(`count_${plural}`);

    it(`is created as a ${type} list only when the family is non-empty`, () => {
      expect(create?.if).toBe(`\${{ steps.lists.output.${count} > 0 }}`);
      expect(create?.with?.path).toBe('/s/{{ workflow.spaceId }}/api/lists');
      expect(bodyOf(create).id).toBe(`{{ steps.lists.output.${list} }}`);
      expect(bodyOf(create).type).toBe(type);
    });

    // A re-offered approval re-posts the same ids; the 409 is tolerated and
    // the count check is the real gate.
    it('loads items with deterministic ids', () => {
      const [add] = load?.steps ?? [];
      expect(load?.type).toBe('foreach');
      expect(load?.foreach).toBe(`\${{ inputs.actionInput.iocs.${plural} }}`);
      expect(add?.['on-failure']?.continue).toBe(true);
      expect(bodyOf(add).list_id).toBe(`{{ steps.lists.output.${list} }}`);
      expect(bodyOf(add).id).toBe(`{{ steps.lists.output.${list} }}-{{ foreach.index }}`);
    });

    it('counts the loaded items against the IOC count', () => {
      expect(String(countStep?.with?.path)).toContain('/api/lists/items/_find?per_page=1');
      expect(String(countStep?.with?.path)).toContain(list);
      const loaded = actionStep('lists_loaded')?.with as Record<string, string>;
      const ok = loaded[`${plural}_ok`];
      expect(ok).toContain(`steps.count_${plural}.output.total`);
      expect(ok).toContain(`steps.lists.output.${count}`);
    });
  });

  it('makes only the last item of a family wait for a refresh', async () => {
    const [add] = actionStep('load_domains')?.steps ?? [];
    const template = String(bodyOf(add).refresh);
    const liquid = createWorkflowLiquidEngine();
    const render = (index: number) =>
      liquid.parseAndRender(template, { foreach: { index, total: 3 } });
    expect(await Promise.all([0, 1, 2].map(render))).toEqual(['false', 'false', 'wait_for']);
  });

  // A partial load must not leave a rule over half the indicators, nor lists
  // nothing reads; failing re-offers the proposal.
  it('deletes the lists and fails on an incomplete load, before creating the rule', () => {
    const abort = actionStep('abort_incomplete_load');
    expect(abort?.type).toBe('if');
    for (const key of ['any', 'domains_ok', 'ips_ok', 'hashes_ok']) {
      expect(abort?.condition).toContain(`steps.lists_loaded.output.${key} != true`);
    }
    const [discard, fail] = abort?.steps ?? [];
    expect(discard?.foreach).toEqual(LIST_IDS);
    expect(discard?.steps?.[0]?.with?.method).toBe('DELETE');
    expect(discard?.steps?.[0]?.['on-failure']?.continue).toBe(true);
    expect(fail?.type).toBe('workflow.fail');
    expect(fail?.with?.reason).toBe('ioc_lists_incomplete');
    expect(actionNames.indexOf('abort_incomplete_load')).toBeLessThan(
      actionNames.indexOf('create_rule')
    );
  });

  it('deletes the lists when the rule cannot be created, and still fails', () => {
    const create = actionStep('create_rule');
    expect(create?.['on-failure']?.continue).toBeUndefined();
    const [discard] = create?.['on-failure']?.fallback ?? [];
    expect(discard?.foreach).toEqual(LIST_IDS);
    expect(discard?.steps?.[0]?.with?.method).toBe('DELETE');
    expect(String(discard?.steps?.[0]?.with?.path)).toContain('/api/lists?id=');
  });

  // Without the filter every value list in the space would act as indicators.
  it('sets the indicator index and filter itself, never from the input', () => {
    const body = actionStep('create_rule')?.with?.rule as Record<string, unknown>;
    expect(body.threat_index).toEqual(['.items-{{ workflow.spaceId }}']);
    expect(body.threat_filters).toEqual([{ query: { terms: { list_id: LIST_IDS } } }]);
    expect(JSON.stringify(body)).not.toContain('actionInput.rule.threat_index');
    expect(JSON.stringify(body)).not.toContain('actionInput.rule.threat_filters');
    expect(body.enabled).toBe(true);
  });
});
