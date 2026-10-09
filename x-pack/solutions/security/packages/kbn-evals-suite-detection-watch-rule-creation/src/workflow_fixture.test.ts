/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  getManagedWorkflowDefinition,
  ALERTZERO_COVERAGE_REVIEW_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import { DRAFT_STEP_ID, PROPOSE_STEP_ID, RULE_CREATION_WORKFLOW_ID } from './constants';
import { REQUIRED_STEP_IDS, assertWorkflowInstalled, withRunAsSetting } from './workflow_fixture';

const log = { info: jest.fn(), debug: jest.fn(), warning: jest.fn() } as unknown as ToolingLog;

const shippedYaml = (): string => {
  const definition = getManagedWorkflowDefinition(RULE_CREATION_WORKFLOW_ID);
  if (!definition?.yaml) {
    throw new Error(`${RULE_CREATION_WORKFLOW_ID} is not a managed workflow with yaml`);
  }
  return definition.yaml;
};

const fetchReturning = (yaml: string) => jest.fn(async () => ({ yaml })) as unknown as HttpHandler;

describe('rule-creation workflow contract', () => {
  it('addresses steps that the shipped managed workflow declares', async () => {
    await expect(
      assertWorkflowInstalled({
        fetch: fetchReturning(shippedYaml()),
        log,
      })
    ).resolves.toBeDefined();
  });

  it('pins the draft and proposal steps by id', () => {
    expect([...REQUIRED_STEP_IDS]).toEqual([DRAFT_STEP_ID, PROPOSE_STEP_ID]);
  });

  it('fails setup when a required step is renamed in the workflow', async () => {
    const renamed = shippedYaml().replace(`- name: ${PROPOSE_STEP_ID}`, '- name: some_other_step');
    await expect(assertWorkflowInstalled({ fetch: fetchReturning(renamed), log })).rejects.toThrow(
      PROPOSE_STEP_ID
    );
  });
});

describe('rule-creation run-as fixture', () => {
  it('splices run_as into the shipped settings block without touching other keys', () => {
    const shipped = shippedYaml();
    const bound = withRunAsSetting(shipped, 'ns/sa-1');
    // The bind is additive only: every shipped line survives.
    for (const line of shipped.split('\n')) {
      expect(bound).toContain(line);
    }
    expect(bound).toMatch(/^ {2}run_as: "ns\/sa-1"$/m);
  });

  it('is idempotent when run_as is already present', () => {
    const once = withRunAsSetting(shippedYaml(), 'ns/sa-1');
    const twice = withRunAsSetting(once, 'ns/sa-1');
    expect(twice).toBe(once);
    expect(withRunAsSetting(once, 'ns/sa-2')).not.toMatch(/ns\/sa-1/);
  });

  it('fails loudly when the workflow has no settings block', () => {
    expect(() => withRunAsSetting('version: "1"\nname: x\n', 'sa')).toThrow('settings block');
  });

  it('pins production shapes: shipped rule_creation yaml has no run_as and coverage_review keeps inherit', () => {
    // The suite's identity bind must stay EVAL-ONLY. Production resolves rule-creation's
    // identity through the coverage Worker's chain (run-as-mode: inherit), never through a
    // literal run_as on the shipped document.
    expect(shippedYaml()).not.toMatch(/^ {2}run_as:/m);
    const coverageReview = getManagedWorkflowDefinition(ALERTZERO_COVERAGE_REVIEW_WORKFLOW_ID);
    const yaml = coverageReview?.yaml ?? '';
    expect(yaml).toMatch(/name: run_rule_creation/);
    const step = yaml.split('\n').findIndex((line) => line.includes('name: run_rule_creation'));
    const stepBlock = yaml
      .split('\n')
      .slice(step, step + 12)
      .join('\n');
    expect(stepBlock).toMatch(/run-as-mode: inherit/);
    expect(stepBlock).toMatch(/workflow-id: system-security-rule-creation/);
  });
});
