/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0. You may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERTZERO_WORKER_FORENSICS_DETONATE_SAMPLE_WORKFLOW,
  DETONATE_FP_VALIDATION_WORKFLOW,
  DETONATE_TRIAGE_WORKFLOW,
} from '@kbn/workflows/managed';
import { parse } from 'yaml';
import type { ExceptionEntryInput } from '@kbn/securitysolution-exceptions-common/workflows';
import { toApiEntries } from '../detection_engine/rule_exceptions/to_api_entries';
import { createExceptionListItemInputSchema } from './step_types/create_exception_list_item_step/create_exception_list_item_step_common';

/**
 * Managed workflows install under lightweight validation, so a plugin step's
 * `with` block is only deep-checked against the step's real input schema at
 * execution time. This suite parses the detonate workflows' YAML and
 * validates the blocklist step's `with` against
 * `createExceptionListItemInputSchema` here, so a malformed entry shape fails
 * CI instead of a demo run. The detonation chain lives in the Forensics
 * Watch's Detonate sample worker; the triage workflow is the thin relay that
 * hops to it, so the per-run contracts below parse the worker's rendered
 * template.
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

interface ParsedWorkflow {
  steps: WorkflowStep[];
  settings?: { concurrency?: Record<string, unknown> };
  triggers?: Array<{
    type: string;
    inputs?: {
      required?: string[];
      properties: Record<string, { minLength?: number; maxLength?: number }>;
    };
  }>;
}

/** Depth-first step walker covering every container the schema allows. */
const collectSteps = (steps: WorkflowStep[] = []): WorkflowStep[] =>
  steps.flatMap((step) => [
    step,
    ...collectSteps(step.steps),
    ...collectSteps(step.default),
    ...collectSteps(step.cases?.flatMap(({ steps: caseSteps }) => caseSteps ?? [])),
  ]);

/** The worker's template must be rendered (tokens replaced) before parsing. */
const WORKER_YAML = ALERTZERO_WORKER_FORENSICS_DETONATE_SAMPLE_WORKFLOW.yamlTemplate({
  settingsVersion: 1,
  autonomyLevel: 'manual',
  scheduleInterval: '1h',
});

describe('detonate triage relay workflow', () => {
  const relay = parse(DETONATE_TRIAGE_WORKFLOW.yaml) as ParsedWorkflow;
  const relaySteps = collectSteps(relay.steps);

  it('declares no concurrency key of its own, so the hop does not compete with its caller for the per-hash slot', () => {
    // The worker's per-run mode owns the `detonate-<sha256>` slot. The engine holds a workflow's
    // slot across a synchronous `workflow.execute`, so a relay-level copy of the same key makes
    // every hop drop ("Dropped due to concurrency limit") — verified live on the prototype stack.
    expect(relay.settings?.concurrency).toBeUndefined();
  });

  it('is a single synchronous hop to the per-space worker copy under the default run-as mode', () => {
    const hop = relaySteps.find(({ type }) => type === 'workflow.execute');
    expect(hop).toBeDefined();
    const input = hop?.with as {
      'workflow-id': string;
      'run-as-mode'?: string;
      inputs: Record<string, string>;
    };
    expect(input['workflow-id']).toBe(
      'system-security-forensics-detonate-sample-{{ workflow.spaceId }}'
    );
    // Absent, not spelled 'default': the schema default is the behavior.
    expect(input['run-as-mode']).toBeUndefined();
    expect(input.inputs).toEqual({
      sha256: '{{ inputs.sha256 }}',
      alert_id: '{{ inputs.alert_id }}',
      case_id: '{{ inputs.case_id }}',
      conversation_id: '{{ inputs.conversation_id }}',
    });
    // The relay adds nothing of its own: one step only.
    expect(relaySteps).toHaveLength(1);
  });

  it('stays manual-trigger-only with sha256 and alert_id required', () => {
    const manual = relay.triggers?.find(({ type }) => type === 'manual');
    expect(manual?.inputs?.required).toEqual(['sha256', 'alert_id']);
    expect(manual?.inputs?.properties.sha256).toMatchObject({
      minLength: 64,
      maxLength: 64,
    });
  });
});

describe('detonate sample worker (managed workflow, per-run mode)', () => {
  const workflow = parse(WORKER_YAML) as ParsedWorkflow;
  const steps = collectSteps(workflow.steps);
  const byName = (name: string) => steps.find((step) => step.name === name);

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
    // A task without a recorded OS must still render a value, not an empty string.
    expect(input.os_types[0]).toMatch(/\| default: '(linux|windows|darwin)'/);
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
    // The worker's sweep queries are esql too; the hunts are the two keyed on
    // the detonation's extracted_iocs.
    const hunts = steps.filter(
      ({ type, if: guard }) =>
        type === 'elasticsearch.esql.query' && guard?.includes('extracted_iocs')
    );
    // Two indicator families the extractor produces: domains and IPs.
    expect(hunts).toHaveLength(2);

    for (const hunt of hunts) {
      // The `if` must key on the family being non-empty AND the whole
      // `extracted_iocs` being present — an absent field (alert documents
      // unreadable) renders `.size` as 0 in this engine, but
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
    const hunts = steps.filter(
      ({ type, if: guard }) =>
        type === 'elasticsearch.esql.query' && guard?.includes('extracted_iocs')
    );
    for (const hunt of hunts) {
      const query = (hunt.with as { query: string }).query;
      expect(query).toMatch(/\| LIMIT 100\s*$/);
    }
  });

  it('bounds every hunt to the 30-day window its note reports', () => {
    const hunts = steps.filter(
      ({ type, if: guard }) =>
        type === 'elasticsearch.esql.query' && guard?.includes('extracted_iocs')
    );
    expect(hunts.length).toBeGreaterThan(0);
    for (const hunt of hunts) {
      expect((hunt.with as { query: string }).query).toContain('WHERE @timestamp >= NOW() - 30d');
    }
  });

  it('attributes the blocklist entry from a variable, not the evictable gate output', () => {
    const resolve = byName('resolve_blocklist_gate');
    expect((resolve?.with as Record<string, string>).blocklist_responded_by).toBe(
      '{{ steps.blocklist_gate.output.respondedBy }}'
    );
    const blocklist = steps.find(({ type }) => type === 'security.createExceptionListItem');
    const comments = (blocklist?.with as { comments: string[] }).comments;
    expect(comments.join('\n')).toContain('{{ variables.blocklist_responded_by }}');
    expect(comments.join('\n')).not.toContain('steps.blocklist_gate.output');
  });

  it('writes hunt results to the alert only when a hunt found hosts', () => {
    const huntNote = byName('hunt_note');
    expect(huntNote).toBeDefined();

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

    it('keys the exception proposal on a benign verdict and the close proposal on a malicious one', () => {
      expect(byName('run_history')?.if).toContain("steps.verdict.output.verdict == 'benign'");
      expect(byName('open_hash_alerts')?.if).toContain(
        "steps.verdict.output.verdict == 'malicious'"
      );
      // Negative control: neither guard admits the other verdict.
      expect(byName('run_history')?.if).not.toContain("'malicious'");
      expect(byName('open_hash_alerts')?.if).not.toContain("'benign'");
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
                    'detonate:benign',
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
  ['detonate fp validation', DETONATE_FP_VALIDATION_WORKFLOW.yaml],
  ['detonate sample worker', WORKER_YAML],
])('%s managed workflow conditions', (_label, yaml) => {
  const workflowSteps = collectSteps((parse(yaml) as ParsedWorkflow).steps);

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

  it('accepts exactly a sha256 on the manual trigger, matching the prior-run route', () => {
    const { triggers } = parse(yaml) as ParsedWorkflow;
    const manual = triggers?.find(({ type }) => type === 'manual');
    expect(manual?.inputs?.properties.sha256).toMatchObject({ minLength: 64, maxLength: 64 });
  });

  it('passes the detonate step no force_fresh, which the service does not accept', () => {
    const { triggers } = parse(yaml) as ParsedWorkflow;
    const manual = triggers?.find(({ type }) => type === 'manual');
    expect(manual?.inputs?.properties).not.toHaveProperty('force_fresh');
    const detonate = workflowSteps.find(({ type }) => type === 'detonate.prototype.detonateSample');
    expect(detonate?.with).not.toHaveProperty('force_fresh');
  });
});
