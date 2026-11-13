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
 * Public License, v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0".
 */

import { parse } from 'yaml';
import { ALERTZERO_WORKER_FORENSICS_DETONATE_SAMPLE_WORKFLOW } from './forensics_detonate_sample';
import { convertToWorkflowGraph } from '../../../graph/build_execution_graph/build_execution_graph';
import type { WorkflowYaml } from '../../../spec/schema';
import { DETONATE_TRIAGE_WORKFLOW_ID } from '../detonate_prototype';

interface YamlStep {
  name: string;
  type: string;
  mode?: string;
  if?: string;
  expression?: string;
  match?: string;
  foreach?: string;
  timeout?: string;
  'on-failure'?: unknown;
  with?: Record<string, unknown> & {
    inputs?: Record<string, unknown>;
    query?: string;
  };
  steps?: YamlStep[];
  cases?: (YamlStep & { match: string })[];
  default?: YamlStep[];
}

const worker = parse(
  ALERTZERO_WORKER_FORENSICS_DETONATE_SAMPLE_WORKFLOW.yamlTemplate({
    settingsVersion: 1,
    autonomyLevel: 'manual',
    scheduleInterval: '1h',
  })
) as { steps: YamlStep[]; settings?: Record<string, unknown>; triggers?: unknown[] };

const stepByName = (name: string): YamlStep | undefined => {
  const walk = (steps: YamlStep[]): YamlStep | undefined =>
    steps.reduce<YamlStep | undefined>(
      (found, step) =>
        found ??
        (step.name === name
          ? step
          : walk(step.steps ?? []) ??
            walk(step.default ?? []) ??
            (step.cases ?? []).reduce<YamlStep | undefined>(
              (caseFound, c) => caseFound ?? walk(c.steps ?? []),
              undefined
            )),
      undefined
    );
  return walk(worker.steps);
};

const ALERT_OUTCOMES_PATH = '/s/{{ workflow.spaceId }}/internal/detonate_prototype/alert_outcomes';
const DECISIONS_PATH = '/s/{{ workflow.spaceId }}/internal/detonate_prototype/decisions';

const decisionsOf = (step: YamlStep | undefined): Array<Record<string, unknown>> =>
  ((step?.with?.body as { decisions?: Array<Record<string, unknown>> } | undefined)?.decisions ??
    []) as Array<Record<string, unknown>>;

describe('Detonate sample worker (Forensics Watch)', () => {
  it('compiles to an execution graph, so both modes are runnable', () => {
    expect(() => convertToWorkflowGraph(worker as unknown as WorkflowYaml)).not.toThrow();
  });

  it('keeps one execution per sample: the concurrency key is the hash, not the run', () => {
    expect(worker.settings?.concurrency).toEqual({
      key: 'detonate-{{ inputs.sha256 }}',
      strategy: 'drop',
      max: 1,
    });
  });

  describe('candidate query', () => {
    const query = String(stepByName('find_candidates')?.with?.query ?? '');

    it('never reads detonate state off the alert: production alerts carry none', () => {
      expect(query).not.toContain('MV_CONTAINS');
      expect(query).not.toContain('workflow_tags');
      expect(query).not.toContain('detonate:');
    });

    it('over-fetches 200 hashes, so the decisions filter still leaves a full sweep', () => {
      expect(query).toContain('LIMIT 200');
    });

    it('asks the decisions store which rows to leave alone, and fails the sweep without it', () => {
      const filter = stepByName('filter_candidates');
      expect(filter?.type).toBe('kibana.request');
      expect(filter?.with?.method).toBe('POST');
      expect(filter?.with?.path).toBe(ALERT_OUTCOMES_PATH);
      expect(filter?.with?.body).toEqual({
        alert_ids: "${{ steps.find_candidates.output.values | map: 'first' }}",
      });
      expect(filter?.['on-failure']).toEqual({ retry: { 'max-attempts': 3, delay: '5s' } });
    });

    it('only picks up open alerts, so a closed or acknowledged one is never re-detonated', () => {
      expect(query).toContain('WHERE kibana.alert.workflow_status == "open"');
    });

    it('orders columns alert-first, so map: first in mark_queued yields alert ids', () => {
      expect(query).toContain('KEEP first_alert, file.hash.sha256');
    });
  });

  describe('malicious sibling lookup', () => {
    it('does not filter siblings on alert tags', () => {
      expect(JSON.stringify(stepByName('open_hash_alerts')?.with?.query)).not.toContain(
        'detonate:'
      );
    });

    it('drops the siblings the decisions store covers, and degrades to this run when it fails', () => {
      const filter = stepByName('filter_hash_siblings');
      expect(filter?.with?.path).toBe(ALERT_OUTCOMES_PATH);
      expect(filter?.['on-failure']).toEqual({ continue: true });
      expect(String(stepByName('resolve_proposals')?.with?.close_alert_ids)).toContain(
        'id != inputs.alert_id and (variables.sibling_lookup_ok != true'
      );
    });

    it('records the verdict for every sibling in the close proposal', () => {
      const tag = stepByName('tag_hash_siblings');
      expect(tag?.type).toBe('kibana.request');
      expect(tag?.with?.path).toBe(DECISIONS_PATH);
      expect(String((tag?.with?.body as { decisions: string }).decisions)).toContain(
        'sibling_decisions_json'
      );
    });
  });

  describe('supervised auto-candidates', () => {
    const gate = stepByName('find_auto_candidates');
    const query = String(gate?.with?.query ?? '');

    it('only runs on a scheduled sweep with supervised autonomy', () => {
      expect(gate?.if).toBe(
        "${{ inputs.sha256 == blank and execution.triggeredBy == 'scheduled' and consts.worker_settings.autonomy == 'supervised' }}"
      );
    });

    it('narrows to the severity the deck names', () => {
      expect(query).toContain('WHERE kibana.alert.severity IN ("high", "critical")');
    });

    it('reads no alert tags, and goes through the same decisions filter as the reporting query', () => {
      expect(query).not.toContain('MV_CONTAINS');
      expect(query).toContain('LIMIT 200');
      const filter = stepByName('filter_auto_candidates');
      expect(filter?.with?.path).toBe(ALERT_OUTCOMES_PATH);
      expect(filter?.with?.body).toEqual({
        alert_ids: "${{ steps.find_auto_candidates.output.values | map: 'first' }}",
      });
    });

    it('caps the dispatch at 20 samples after the filter', () => {
      expect(String(stepByName('resolve_candidates')?.with?.auto_rows)).toContain('| slice: 0, 20');
    });
  });

  describe('allowance', () => {
    it('reads the usage route without a body, as a GET', () => {
      const check = stepByName('check_allowance');
      expect(check?.with?.method).toBe('GET');
      expect(String(check?.with?.path)).toBe(
        '/s/{{ workflow.spaceId }}/internal/detonate_prototype/usage'
      );
    });

    it('marks only the auto-candidates queued, never the manual-mode backlog', () => {
      const queued = stepByName('mark_queued');
      expect(queued?.type).toBe('kibana.request');
      expect(String(queued?.if)).toContain('variables.auto_count > 0');
      expect(String(queued?.if)).toContain('variables.allowance_exhausted == true');
      expect(queued?.with?.path).toBe(DECISIONS_PATH);
      expect(queued?.['on-failure']).toEqual({ continue: true });
      expect(queued?.with?.body).toEqual({
        decisions: '${{ variables.queued_decisions_json | json_parse }}',
      });
      expect(String(stepByName('count_candidates')?.with?.queued_decisions_json)).toContain(
        '"state":"queued"'
      );
    });
  });

  describe('fan-out', () => {
    const fanOut = stepByName('detonate_fan_out');
    const branch = stepByName('detonate_hash');

    it('isolates one failed start from the other hashes', () => {
      expect(fanOut?.type).toBe('parallel');
      expect(fanOut?.mode).toBe('settled');
    });

    it('dispatches from the auto-candidate set only when the allowance holds', () => {
      expect(String(fanOut?.if)).toContain('variables.auto_count > 0');
      expect(String(fanOut?.if)).toContain('variables.allowance_exhausted != true');
      expect(String(fanOut?.foreach)).toBe('${{ variables.auto_rows }}');
    });

    it('keeps the branch body free of on-failure, which a parallel branch cannot drive', () => {
      expect(fanOut?.steps?.every((step) => step['on-failure'] === undefined)).toBe(true);
    });

    it('starts the detonate triage relay by literal id under the inherited identity', () => {
      expect(branch?.type).toBe('workflow.executeAsync');
      expect(branch?.with?.['workflow-id']).toBe(DETONATE_TRIAGE_WORKFLOW_ID);
      expect(branch?.with?.['run-as-mode']).toBe('inherit');
    });

    it('hands the relay positional rows in alert-first order', () => {
      expect(branch?.with?.inputs).toEqual({
        alert_id: '{{ foreach.item[0] }}',
        sha256: '{{ foreach.item[1] }}',
        conversation_id: '{{ steps.create_investigation.output.conversation_id }}',
      });
    });
  });

  describe('per-run mode', () => {
    it('marks the alert running before any VM is spent, and never fails the run for it', () => {
      const running = stepByName('mark_running');
      expect(running?.type).toBe('kibana.request');
      expect(running?.if).toBe('${{ inputs.sha256 != blank }}');
      expect(running?.['on-failure']).toEqual({ continue: true });
      expect(running?.with?.path).toBe(DECISIONS_PATH);
      expect(decisionsOf(running)).toEqual([
        {
          alert_id: '{{ inputs.alert_id }}',
          state: 'running',
          sha256: '{{ inputs.sha256 }}',
          execution_id: '{{ execution.id }}',
        },
      ]);
    });

    it('records a known-malicious decision from the reputation gate', () => {
      const known = stepByName('tag_known');
      expect(known?.with?.path).toBe(DECISIONS_PATH);
      expect(decisionsOf(known)).toEqual([
        expect.objectContaining({ state: 'known_malicious', verdict: 'malicious' }),
      ]);
    });

    it('gates the reputation lookup and its switch to per-run mode', () => {
      expect(stepByName('reputation')?.if).toBe('${{ inputs.sha256 != blank }}');
      expect(stepByName('reputation_gate')?.if).toBe('${{ inputs.sha256 != blank }}');
    });

    it('cannot fall through the switch into a detonation on a sweep run', () => {
      const gate = stepByName('reputation_gate');
      expect(String(gate?.expression)).toContain('{% if inputs.sha256 != blank %}');
      expect(String(gate?.expression)).toContain('{% else %}sweep{% endif %}');
      expect(gate?.cases?.map((c) => c.match)).toContain('sweep');
      // The detonate step lives only in the default branch.
      const detonate = stepByName('detonate');
      expect(detonate?.type).toBe('detonate.prototype.detonateSample');
    });

    it('releases the running claim once a verdict lands', () => {
      const clear = stepByName('clear_running');
      expect(clear?.with?.path).toBe(DECISIONS_PATH);
      expect(clear?.['on-failure']).toEqual({ continue: true });
      expect(decisionsOf(clear)).toEqual([expect.objectContaining({ state: 'released' })]);
    });

    it('keeps the blocklist behind the approval gate, never on the verdict alone', () => {
      expect(stepByName('blocklist_gate')?.type).toBe('waitForApproval');
      expect(String(stepByName('blocklist')?.if)).toBe(
        '${{ variables.blocklist_approved == true }}'
      );
    });

    it('writes a global blocklist entry, so the approved hash is blocked on every endpoint', () => {
      expect(stepByName('blocklist')?.with?.tags).toEqual(['policy:all']);
    });
  });

  describe('manual trigger', () => {
    it('keeps every input optional, so the same trigger runs the sweep with no inputs', () => {
      const manual = worker.triggers?.find((t) => (t as { type: string }).type === 'manual') as
        | { inputs?: { required?: string[] } }
        | undefined;
      expect(manual?.inputs?.required).toBeUndefined();
    });
  });
});
