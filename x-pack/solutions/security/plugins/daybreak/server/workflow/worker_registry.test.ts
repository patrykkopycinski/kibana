/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DAYBREAK_MANAGED_WORKFLOW_IDS } from '@kbn/workflows/managed/definitions/daybreak';

import {
  DAYBREAK_BUILTIN_WORKER_DEFINITIONS,
  registerBuiltinDaybreakWorkers,
} from './builtin_workers';
import {
  getDaybreakWorkerRegistry,
  getManagedInstallWorkerIds,
  getRegisteredDaybreakWorkerIds,
  getWorkerWorkflow,
  registerDaybreakWorker,
} from './worker_registry';

describe('worker_registry', () => {
  beforeAll(() => {
    registerBuiltinDaybreakWorkers();
  });

  it('registers every built-in worker id', () => {
    for (const definition of DAYBREAK_BUILTIN_WORKER_DEFINITIONS) {
      expect(getDaybreakWorkerRegistry().has(definition.id)).toBe(true);
    }
  });

  it('unifies built-in ids with DAYBREAK_MANAGED_WORKFLOW_IDS', () => {
    expect(getRegisteredDaybreakWorkerIds().sort()).toEqual(
      [...DAYBREAK_MANAGED_WORKFLOW_IDS].sort()
    );
    expect(getManagedInstallWorkerIds().sort()).toEqual([...DAYBREAK_MANAGED_WORKFLOW_IDS].sort());
  });

  it('composes setup as the first step for every worker', () => {
    for (const workerId of getRegisteredDaybreakWorkerIds()) {
      const workflow = getWorkerWorkflow(workerId);
      expect(workflow.steps[0]?.name).toBe('setup');
    }
  });

  it('registerDaybreakWorker rejects duplicate ids', () => {
    expect(() =>
      registerDaybreakWorker({
        id: DAYBREAK_BUILTIN_WORKER_DEFINITIONS[0].id,
        yaml: 'version: "1"\nname: dup\nenabled: false\nsteps: []',
        logLabel: 'dup',
        buildContext: () => ({}),
        buildCompletionDetail: () => '',
      })
    ).toThrow(/already registered/);
  });
});
