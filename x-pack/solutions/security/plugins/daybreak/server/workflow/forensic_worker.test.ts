/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getForensicWorkerWorkflow } from './run_forensic_worker';

describe('forensic_worker', () => {
  it('parses and validates the workflow YAML', () => {
    const workflow = getForensicWorkerWorkflow();
    expect(workflow.name).toBe('Daybreak Investigation Forensic Worker');
    expect(workflow.steps.map((step) => step.name)).toEqual([
      'setup',
      'load',
      'forensic',
      'confirm',
    ]);
  });
});
