/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DETONATE_TRIAGE_WORKFLOW } from '@kbn/workflows/managed';
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
  const workflow = parse(DETONATE_TRIAGE_WORKFLOW.yaml) as { steps: WorkflowStep[] };
  const steps = collectSteps(workflow.steps);

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
});
