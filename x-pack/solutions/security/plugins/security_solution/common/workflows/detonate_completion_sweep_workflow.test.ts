/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DETONATE_COMPLETION_SWEEP_WORKFLOW } from '@kbn/workflows/managed';
import { parse } from 'yaml';
import { DetonateCompletedRunsStepId } from './step_types/detonate_prototype/detonate_completed_runs_step_common';
import { applyDetonationVerdictInputSchema } from './step_types/detonate_prototype/apply_detonation_verdict_step_common';

interface WorkflowStep {
  type?: string;
  name?: string;
  if?: string;
  condition?: string;
  foreach?: string;
  'on-failure'?: { continue?: boolean };
  'iteration-on-failure'?: { continue?: boolean };
  steps?: WorkflowStep[];
  with?: Record<string, unknown>;
}

const collectSteps = (steps: WorkflowStep[] = []): WorkflowStep[] =>
  steps.flatMap((step) => [step, ...collectSteps(step.steps)]);

describe('detonate completion sweep managed workflow', () => {
  const workflow = parse(DETONATE_COMPLETION_SWEEP_WORKFLOW.yaml) as {
    enabled: boolean;
    triggers: Array<{ type: string; with?: { every?: string } }>;
    settings?: { concurrency?: Record<string, unknown> };
    steps: WorkflowStep[];
  };
  const steps = collectSteps(workflow.steps);
  const byName = (name: string) => steps.find((step) => step.name === name);

  it('ships disabled, so the schedule only runs once an operator turns it on', () => {
    expect(workflow.enabled).toBe(false);
    expect(DETONATE_COMPLETION_SWEEP_WORKFLOW.management.enablement).toBe('restorable');
  });

  it('runs on a schedule and by hand', () => {
    expect(workflow.triggers).toEqual([
      { type: 'scheduled', with: { every: '5m' } },
      { type: 'manual' },
    ]);
  });

  it('drops an overlapping sweep instead of queueing it', () => {
    expect(workflow.settings?.concurrency).toEqual({
      key: 'detonate-completion-sweep',
      strategy: 'drop',
      max: 1,
    });
  });

  it('starts no detonation and no triage run', () => {
    const types = steps.map(({ type }) => type);
    expect(types).not.toContain('detonate.prototype.detonateSample');
    expect(types).not.toContain('workflow.execute');
    expect(types).not.toContain('workflow.executeAsync');
    expect(DETONATE_COMPLETION_SWEEP_WORKFLOW.yaml).not.toContain(
      'system-security-detonate-triage'
    );
  });

  it('reads pending write-backs through the completed-runs step', () => {
    expect(workflow.steps[0]).toMatchObject({
      name: 'completed_runs',
      type: DetonateCompletedRunsStepId,
    });
  });

  it('opens an Investigation only when there is something to write back', () => {
    expect(byName('create_investigation')).toMatchObject({
      type: 'ai.conversation.create',
      if: '${{ steps.completed_runs.output.pending_count > 0 }}',
      with: { template_id: 'investigation', access_control: { access_mode: 'public' } },
    });
  });

  it('applies each pending verdict, and one failed alert does not stop the rest', () => {
    const writeBack = byName('write_back');
    expect(writeBack).toMatchObject({
      type: 'foreach',
      foreach: '${{ steps.completed_runs.output.pending }}',
      'iteration-on-failure': { continue: true },
    });
    const apply = writeBack?.steps?.[0];
    expect(apply?.type).toBe('detonate.prototype.applyDetonationVerdict');
    // Apply must fail its iteration (not continue) so the journal never
    // records a verdict that did not land.
    expect(apply?.['on-failure']).toBeUndefined();
    expect(Object.keys(apply?.with ?? {}).sort()).toEqual(
      Object.keys(applyDetonationVerdictInputSchema.shape).sort()
    );
  });

  it('journals into the sweep Investigation after the write-back, best-effort', () => {
    const [apply, journal] = byName('write_back')?.steps ?? [];
    expect(apply?.name).toBe('apply');
    expect(journal).toMatchObject({
      type: 'ai.conversation.add_user_message',
      'on-failure': { continue: true },
      with: { conversation_id: '{{ steps.create_investigation.output.conversation_id }}' },
    });
  });

  it('writes every if/condition as a typed ${{ }} expression', () => {
    const guards = steps.flatMap(({ if: stepIf, condition }) =>
      [stepIf, condition].filter((value): value is string => typeof value === 'string')
    );
    expect(guards.length).toBeGreaterThan(0);
    for (const guard of guards) {
      expect(guard.trim()).toMatch(/^\$\{\{.*\}\}$/s);
    }
  });
});
