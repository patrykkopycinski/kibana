/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import { RuleCreationClient } from './rule_creation_client';

/**
 * Regression guard for the all-N/A false green.
 *
 * Measured on a live stack: 3 of 4 workflow executions died with
 * `version_conflict_engine_exception: [default_elastic-ai-agent] document already exists`
 * (concurrent runs racing to lazily create the same default agent doc). `draft_creation`
 * produced no rule, every evaluator reported N/A, and the suite still reported
 * "2 passed" with exit code 0 — byte-identical to the healthy run's result.
 *
 * A crashed workflow must be RED, not silently unmeasured.
 */

const EXECUTION_ID = 'exec-1';

const makeLog = () =>
  ({
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as ToolingLog);

const INPUT = {
  technique: 'T1059.001',
  gap_description: 'No coverage for encoded PowerShell execution',
  evidence: 'process.command_line contains -enc',
  confidence: 0.9,
};

/**
 * Stub the two endpoints the client calls: POST run, then GET execution.
 */
const makeFetch = (execution: unknown): HttpHandler =>
  jest.fn(async (path: string) => {
    if (String(path).endsWith('/run')) {
      return { workflowExecutionId: EXECUTION_ID };
    }
    return execution;
  }) as unknown as HttpHandler;

describe('RuleCreationClient — crashed workflow must not pass silently', () => {
  it('throws when the workflow failed and draft_creation produced no rule', async () => {
    // The exact shape observed on the live stack.
    const fetch = makeFetch({
      id: EXECUTION_ID,
      status: 'failed',
      error: {
        type: 'ResponseError',
        message:
          'version_conflict_engine_exception: [default_elastic-ai-agent]: document already exists',
      },
      stepExecutions: [
        { stepId: 'draft_creation', status: 'failed' },
        { stepId: 'draft_creation', status: 'failed' },
      ],
    });

    const client = new RuleCreationClient(fetch, makeLog());

    await expect(client.run({ input: INPUT, pollIntervalMs: 1 })).rejects.toThrow(
      /produced no rule/
    );
  });

  it('surfaces the underlying execution error in the thrown message', async () => {
    const fetch = makeFetch({
      id: EXECUTION_ID,
      status: 'failed',
      error: { type: 'ResponseError', message: 'version_conflict_engine_exception' },
      stepExecutions: [{ stepId: 'draft_creation', status: 'failed' }],
    });

    const client = new RuleCreationClient(fetch, makeLog());

    // Without the cause, a red CI run gives no clue whether it was infra or the model.
    await expect(client.run({ input: INPUT, pollIntervalMs: 1 })).rejects.toThrow(
      /version_conflict_engine_exception/
    );
  });

  it('throws when the workflow completed but emitted no rule', async () => {
    // A "completed" status is not sufficient — the rule is the measured artifact.
    const fetch = makeFetch({
      id: EXECUTION_ID,
      status: 'completed',
      stepExecutions: [{ stepId: 'draft_creation', status: 'completed', output: {} }],
    });

    const client = new RuleCreationClient(fetch, makeLog());

    await expect(client.run({ input: INPUT, pollIntervalMs: 1 })).rejects.toThrow(
      /produced no rule/
    );
  });
});
