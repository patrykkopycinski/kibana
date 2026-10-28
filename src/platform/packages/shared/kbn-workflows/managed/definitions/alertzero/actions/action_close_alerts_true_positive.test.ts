/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import ACTION_CLOSE_ALERTS_TRUE_POSITIVE_YAML from './action_close_alerts_true_positive.yaml';
import { createWorkflowLiquidEngine } from '../../../../common/utils';

interface ParsedStep {
  name: string;
  type: string;
  if?: string;
  with?: Record<string, unknown>;
}

describe('Close alerts as true positive action', () => {
  const workflow = parse(ACTION_CLOSE_ALERTS_TRUE_POSITIVE_YAML) as {
    consts?: { actionMetadata?: { category?: string; approvalPolicy?: string } };
    steps: ParsedStep[];
  };
  const stepNamed = (name: string): ParsedStep => {
    const step = workflow.steps.find((candidate) => candidate.name === name);
    if (!step) throw new Error(`step ${name} not found`);
    return step;
  };
  const engine = createWorkflowLiquidEngine();

  it('queues under Respond and always waits for a human', () => {
    expect(workflow.consts?.actionMetadata?.category).toBe('respond');
    expect(workflow.consts?.actionMetadata?.approvalPolicy).toBe('always-gate');
  });

  it('closes, checks completeness, then writes the verdict tag', () => {
    expect(workflow.steps.map((step) => step.name)).toEqual([
      'close_alerts',
      'fail_incomplete_close',
      'set_verdict_tag',
      'emit_result',
    ]);
  });

  // Approving a proposal runs this with the proposal's `alertIds`; any clause beyond the ids
  // would close alerts the analyst was never shown.
  it('closes only the alerts named in the approved input', () => {
    expect(stepNamed('close_alerts').with).toEqual({
      status: 'closed',
      reason: 'true_positive',
      conflicts: 'proceed',
      query: { bool: { filter: { terms: { _id: '${{ inputs.actionInput.alertIds }}' } } } },
    });
  });

  // Without the verdict tag the next triage sweep re-claims the closed alert, and the
  // AlertZero views that filter on az:* verdicts miss it.
  it('tags the same alerts az:true_positive and clears competing verdict and claim tags', () => {
    const tagStep = stepNamed('set_verdict_tag');

    expect(tagStep.type).toBe('kibana.SetAlertTags');
    expect(tagStep.with).toEqual({
      ids: '${{ inputs.actionInput.alertIds }}',
      tags: {
        tags_to_remove: ['az:false_positive', 'az:inconclusive', 'az:triage_pending'],
        tags_to_add: ['az:true_positive'],
      },
    });
  });

  it('fails when fewer alerts were closed than requested', () => {
    const expression = (stepNamed('fail_incomplete_close').if as string)
      .replace(/^\$\{\{/, '')
      .replace(/\}\}$/, '')
      .trim();
    const evaluate = (updated: number): unknown =>
      engine.evalValueSync(expression, {
        steps: { close_alerts: { output: { updated } } },
        inputs: { actionInput: { alertIds: ['alert-1', 'alert-2'] } },
      });

    expect(evaluate(2)).toBe(false);
    expect(evaluate(1)).toBe(true);
    expect(evaluate(0)).toBe(true);
  });
});
