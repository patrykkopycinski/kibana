/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { ExecutionStatus } from '@kbn/workflows';
import { PROPOSAL_APPROVE_URL, PROPOSAL_DISMISS_URL } from '@kbn/proposals-common';
import { RuleCreationClient, extractCoverageCheckConnectorId } from './rule_creation_client';
import { COVERAGE_REVIEW_WORKFLOW_ID, RULE_CREATION_WORKFLOW_ID } from './constants';

const log = { info: jest.fn(), debug: jest.fn(), warning: jest.fn() } as unknown as ToolingLog;

const INPUT = { technique: 'T1078', gap_description: 'g', evidence: 'e', confidence: 0.9 };
const fast = { maxWaitMs: 2_000, pollIntervalMs: 1 };

interface Call {
  url: string;
  method?: string;
  query?: Record<string, unknown>;
  body?: string;
}

const draftStep = {
  stepId: 'draft_creation',
  output: { structured_output: { rule: { name: 'r', query: 'FROM x' } } },
};

const WORKER_WORKFLOW = 'system-security-detection-rule-coverage-default';

/**
 * The production chain: the Worker run starts a review keyed `coverage-<ki id>`, whose
 * `run_rule_creation` step starts the rule_creation child, which parks at the proposal gate.
 */
const chainStack = ({
  reviewVisibleAfter = 0,
  noRuleCreation = false,
  gateStatuses = [ExecutionStatus.WAITING_FOR_INPUT],
}: {
  reviewVisibleAfter?: number;
  noRuleCreation?: boolean;
  gateStatuses?: ExecutionStatus[];
} = {}) => {
  const calls: Call[] = [];
  let gateLookups = 0;
  const indexed: Array<Record<string, unknown>> = [];
  let decided = false;
  let reviewLookups = 0;
  const esClient = {
    indices: { exists: jest.fn(async () => true), create: jest.fn() },
    index: jest.fn(async (params: Record<string, unknown>) => indexed.push(params)),
    deleteByQuery: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({})),
  } as unknown as EsClient;

  const fetch = jest.fn(async (url: string, opts: Omit<Call, 'url'> = {}) => {
    calls.push({ url, ...opts });
    if (url === `/api/workflows/workflow/${WORKER_WORKFLOW}/run`) {
      return { workflowExecutionId: 'worker-1' };
    }
    if (url === `/api/workflows/workflow/${COVERAGE_REVIEW_WORKFLOW_ID}/executions`) {
      reviewLookups += 1;
      const key = String(opts.query?.concurrencyGroupKey);
      return reviewLookups > reviewVisibleAfter && key.startsWith('coverage-')
        ? { results: [{ id: 'review-1' }] }
        : { results: [] };
    }
    if (url === '/api/workflows/executions/review-1/children') {
      return noRuleCreation
        ? []
        : [
            { workflowId: 'some-other', executionId: 'other-1' },
            { workflowId: RULE_CREATION_WORKFLOW_ID, executionId: 'rc-1' },
          ];
    }
    if (url === '/api/workflows/executions/worker-1') {
      return { status: ExecutionStatus.RUNNING, stepExecutions: [] };
    }
    if (url === '/api/workflows/executions/review-1') {
      return {
        status: noRuleCreation ? ExecutionStatus.COMPLETED : ExecutionStatus.WAITING_FOR_CHILD,
        stepExecutions: [
          { stepId: 'create_investigation', output: { conversation_id: 'inv-1' } },
          {
            stepId: 'coverage_check',
            output: { metadata: { usage: { connectorId: 'eis-flash-lite' } } },
          },
        ],
      };
    }
    if (url === '/api/workflows/executions/rc-1') {
      return {
        status: decided ? ExecutionStatus.COMPLETED : ExecutionStatus.WAITING_FOR_CHILD,
        stepExecutions: [draftStep],
        traceId: 't',
        effectiveIdentity: { type: 'service_account', id: 'sa-cov' },
      };
    }
    if (url === '/internal/proposals') {
      return { proposals: decided ? [] : [{ id: 'prop-1' }] };
    }
    if (url === '/internal/proposals/prop-1' && (opts.method ?? 'GET') === 'GET') {
      return { id: 'prop-1', workflowExecutionId: 'gate-1' };
    }
    if (url === '/api/workflows/executions/gate-1') {
      gateLookups += 1;
      const status = gateStatuses[Math.min(gateLookups - 1, gateStatuses.length - 1)];
      return { status, stepExecutions: [] };
    }
    if (url.startsWith('/internal/proposals/')) {
      decided = true;
      return {};
    }
    return {};
  }) as unknown as HttpHandler;

  const client = new RuleCreationClient(fetch, log);
  client.useCoverageTrigger({ workerWorkflowId: WORKER_WORKFLOW, esClient });
  return { client, calls, indexed, esClient };
};

describe('RuleCreationClient', () => {
  it('requires a coverage trigger before running', async () => {
    const client = new RuleCreationClient(jest.fn() as unknown as HttpHandler, log);
    await expect(client.run({ input: INPUT, ...fast })).rejects.toThrow('useCoverageTrigger');
  });

  it('seeds an indicator, runs the Worker, follows review → rule_creation to the gate', async () => {
    const { client, calls, indexed } = chainStack({ reviewVisibleAfter: 2 });
    const result = await client.run({ input: INPUT, ...fast });

    expect(indexed).toHaveLength(1);
    const kiId = indexed[0].id as string;
    // The Worker ran after the indicator existed, and not the standalone rule_creation /run.
    expect(calls.map((c) => c.url)).not.toContain(
      `/api/workflows/workflow/${RULE_CREATION_WORKFLOW_ID}/run`
    );
    expect(calls.find((c) => c.url.endsWith(`${WORKER_WORKFLOW}/run`))?.method).toBe('POST');

    // The review is found by the concurrency key derived from that indicator.
    const lookup = calls.find((c) => c.url.endsWith('/executions') && c.query?.concurrencyGroupKey);
    expect(lookup?.query?.concurrencyGroupKey).toBe(`coverage-${kiId}`);

    expect(result).toMatchObject({
      workerExecutionId: 'worker-1',
      reviewExecutionId: 'review-1',
      workflowExecutionId: 'rc-1',
      investigationId: 'inv-1',
      pendingApproval: true,
      proposalId: 'prop-1',
      effectiveIdentity: { type: 'service_account', id: 'sa-cov' },
      // The verdict step's connector is recorded, so a mismatch with the model under test is visible.
      coverageCheckConnectorId: 'eis-flash-lite',
    });
    expect(result.rule).toMatchObject({ name: 'r' });
    // The proposal is looked up on the investigation coverage_review opened.
    const proposalList = calls.find((c) => c.url === '/internal/proposals');
    expect(proposalList?.query).toMatchObject({ conversationId: 'inv-1', status: 'pending' });
  });

  it('fails with the review steps when the review never reaches run_rule_creation', async () => {
    const { client } = chainStack({ noRuleCreation: true });
    await expect(client.run({ input: INPUT, ...fast })).rejects.toThrow(/run_rule_creation/);
  });

  it('serializes concurrent runs so one sweep is not dropped by another', async () => {
    const { client, calls } = chainStack();
    await Promise.all([
      client.run({ input: INPUT, ...fast }),
      client.run({ input: INPUT, ...fast }),
    ]);
    const runs = calls.filter((c) => c.url.endsWith(`${WORKER_WORKFLOW}/run`));
    expect(runs).toHaveLength(2);
  });

  it('approves through the proposals approve route and waits for completion', async () => {
    const { client, calls } = chainStack();
    const result = await client.run({ input: INPUT, ...fast });

    const execution = await client.respond({
      workflowExecutionId: result.workflowExecutionId,
      proposalId: result.proposalId!,
      approved: true,
      ...fast,
    });

    expect(execution.status).toBe(ExecutionStatus.COMPLETED);
    expect(calls.some((c) => c.url === PROPOSAL_APPROVE_URL.replace('{id}', 'prop-1'))).toBe(true);
  });

  it('dismisses through the proposals dismiss route when rejecting', async () => {
    const { client, calls } = chainStack();
    const result = await client.run({ input: INPUT, ...fast });

    await client.respond({
      workflowExecutionId: result.workflowExecutionId,
      proposalId: result.proposalId!,
      approved: false,
      ...fast,
    });

    const dismiss = calls.find((c) => c.url === PROPOSAL_DISMISS_URL.replace('{id}', 'prop-1'));
    expect(dismiss).toBeDefined();
    expect(JSON.parse(dismiss!.body!)).toEqual({ dismissReason: 'no_reason' });
  });

  it('waits for the gate execution to park before sending the decision', async () => {
    const { client, calls } = chainStack({
      gateStatuses: [
        ExecutionStatus.RUNNING,
        ExecutionStatus.RUNNING,
        ExecutionStatus.WAITING_FOR_INPUT,
      ],
    });
    const result = await client.run({ input: INPUT, ...fast });

    await client.respond({
      workflowExecutionId: result.workflowExecutionId,
      proposalId: result.proposalId!,
      approved: false,
      ...fast,
    });

    const urls = calls.map((c) => c.url);
    const lastGateRead = urls.lastIndexOf('/api/workflows/executions/gate-1');
    const dismissAt = urls.indexOf(PROPOSAL_DISMISS_URL.replace('{id}', 'prop-1'));
    expect(urls.filter((u) => u === '/api/workflows/executions/gate-1')).toHaveLength(3);
    expect(dismissAt).toBeGreaterThan(lastGateRead);
  });

  it('never sends the decision when the gate never parks', async () => {
    const { client, calls } = chainStack({ gateStatuses: [ExecutionStatus.RUNNING] });
    const result = await client.run({ input: INPUT, ...fast });

    await expect(
      client.respond({
        workflowExecutionId: result.workflowExecutionId,
        proposalId: result.proposalId!,
        approved: false,
        ...fast,
        gateWaitMs: 50,
      })
    ).rejects.toThrow(/did not reach waiting_for_input/);
    expect(calls.some((c) => c.url === PROPOSAL_DISMISS_URL.replace('{id}', 'prop-1'))).toBe(false);
  });

  it('fails fast when the gate execution is already terminal', async () => {
    const { client } = chainStack({ gateStatuses: [ExecutionStatus.COMPLETED] });
    const result = await client.run({ input: INPUT, ...fast });

    await expect(
      client.respond({
        workflowExecutionId: result.workflowExecutionId,
        proposalId: result.proposalId!,
        approved: true,
        ...fast,
      })
    ).rejects.toThrow(/already completed/);
  });

  it('cancels every run, deletes the investigation and the seeded indicators on cleanup', async () => {
    const { client, calls, esClient } = chainStack();
    await client.run({ input: INPUT, ...fast });
    await client.cancelPending();

    const cancelled = calls.filter((c) => c.url.endsWith('/cancel')).map((c) => c.url);
    expect(cancelled).toEqual(
      expect.arrayContaining([
        '/api/workflows/executions/worker-1/cancel',
        '/api/workflows/executions/review-1/cancel',
        '/api/workflows/executions/rc-1/cancel',
      ])
    );
    expect(
      calls.some((c) => c.method === 'DELETE' && c.url === '/api/agent_builder/conversations/inv-1')
    ).toBe(true);
    expect(esClient.deleteByQuery as jest.Mock).toHaveBeenCalled();
  });

  it('deletes the seeded indicator as soon as run() returns, so no pending KI outlives the run', async () => {
    const { client, indexed, esClient } = chainStack();
    await client.run({ input: INPUT, ...fast });

    const deleted = (esClient.delete as jest.Mock).mock.calls;
    expect(deleted).toHaveLength(1);
    expect(deleted[0][0]).toMatchObject({ id: indexed[0].id, refresh: true });
  });

  it('deletes the seeded indicator even when the run fails (no stale KI for the next sweep)', async () => {
    const { client, indexed, esClient } = chainStack({ noRuleCreation: true });
    await expect(client.run({ input: INPUT, ...fast })).rejects.toThrow(
      /no_coverage|run_rule_creation/
    );

    const deleted = (esClient.delete as jest.Mock).mock.calls;
    expect(deleted).toHaveLength(1);
    expect(deleted[0][0]).toMatchObject({ id: indexed[0].id });
  });

  it('classifies a non-no_coverage verdict as CoverageVerdictError, not a generic failure', async () => {
    const { client } = chainStack({ noRuleCreation: true });
    const rejection = client.run({ input: INPUT, ...fast });
    await expect(rejection).rejects.toMatchObject({ name: 'CoverageVerdictError' });
  });
});

/**
 * A stack whose executions list returns `active` for the given workflows until each id is
 * cancelled; `stubborn` ids ignore the cancel and stay running.
 */
const settleStack = ({
  active,
  stubborn = [],
}: {
  active: Record<string, Array<{ id: string; status: ExecutionStatus }>>;
  stubborn?: string[];
}) => {
  const cancelled = new Set<string>();
  const calls: Call[] = [];
  const fetch = jest.fn(async (url: string, opts: Omit<Call, 'url'> = {}) => {
    calls.push({ url, ...opts });
    const cancel = /^\/api\/workflows\/executions\/([^/]+)\/cancel$/.exec(url);
    if (cancel) {
      if (!stubborn.includes(cancel[1])) cancelled.add(cancel[1]);
      return {};
    }
    const list = /^\/api\/workflows\/workflow\/([^/]+)\/executions$/.exec(url);
    if (list) {
      const workflowId = decodeURIComponent(list[1]);
      return { results: (active[workflowId] ?? []).filter(({ id }) => !cancelled.has(id)) };
    }
    return {};
  }) as unknown as HttpHandler;
  const client = new RuleCreationClient(fetch, log);
  client.useCoverageTrigger({ workerWorkflowId: WORKER_WORKFLOW, esClient: {} as EsClient });
  return { client, calls, cancelled };
};

describe('RuleCreationClient.settleCoverageRuns', () => {
  const settleFast = { maxWaitMs: 50, pollIntervalMs: 1 };

  it('requires a coverage trigger', async () => {
    const client = new RuleCreationClient(jest.fn() as unknown as HttpHandler, log);
    await expect(client.settleCoverageRuns(settleFast)).rejects.toThrow('useCoverageTrigger');
  });

  it('resolves immediately, cancelling nothing, when no coverage run is active', async () => {
    const { client, calls } = settleStack({ active: {} });
    await client.settleCoverageRuns(settleFast);
    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(false);
    // Looks at the sweep, the review and rule_creation: any of them holds the concurrency slot.
    const listed = calls
      .filter((c) => c.url.endsWith('/executions'))
      .map((c) => decodeURIComponent(c.url.split('/')[4]));
    expect(listed).toEqual(
      expect.arrayContaining([
        WORKER_WORKFLOW,
        COVERAGE_REVIEW_WORKFLOW_ID,
        RULE_CREATION_WORKFLOW_ID,
      ])
    );
  });

  it("cancels the previous test's still-running sweep and review, then confirms they are gone", async () => {
    const { client, calls, cancelled } = settleStack({
      active: {
        [WORKER_WORKFLOW]: [{ id: 'worker-prev', status: ExecutionStatus.RUNNING }],
        [COVERAGE_REVIEW_WORKFLOW_ID]: [
          { id: 'review-prev', status: ExecutionStatus.WAITING_FOR_CHILD },
        ],
      },
    });
    await client.settleCoverageRuns(settleFast);

    expect([...cancelled].sort()).toEqual(['review-prev', 'worker-prev']);
    // Re-read after the cancel: the last call is a list, not a cancel.
    expect(calls[calls.length - 1].url.endsWith('/executions')).toBe(true);
  });

  it('only asks for non-terminal statuses', async () => {
    const { client, calls } = settleStack({ active: {} });
    await client.settleCoverageRuns(settleFast);
    const query = calls.find((c) => c.url.endsWith('/executions'))?.query;
    expect(query?.statuses).toEqual(
      expect.arrayContaining([ExecutionStatus.RUNNING, ExecutionStatus.WAITING_FOR_CHILD])
    );
    expect(query?.statuses).not.toContain(ExecutionStatus.COMPLETED);
  });

  it('fails loudly, naming the execution, when a run will not stop', async () => {
    const { client } = settleStack({
      active: { [WORKER_WORKFLOW]: [{ id: 'worker-stuck', status: ExecutionStatus.RUNNING }] },
      stubborn: ['worker-stuck'],
    });
    await expect(client.settleCoverageRuns(settleFast)).rejects.toThrow(
      new RegExp(`${WORKER_WORKFLOW}/worker-stuck:${ExecutionStatus.RUNNING}`)
    );
  });
});

describe('extractCoverageCheckConnectorId', () => {
  it('reads the connector the coverage_check step ran on', () => {
    expect(
      extractCoverageCheckConnectorId([
        { stepId: 'create_investigation', output: { conversation_id: 'c' } },
        { stepId: 'coverage_check', output: null },
        {
          stepId: 'coverage_check',
          output: { metadata: { usage: { connectorId: '.google-gemini-3.5-flash-lite' } } },
        },
      ] as never)
    ).toBe('.google-gemini-3.5-flash-lite');
  });

  it('is undefined when the step errored and recorded no usage', () => {
    expect(
      extractCoverageCheckConnectorId([
        { stepId: 'coverage_check', output: { error: 'Service error' } },
      ] as never)
    ).toBeUndefined();
    expect(extractCoverageCheckConnectorId([])).toBeUndefined();
  });
});
