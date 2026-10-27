/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. as a
 * contributor license agreements. Licensed under the Elastic License 2.0;
 * you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { detonateReputationStepDefinition } from './detonate_reputation_step';
import { DETONATE_REPUTATION_PATH } from '../../../../common/detonate_prototype';
import type { DetonateReputationResponse } from '../../../../common/detonate_prototype';

type HandlerContext = Parameters<typeof detonateReputationStepDefinition.handler>[0];

const createMockContext = (input: Record<string, unknown>, body: unknown) =>
  ({
    input,
    contextManager: { callKibanaApi: jest.fn().mockResolvedValue({ status: 200, body }) },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  } as unknown as HandlerContext);

describe('detonateReputationStepDefinition', () => {
  it('reads the gate through the internal route and returns the answer untouched', async () => {
    const known: DetonateReputationResponse = {
      sha256: 'a'.repeat(64),
      status: 'known-malicious',
      source: 'detonate-seed',
      malware_family: 'eicar-test-file',
    };
    const context = createMockContext({ sha256: 'a'.repeat(64) }, known);

    const result = await detonateReputationStepDefinition.handler(context);

    expect(context.contextManager.callKibanaApi).toHaveBeenCalledWith({
      method: 'GET',
      path: `${DETONATE_REPUTATION_PATH}/${'a'.repeat(64)}`,
      headers: { 'elastic-api-version': '1' },
    });
    expect(result.output).toEqual(known);
  });

  it('passes `unknown` through without softening it into benign', async () => {
    const unknown: DetonateReputationResponse = {
      sha256: 'b'.repeat(64),
      status: 'unknown',
      source: 'detonate-seed',
    };
    const context = createMockContext({ sha256: 'b'.repeat(64) }, unknown);

    const result = await detonateReputationStepDefinition.handler(context);
    expect(result.output).toEqual(unknown);
    expect(result.output?.status).toBe('unknown');
  });

  it('propagates lookup failures as execution errors', async () => {
    const context = createMockContext({ sha256: 'c'.repeat(64) }, {});
    (context.contextManager.callKibanaApi as jest.Mock).mockRejectedValue(
      new Error('route blew up')
    );

    await expect(detonateReputationStepDefinition.handler(context)).rejects.toThrow();
  });
});
