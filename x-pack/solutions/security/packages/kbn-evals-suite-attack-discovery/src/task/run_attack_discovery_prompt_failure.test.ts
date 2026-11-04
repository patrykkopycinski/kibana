/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BoundInferenceClient } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';
import { runAttackDiscovery } from './run_attack_discovery';
import type { AttackDiscoveryTaskInput } from '../types';

// Separate file: the prompt loader caches its read at module scope, so the read has to fail in a
// fresh module registry.
jest.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    readFile: jest.fn(async () => {
      throw new Error('ENOENT: no such file or directory');
    }),
  },
}));

describe('runAttackDiscovery prompt file failure', () => {
  it('scores an unreadable prompt file as a model failure (0), not N/A', async () => {
    const chatComplete = jest.fn();

    const output = await runAttackDiscovery({
      inferenceClient: { chatComplete } as unknown as BoundInferenceClient,
      attackDiscoveryClient: {} as never,
      log: { debug: jest.fn(), error: jest.fn() } as unknown as ToolingLog,
      input: { mode: 'bundledAlerts', anonymizedAlerts: [] } as AttackDiscoveryTaskInput,
    });

    expect(output.insights).toBeNull();
    expect(output.errors?.[0]).toContain('ENOENT');
    expect(output.errorKind).toBe('model');
    expect(chatComplete).not.toHaveBeenCalled();
  });
});
