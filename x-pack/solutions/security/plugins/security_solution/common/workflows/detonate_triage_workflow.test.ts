/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DETONATE_FP_VALIDATION_WORKFLOW, DETONATE_TRIAGE_WORKFLOW } from '@kbn/workflows/managed';
import { parse } from 'yaml';
import type { ExceptionEntryInput } from '@kbn/securitysolution-exceptions-common/workflows';
import { toApiEntries } from '../detection_engine/rule_exceptions/to_api_entries';
import { createExceptionListItemInputSchema } from './step_types/create_exception_list_item_step/create_exception_list_item_step_common';

/**
 * Managed workflows install under lightweight validation, so a plugin step's
 * `with` block is only deep-checked against the step's real input schema at
 * execution time. This suite parses the detonate triage YAML and validates the
 * blocklist step's `with` against `createExceptionListItemInputSchema` here,
 * so a malformed entry shape fails CI instead of a demo run.
 */

interface WorkflowStep {
  type?: string;
  name?: string;
  if?: string;
  condition?: string;
  'on-failure'?: { continue: boolean };
  steps?: WorkflowStep[];
  default?: WorkflowStep[];
  cases?: Array<{ steps?: WorkflowStep[] }>;
  with?: unknown;
}

/** Depth-first step walker covering every container the schema allows. */
const collectSteps = (steps: WorkflowStep[] = []): WorkflowStep[] =>
  steps.flatMap((step) => [
    step,
    ...collectSteps(step.steps),
    ...collectSteps(step.default),
    ...collectSteps(step.cases?.flatMap(({ steps: caseSteps }) => caseSteps ?? [])),
  ]);

describe('detonate triage managed workflow', () => {
  const workflow = parse(DETONATE_TRIAGE_WORKFLOW.yaml) as {
    steps: WorkflowStep[];
    settings?: { concurrency?: Record<string, unknown> };
  };
  const steps = collectSteps(workflow.steps);

  it('runs one triage per sample, so overlapping callers raise one set of proposals', () => {
    expect(workflow.settings?.concurrency).toEqual({
      key: 'detonate-{{ inputs.sha256 }}',
      strategy: 'drop',
      max: 1,
    });
  });

  it('wires exactly one approval-gated blocklist step', () => {
    const blocklistSteps = steps.filter(({ type }) => type === 'security.createExceptionListItem');
    expect(blocklistSteps).toHaveLength(1);

    const gate = steps.find(({ type }) => type === 'waitForApproval');
    expect(gate).toBeDefined();
    // The gate is what makes the write analyst-approved, not verdict-alone.
    const gateIndex = steps.indexOf(gate!);
    const writeIndex = steps.indexOf(blocklistSteps[0]);
    expect(gateIndex).toBeLessThan(writeIndex);
  });

  it('targets the endpoint blocklist with an idempotent, hash-derived item_id', () => {
    const blocklist = steps.find(({ type }) => type === 'security.createExceptionListItem');
    const input = blocklist?.with as { list_id: string; item_id: string; overwrite: boolean };
    expect(input.list_id).toBe('endpoint_blocklists');
    expect(input.item_id).toContain('{{ inputs.sha256 }}');
    expect(input.overwrite).toBe(true);
  });

  it('has a with block that satisfies the real createExceptionListItem input schema', () => {
    const blocklist = steps.find(({ type }) => type === 'security.createExceptionListItem');
    // Template strings are exactly what the engine validates before render:
    // the schema must accept them as opaque strings.
    const result = createExceptionListItemInputSchema.safeParse(blocklist?.with);
    if (!result.success) {
      throw new Error(`blocklist step with-block failed schema: ${result.error.message}`);
    }
  });

  it('maps its entries to the match_any/included shape the blocklist validator requires', () => {
    const blocklist = steps.find(({ type }) => type === 'security.createExceptionListItem');
    const { entries } = blocklist?.with as { entries: ExceptionEntryInput[] };
    // BlocklistValidator accepts only `match_any` + `included` with an array
    // value on hash fields; the generic step schema also accepts `is`, which
    // maps to `match` and fails the write at run time.
    expect(toApiEntries(entries)).toStrictEqual([
      {
        type: 'match_any',
        field: 'file.hash.sha256',
        operator: 'included',
        value: ['{{ inputs.sha256 }}'],
      },
    ]);
  });

  it('derives a single sandbox OS for the blocklist artifact', () => {
    const blocklist = steps.find(({ type }) => type === 'security.createExceptionListItem');
    const input = blocklist?.with as { os_types: string[] };
    // The endpoint artifact validator enforces exactly one OS per item
    // (BasicEndpointExceptionDataSchema: minSize 1, maxSize 1) — a constraint
    // the generic exception-list schema does not encode. Multiple OSes fail
    // the write at run time with EndpointArtifactError, which is why the OS
    // is templated from the verdict output instead of enumerated here.
    expect(input.os_types).toHaveLength(1);
    expect(input.os_types[0]).toContain('steps.verdict.output.vm_os_family');
    // A deduplicated submit can return an earlier run without a recorded OS;
    // the template must still render a value instead of an empty string.
    expect(input.os_types[0]).toMatch(/\| default: '(linux|windows|macos)'/);
    // And the detonate step must actually record the OS, or the template
    // renders empty and the write fails the same validator from below.
    const detonate = steps.find(
      ({ type, with: stepWith }) =>
        type === 'detonate.prototype.detonateSample' &&
        Boolean((stepWith as { vm_os_family?: string } | undefined)?.vm_os_family)
    );
    expect(detonate).toBeDefined();
  });

  it('guards every hunt so an empty IOC family never compiles an invalid IN', () => {
    const hunts = steps.filter(({ type }) => type === 'elasticsearch.esql.query');
    // Two indicator families the extractor produces: domains and IPs.
    expect(hunts).toHaveLength(2);

    for (const hunt of hunts) {
      // The `if` must key on the family being non-empty AND the whole
      // `extracted_iocs` being present — an absent field (service
      // predates extraction) renders `.size` as 0 in this engine, but
      // the explicit `!= blank` keeps that from being load-bearing.
      expect(hunt.if).toContain('steps.detonate.output.extracted_iocs != blank');
      // A stack without endpoint network data fails the hunt at
      // verification; the verdict is already on the alert by then, so
      // the hunt degrades instead of failing the run.
      expect(hunt['on-failure']).toEqual({ continue: true });
    }

    // Negative control: no hunt may template a family other than
    // domains/ips (file_hashes would need a different field, and none
    // exists in endpoint network data).
    const queries = hunts.map((hunt) => (hunt.with as { query: string }).query);
    expect(queries.some((q) => q.includes('file_hashes'))).toBe(false);
  });

  it('hunts carry a bounded LIMIT', () => {
    const hunts = steps.filter(({ type }) => type === 'elasticsearch.esql.query');
    for (const hunt of hunts) {
      const query = (hunt.with as { query: string }).query;
      expect(query).toMatch(/\| LIMIT 100\s*$/);
    }
  });

  it('bounds every hunt to the 30-day window its note reports', () => {
    const hunts = steps.filter(({ type }) => type === 'elasticsearch.esql.query');
    expect(hunts.length).toBeGreaterThan(0);
    for (const hunt of hunts) {
      expect((hunt.with as { query: string }).query).toContain('WHERE @timestamp >= NOW() - 30d');
    }
  });

  it('attributes the blocklist entry from a variable, not the evictable gate output', () => {
    const resolve = steps.find(({ name }) => name === 'resolve_blocklist_gate');
    expect((resolve?.with as Record<string, string>).blocklist_responded_by).toBe(
      '{{ steps.blocklist_gate.output.respondedBy }}'
    );
    const blocklist = steps.find(({ type }) => type === 'security.createExceptionListItem');
    const comments = (blocklist?.with as { comments: string[] }).comments;
    expect(comments.join('\n')).toContain('{{ variables.blocklist_responded_by }}');
    expect(comments.join('\n')).not.toContain('steps.blocklist_gate.output');
  });

  it('writes hunt results to the alert only when a hunt found hosts', () => {
    const note = steps.find(({ type }) => type === 'security.createNote');
    // Exactly one createNote lives in the detonate branch (the
    // known-malicious branch has its own `note_known`); find the hunt one.
    const huntNote = steps.find(
      ({ type, with: stepWith }) =>
        type === 'security.createNote' &&
        String((stepWith as { text?: string } | undefined)?.text ?? '').includes('Detonate hunt')
    );
    expect(huntNote).toBeDefined();
    expect(note).toBeDefined();

    // The note only fires when at least one hunt returned rows.
    expect(huntNote?.if).toContain('steps.hunt_domains.output.values.size > 0');
    expect(huntNote?.if).toContain('steps.hunt_ips.output.values.size > 0');

    // Its text never reads a hunt output unguarded — each assign is
    // wrapped in an `!= blank` branch with an empty-array fallback, so
    // a skipped hunt (nil output) cannot crash the render.
    const text = (huntNote?.with as { text: string }).text;
    expect(text).toContain("| map: 'first'");
    expect(text).toContain('| concat:');
    expect(text).toContain('if steps.hunt_domains.output != blank');
    expect(text).toContain('if steps.hunt_ips.output != blank');
    expect(text.match(/\| split: ','/g)).toHaveLength(2);
  });

  describe('F7 proposals', () => {
    interface ProposalWith {
      'workflow-id': string;
      'run-as-mode': string;
      inputs: {
        conversationId: string;
        comment: string;
        actionWorkflowId: string;
        actionInput: Record<string, unknown>;
        category: string;
        impact: string;
        confidence: string;
        autoApprove: boolean;
      };
    }

    const byName = (name: string) => steps.find((step) => step.name === name);
    const proposalWith = (name: string) => byName(name)?.with as ProposalWith;

    it('raises both proposals async through the AlertZero bridge as the inherited identity', () => {
      for (const name of ['propose_exception', 'propose_close']) {
        const step = byName(name);
        // Async: the run must never park on an analyst decision.
        expect(step?.type).toBe('workflow.executeAsync');
        // The engine only delegates the Watch's service account on a literal
        // child id paired with a literal `inherit`.
        expect(proposalWith(name)['workflow-id']).toBe('system-create-alertzero-proposal');
        expect(proposalWith(name)['run-as-mode']).toBe('inherit');
        // Fail-closed: every proposal waits for an analyst.
        expect(proposalWith(name).inputs.autoApprove).toBe(false);
        // The verdict is already on the alert; a failed proposal must not fail the run.
        expect(step?.['on-failure']).toEqual({ continue: true });
        expect(proposalWith(name).inputs.conversationId).toBe('{{ inputs.conversation_id }}');
        expect(proposalWith(name).inputs.comment.length).toBeGreaterThan(0);
      }
    });

    it('only a Watch-driven run, which passes an Investigation, reaches either proposal', () => {
      // Each proposal is guarded on a step that is itself skipped without one.
      expect(byName('run_history')?.if).toContain('inputs.conversation_id != blank');
      expect(byName('open_hash_alerts')?.if).toContain('inputs.conversation_id != blank');
      expect(byName('propose_exception')?.if).toContain(
        'steps.run_history.output.proposal_eligible == true'
      );
      expect(byName('propose_close')?.if).toContain('variables.close_alert_count > 0');
    });

    it('keys the exception proposal on a quiet verdict and the close proposal on a malicious one', () => {
      expect(byName('run_history')?.if).toContain("steps.verdict.output.verdict == 'quiet'");
      expect(byName('open_hash_alerts')?.if).toContain(
        "steps.verdict.output.verdict == 'malicious'"
      );
      // Negative control: neither guard admits the other verdict.
      expect(byName('run_history')?.if).not.toContain("'malicious'");
      expect(byName('open_hash_alerts')?.if).not.toContain("'quiet'");
    });

    it('proposes a single-hash exception on the rule that raised the alert', () => {
      const { inputs } = proposalWith('propose_exception');
      expect(inputs.actionWorkflowId).toBe('system-alertzero-action-add-rule-exception');
      expect(inputs.actionInput).toEqual(
        expect.objectContaining({
          rule_id: '{{ variables.exception_rule_uuid }}',
          name: expect.any(String),
          description: expect.any(String),
          entries: [{ field: 'file.hash.sha256', operator: 'is', value: '{{ inputs.sha256 }}' }],
        })
      );
      // A stale-revision check would need the rule's revision; omitted on purpose.
      expect(inputs.actionInput).not.toHaveProperty('expected_revision');
      expect(byName('propose_exception')?.if).toContain('variables.exception_rule_uuid != blank');
      expect(inputs).toEqual(
        expect.objectContaining({ category: 'configure', impact: 'low', confidence: 'medium' })
      );
    });

    it('proposes a true-positive close, never the false-positive action', () => {
      const { inputs } = proposalWith('propose_close');
      expect(inputs.actionWorkflowId).toBe('system-alertzero-action-close-alerts-tp');
      expect(inputs.actionInput).toEqual({
        alertIds: '${{ variables.close_alert_ids }}',
        reason: 'true_positive',
      });
      expect(inputs).toEqual(
        expect.objectContaining({ category: 'respond', impact: 'medium', confidence: 'high' })
      );
      // Only open alerts on this exact sample are proposed for closing.
      const search = byName('open_hash_alerts')?.with as {
        size: number;
        query: {
          bool: {
            filter: Array<Record<string, Record<string, string>>>;
            should: unknown[];
            minimum_should_match: number;
          };
        };
      };
      expect(search.size).toBeLessThanOrEqual(100);
      expect(search.query.bool.filter).toEqual([
        { term: { 'file.hash.sha256': '{{ inputs.sha256 }}' } },
        { term: { 'kibana.alert.workflow_status': 'open' } },
      ]);
      // A sibling another run already gave a verdict is that run's proposal.
      expect(search.query.bool.minimum_should_match).toBe(1);
      expect(search.query.bool.should).toEqual([
        { ids: { values: ['{{ inputs.alert_id }}'] } },
        {
          bool: {
            must_not: [
              {
                terms: {
                  'kibana.alert.workflow_tags': [
                    'detonate:malicious',
                    'detonate:quiet',
                    'detonate:inconclusive',
                    'detonate:known-malicious',
                  ],
                },
              },
            ],
          },
        },
      ]);
    });

    it('tags every sibling in the close proposal so a later sweep skips the sample', () => {
      const tag = byName('tag_hash_siblings');
      expect(tag?.type).toBe('security.setAlertTags');
      expect(tag?.if).toBe(byName('propose_close')?.if);
      expect(tag?.with).toEqual({
        alert_ids: '${{ variables.close_alert_ids }}',
        tags_to_add: ['detonate:malicious'],
      });
      expect(tag?.['on-failure']).toEqual({ continue: true });
    });

    it('raises proposals before the blocklist approval gate can hold the run', () => {
      const gateIndex = steps.findIndex(({ type }) => type === 'waitForApproval');
      for (const name of ['propose_exception', 'propose_close']) {
        expect(steps.findIndex((step) => step.name === name)).toBeLessThan(gateIndex);
      }
    });
  });
});

describe.each([
  ['detonate triage', DETONATE_TRIAGE_WORKFLOW],
  ['detonate fp validation', DETONATE_FP_VALIDATION_WORKFLOW],
])('%s managed workflow conditions', (_label, definition) => {
  const workflowSteps = collectSteps((parse(definition.yaml) as { steps: WorkflowStep[] }).steps);

  it('writes every if/condition as a typed ${{ }} expression', () => {
    // A plain `{{ }}` renders to the string "true"/"false", which the engine
    // hands to KQL, and KQL evaluates a bare `true` as false: the branch
    // could never run.
    const guards = workflowSteps.flatMap(({ if: stepIf, condition }) =>
      [stepIf, condition].filter((value): value is string => typeof value === 'string')
    );
    expect(guards.length).toBeGreaterThan(0);
    for (const guard of guards) {
      expect(guard.trim()).toMatch(/^\$\{\{.*\}\}$/s);
    }
  });
});
