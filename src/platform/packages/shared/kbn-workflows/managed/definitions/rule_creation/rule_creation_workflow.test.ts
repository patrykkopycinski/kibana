/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import { SECURITY_RULE_CREATION_WORKFLOW, SECURITY_RULE_CREATION_WORKFLOW_ID } from '.';

interface WorkflowStep {
  name: string;
  type: string;
  if?: string;
  with?: Record<string, unknown>;
}

describe('SECURITY_RULE_CREATION_WORKFLOW yaml', () => {
  const workflow = parse(SECURITY_RULE_CREATION_WORKFLOW.yaml) as {
    steps: WorkflowStep[];
  };

  const stepByName = (name: string): WorkflowStep | undefined =>
    workflow.steps.find((step) => step.name === name);

  it('uses the reserved managed-workflow id so it installs server-side, not via the public API', () => {
    expect(SECURITY_RULE_CREATION_WORKFLOW_ID).toBe('system-security-rule-creation');
    expect(SECURITY_RULE_CREATION_WORKFLOW.id).toBe(SECURITY_RULE_CREATION_WORKFLOW_ID);
  });

  it('drafts the rule through the detection-rule-edit skill', () => {
    const draft = stepByName('draft_creation');

    expect(draft).toBeDefined();
    expect(draft?.type).toBe('ai.agent');
    expect(draft?.with?.message).toContain('skill://detection-rule-edit');
    expect(draft?.with?.message).toContain('security.create_detection_rule');
  });

  // Kill criterion from CAPABILITY_PROFILE.md: "auto-execution without approval — any instance".
  // These two assertions are the static half of that gate; the eval suite asserts the runtime half
  // (execution halts at WAITING_FOR_INPUT and no rule is written).
  it('gates the detection-engine write on an explicit human approval', () => {
    const review = stepByName('review_creation');
    const create = stepByName('create_rule');

    expect(review?.type).toBe('waitForApproval');
    expect(create?.type).toBe('kibana.request');
    expect(create?.if).toContain('steps.review_creation.output.response.approved == true');
  });

  it('never writes an enabled rule', () => {
    const create = stepByName('create_rule');
    const body = create?.with?.body as Record<string, unknown>;

    expect(body.enabled).toBe(false);
    expect(create?.with?.method).toBe('POST');
    // Raw kibana.request is not space-scoped automatically, so the path must carry the execution's
    // space or the rule lands in the default space rather than the invoking one.
    expect(create?.with?.path).toBe('/s/{{ workflow.spaceId }}/api/detection_engine/rules');
  });

  it('only references workflows that exist in the managed registry', () => {
    // `workflow.execute` steps naming an unregistered id fail at run time, not at install, which
    // surfaces as an opaque mid-execution error. Guard against reintroducing one.
    const executeSteps = workflow.steps.filter((step) => step.type?.startsWith('workflow.execute'));

    expect(executeSteps).toEqual([]);
  });
});
