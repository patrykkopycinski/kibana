/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import { ALERTZERO_WORKER_FLOOR_DETONATE_SWEEP_WORKFLOW } from './floor_detonate_sweep';
import { convertToWorkflowGraph } from '../../../graph/build_execution_graph/build_execution_graph';
import type { WorkflowYaml } from '../../../spec/schema';
import { DETONATE_TRIAGE_WORKFLOW_ID } from '../detonate_prototype';

interface YamlStep {
  name: string;
  type: string;
  mode?: string;
  if?: string;
  foreach?: string;
  'on-failure'?: unknown;
  with?: Record<string, unknown> & { inputs?: Record<string, unknown> };
  steps?: YamlStep[];
}

const sweep = parse(
  ALERTZERO_WORKER_FLOOR_DETONATE_SWEEP_WORKFLOW.yamlTemplate({
    settingsVersion: 1,
    autonomyLevel: 'manual',
    scheduleInterval: '1h',
  })
) as { steps: YamlStep[] };

const stepByName = (name: string): YamlStep | undefined => {
  const walk = (steps: YamlStep[]): YamlStep | undefined =>
    steps.reduce<YamlStep | undefined>(
      (found, step) => found ?? (step.name === name ? step : walk(step.steps ?? [])),
      undefined
    );
  return walk(sweep.steps);
};

const VERDICT_TAGS = [
  'detonate:malicious',
  'detonate:quiet',
  'detonate:inconclusive',
  'detonate:known-malicious',
];

describe('File Detonation sweep worker', () => {
  it('compiles to an execution graph, so the parallel fan-out is runnable', () => {
    expect(() => convertToWorkflowGraph(sweep as unknown as WorkflowYaml)).not.toThrow();
  });

  describe('candidate query', () => {
    const query = String(stepByName('find_candidates')?.with?.query ?? '');

    it('reads the tags security.setAlertTags writes, not a field the alerts index lacks', () => {
      expect(query).not.toContain('kibana.alert.tags');
      VERDICT_TAGS.forEach((tag) => {
        expect(query).toContain(`NOT MV_CONTAINS(\`kibana.alert.workflow_tags\`, "${tag}")`);
      });
    });

    it('never uses IN on the tags, which is null on an untagged alert and drops it', () => {
      expect(query).not.toMatch(/workflow_tags`?\s+IN\s*\(/);
    });

    it('dedupes by hash so one sample is detonated once per sweep', () => {
      expect(query).toContain('BY file.hash.sha256');
      expect(query).toContain('KEEP file.hash.sha256, first_alert');
    });
  });

  it('opens an Investigation only when there is something to detonate', () => {
    const gate = '${{ steps.find_candidates.output.values.size > 0 }}';
    expect(stepByName('create_investigation')?.if).toBe(gate);
    expect(stepByName('detonate_fan_out')?.if).toBe(gate);
  });

  it('reports the candidate count without a .size path, which output narrowing drops', () => {
    const output = stepByName('emit_result')?.with ?? {};
    expect(output.candidates).toBe('${{ steps.find_candidates.output.values | size }}');
    expect(JSON.stringify(output)).not.toContain('values.size');
  });

  describe('fan-out', () => {
    const fanOut = stepByName('detonate_fan_out');
    const branch = stepByName('detonate_hash');

    it('isolates one failed start from the other hashes', () => {
      expect(fanOut?.type).toBe('parallel');
      expect(fanOut?.mode).toBe('settled');
    });

    it('keeps the branch body free of on-failure, which a parallel branch cannot drive', () => {
      expect(fanOut?.steps?.every((step) => step['on-failure'] === undefined)).toBe(true);
    });

    it('starts the detonate triage workflow by literal id under the inherited identity', () => {
      expect(branch?.type).toBe('workflow.executeAsync');
      expect(branch?.with?.['workflow-id']).toBe(DETONATE_TRIAGE_WORKFLOW_ID);
      expect(branch?.with?.['run-as-mode']).toBe('inherit');
    });

    it('hands every detonation the sweep Investigation to journal into', () => {
      expect(branch?.with?.inputs).toEqual({
        sha256: '{{ foreach.item[0] }}',
        alert_id: '{{ foreach.item[1] }}',
        conversation_id: '{{ steps.create_investigation.output.conversation_id }}',
      });
    });
  });
});
