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
 * License 2.0; you may not use this file except in compliance with the Elastic
 * License 2.0.
 */

import { parse } from 'yaml';

import { DETONATE_RULE_CREATION_WORKFLOW } from '.';

interface YamlStep {
  name: string;
  type: string;
  if?: string;
  with?: Record<string, unknown>;
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
      properties?: Record<string, { type?: string; minLength?: number; maxLength?: number }>;
      required?: string[];
    };
  }>;
  outputs?: Array<{ name: string; type: string }>;
  steps: YamlStep[];
}

const worker = parse(DETONATE_RULE_CREATION_WORKFLOW.yaml) as YamlWorkflow;

const stepByName = (name: string) => worker.steps.find((step) => step.name === name);
const inputsOf = (step: YamlStep | undefined) =>
  (step?.with?.inputs ?? {}) as Record<string, unknown>;
const hours = (timeout: unknown) => Number(String(timeout).replace(/h$/, ''));
const emit = stepByName('emit_result')?.with as Record<string, string>;

describe('Detonate Detection Rule Creation worker', () => {
  it('declares the detonate inputs: task_id required alongside investigation_id', () => {
    const inputs = worker.triggers?.[0]?.inputs;
    expect(inputs?.required).toEqual(['task_id', 'investigation_id']);
    expect(inputs?.properties?.task_id?.maxLength).toBe(128);
  });

  it('keys one candidate per detonation run and drops a re-request', () => {
    const { key, strategy, max } = worker.settings?.concurrency ?? {};
    expect(key).toBe('detonate-coverage-{{ inputs.task_id }}');
    expect(strategy).toBe('drop');
    expect(max).toBe(1);
  });

  // The worker parks in WAITING_FOR_CHILD twice over: the create gate and the
  // enable gate each hold a 72h decision window. The workflow timeout has to
  // cover both plus a re-park margin, and stay under the engine's ceiling.
  it('outlives both decision deadlines (create 72h + enable 72h)', () => {
    const create = stepByName('propose_creation');
    const enable = stepByName('propose_enable');
    expect(inputsOf(create).expiresIn).toBe('72h');
    expect(inputsOf(enable).expiresIn).toBe('72h');

    expect(String(worker.settings?.timeout)).toMatch(/^\d+h$/);
    expect(hours(worker.settings?.timeout)).toBeGreaterThanOrEqual(144);
    expect(hours(worker.settings?.timeout)).toBeLessThanOrEqual(176);
  });

  // The guard is the only security boundary on model output: nothing below
  // `validate_draft` reads the draft, and everything downstream reads the
  // validated rule instead.
  it('gates every downstream step behind the validate_draft guard', () => {
    const validate = stepByName('validate_draft');
    expect(validate?.type).toBe('detonate.prototype.validateDraft');
    expect(validate?.if).toBe('${{ steps.draft_ready.output.ok == true }}');

    const guarded = ['preview_creation', 'attach_draft', 'propose_creation'];
    for (const name of guarded) {
      const step = stepByName(name);
      const text = JSON.stringify(step);
      expect(text).toContain('steps.validate_draft.output');
      expect(text).not.toContain('draft_creation.output.structured_output.rule.query');
      expect(step?.if).not.toContain('draft_ready');
    }

    // The create action's input is the validated rule, never the draft.
    expect(inputsOf(stepByName('propose_creation')).actionInput).toBe(
      '${{ steps.validate_draft.output.rule }}'
    );
  });

  // A candidate that does not match the run is skipped before any proposal:
  // the sandbox count is a hard gate, not an FYI.
  it('requires a sandbox match before preview, attach or proposal', () => {
    for (const name of ['preview_creation', 'attach_draft']) {
      expect(stepByName(name)?.if).toBe('${{ steps.sandbox_ready.output.ok == true }}');
    }
    const flag = (stepByName('sandbox_ready')?.with as Record<string, string>).ok;
    expect(flag).toContain('steps.sandbox_match.output.count != null');
    expect(flag).toContain('steps.sandbox_match.output.count >= 1');
  });

  // The caller never sends a runnable sandbox query: it posts the stored
  // rule's query to the route, which builds and runs the sandbox variant.
  it('posts the stored rule query to the sandbox_count route for this run', () => {
    const sandbox = stepByName('sandbox_match');
    expect(sandbox?.type).toBe('kibana.request');
    expect(sandbox?.with?.method).toBe('POST');
    expect(sandbox?.with?.path).toBe(
      '/s/{{ workflow.spaceId }}/internal/detonate_prototype/runs/{{ inputs.task_id }}/sandbox_count'
    );
    expect((sandbox?.with?.body as Record<string, string>).rule_query).toBe(
      '{{ steps.validate_draft.output.rule.query }}'
    );
  });

  // The 90-day window goes through the esql step's filter param, never into
  // the query text; the count reads from the validated query with sources
  // untouched; a timeout is bounded at 60s.
  it('backtests via the filter param with a 60s bound', () => {
    const backtest = stepByName('backtest_count');
    expect(backtest?.type).toBe('elasticsearch.esql.query');
    expect(backtest?.timeout).toBe('60s');
    expect(backtest?.if).toBe('${{ steps.sandbox_ready.output.ok == true }}');
    expect((backtest?.with?.query as string).trim()).toBe(
      '{{ steps.candidate_ready.output.production_query }}'
    );
    const filter = JSON.stringify(backtest?.with?.filter);
    expect(filter).toContain('now-90d');
  });

  // Timeout and permission failures read honestly, never as a pass.
  it('reports backtest timeouts and permission failures as such', () => {
    const resolved = (stepByName('resolve_backtest')?.with as Record<string, string>).count_status;
    expect(resolved).toContain("contains 'timed out'");
    expect(resolved).toContain('timed_out');
    const comment = String(inputsOf(stepByName('propose_creation')).comment);
    expect(comment).toContain('Backtest timed out');
    expect(comment).toContain('Backtest unavailable (permissions)');
  });

  it('declares the baseline-gap banner the deck shows on slide 19', () => {
    const comment = String(inputsOf(stepByName('propose_creation')).comment);
    expect(comment).toContain('30-day baseline not reached');
    expect(comment).toContain('**Scope:**');
  });

  describe('enable chain (D12)', () => {
    it('finds the created rule by the candidate tag in the run space', () => {
      const find = stepByName('find_created_rule');
      expect(find?.type).toBe('kibana.request');
      expect(find?.if).toBe("${{ steps.propose_creation.output.decision == 'approved' }}");
      const path = String(find?.with?.path);
      expect(path).toContain('/s/{{ workflow.spaceId }}/api/detection_engine/rules/_find');
      expect(path).toContain('alert.attributes.tags');
      expect(path).toContain('candidate_tag');
      expect(find?.['on-failure']?.continue).toBe(true);
    });

    // Fail closed: zero matches, more than one, already enabled, or a query
    // changed after creation — none of them produce an enable proposal.
    it('proposes enable only for one disabled rule with the validated query', () => {
      const enableReady = (stepByName('enable_ready')?.with as Record<string, string>).ok;
      expect(enableReady).toContain('steps.resolve_found_rule.output.found == true');
      expect(enableReady).toContain('steps.resolve_found_rule.output.enabled == false');
      expect(enableReady).toContain(
        'steps.resolve_found_rule.output.query_found == steps.validate_draft.output.rule.query'
      );

      const enable = stepByName('propose_enable');
      expect(inputsOf(enable).actionWorkflowId).toBe('system-alertzero-action-enable-rule');
      // Every action workflow takes one `actionInput` object; a bare id string
      // fails the gate's input validation.
      expect(inputsOf(enable).actionInput).toEqual({
        id: '{{ steps.resolve_found_rule.output.rule_id }}',
      });
    });

    // Time-of-use: the enable action takes only an id, so the rule is
    // re-fetched and compared (revision + query + still ES|QL) after the gate
    // approves. Any mismatch disables the rule with a space-prefixed PATCH.
    it('re-verifies the rule after the enable gate and fails closed', () => {
      const verify = stepByName('verify_enabled_rule');
      expect(verify?.with?.path).toBe(
        '/s/{{ workflow.spaceId }}/api/detection_engine/rules?id={{ steps.resolve_found_rule.output.rule_id }}'
      );

      const ok = (stepByName('verify_ok')?.with as Record<string, string>).ok;
      expect(ok).toContain(
        'steps.resolve_verify.output.revision_now == steps.resolve_found_rule.output.revision'
      );
      expect(ok).toContain(
        'steps.resolve_verify.output.query_now == steps.validate_draft.output.rule.query'
      );
      expect(ok).toContain("steps.resolve_verify.output.language_now == 'esql'");
      expect(ok).toContain("steps.resolve_verify.output.type_now == 'esql'");

      const disable = stepByName('disable_changed_rule');
      expect(disable?.with?.path).toBe('/s/{{ workflow.spaceId }}/api/detection_engine/rules');
      expect(disable?.with?.method).toBe('PATCH');
      expect((disable?.with?.body as Record<string, unknown>).enabled).toBe(false);
      expect(disable?.if).toContain('steps.verify_ok.output.ok != true');

      const note = String(
        (stepByName('note_verification_failure')?.with as Record<string, string>).message
      );
      expect(note).toContain('Trial rule disabled');
      expect(note).toContain('disable manually');
    });
  });

  it('queues the hunt through the handoff route only on a verified enable', () => {
    const queue = stepByName('queue_hunt');
    expect(queue?.if).toBe(
      "${{ steps.propose_enable.output.decision == 'approved' and steps.verify_ok.output.ok == true }}"
    );
    expect(queue?.with?.path).toBe(
      '/s/{{ workflow.spaceId }}/internal/detonate_prototype/runs/{{ inputs.task_id }}/handoff'
    );
    expect(queue?.with?.body).toEqual({ add: ['detonate:hunt-requested'] });
  });

  // The sweep sets `detonate:coverage-in-progress` when it dispatches this
  // copy, and while it is set the sweep leaves the run alone. This step is
  // the lock's only release: unconditional (no `if`), always clearing, on
  // every path the copy can take — so the lock can never outlive the copy.
  it('always clears the coverage lock before emitting, on every path', () => {
    const clear = stepByName('clear_in_progress');
    expect(clear?.if).toBeUndefined();
    expect(clear?.['on-failure']?.continue).toBe(true);
    expect(clear?.with?.body).toEqual({ remove: ['detonate:coverage-in-progress'] });
    expect(clear?.with?.path).toBe(
      '/s/{{ workflow.spaceId }}/internal/detonate_prototype/runs/{{ inputs.task_id }}/handoff'
    );

    const names = worker.steps.map(({ name }) => name);
    expect(names.indexOf('clear_in_progress')).toBeLessThan(names.indexOf('emit_result'));

    const note = stepByName('note_clear_failure');
    expect(note?.if).toBe('${{ steps.clear_in_progress.error != null }}');
  });

  // A timed-out draft once failed the run before clear_in_progress, leaving the
  // lock set and the run invisible to every later sweep.
  it('does not fail the run on a failed or timed-out draft', () => {
    expect(stepByName('draft_creation')?.['on-failure']?.continue).toBe(true);
    expect(emit.skip_reason).toContain('steps.draft_creation.error != null');
  });

  it('releases the coverage lock from the workflow fallback when a step fails the run', () => {
    const [release] = worker.settings?.['on-failure']?.fallback ?? [];
    const clear = stepByName('clear_in_progress');
    expect(release?.type).toBe('kibana.request');
    expect(release?.with?.path).toBe(clear?.with?.path);
    expect(release?.with?.body).toEqual({ remove: ['detonate:coverage-in-progress'] });
  });

  it('derives created and reviewed from the create gate only', () => {
    expect(emit.created).toContain("steps.propose_creation.output.status == 'succeeded'");
    expect(emit.reviewed).toContain("steps.propose_creation.output.decision == 'approved'");
    expect(emit.reviewed).toContain("steps.propose_creation.output.decision == 'dismissed'");
    expect(emit.decision).toBe('{{ steps.propose_creation.output.decision }}');
  });

  it('explains every skip: incomplete draft, guard rejection, sandbox mismatch, attach failure', () => {
    const reason = emit.skip_reason;
    expect(reason).toContain('The draft is incomplete');
    expect(reason).toContain('steps.validate_draft.output.skip_reason');
    expect(reason).toContain('no sandbox events matched the rule query');
    expect(reason).toContain('could not be attached');
  });

  it('declares every output the coverage sweep reads', () => {
    expect(worker.outputs?.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['created', 'reviewed', 'decision', 'rule_name', 'skip_reason'])
    );
  });
});
