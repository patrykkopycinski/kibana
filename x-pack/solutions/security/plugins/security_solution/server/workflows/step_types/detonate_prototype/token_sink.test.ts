/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The service returns the enrollment token and the sandbox VM's identifiers on
 * every task. One task carrying them is pushed through every place a run's data
 * leaves Kibana's server: none of those values may come out the other side.
 */

import { applyDetonationVerdictStepDefinition } from './apply_detonation_verdict_step';
import { caseCommentStepDefinition } from './case_comment_step';
import { detonateCompletedRunsStepDefinition } from './detonate_completed_runs_step';
import { detonateRunHistoryStepDefinition } from './detonate_run_history_step';
import { detonateSampleStepDefinition } from './detonate_sample_step';
import { detonateVerdictStepDefinition } from './detonate_verdict_step';
import { exceptionProposalComment } from '../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import { toDetonationRecord } from '../../../detonate_prototype/detonation_record';
import { toSandboxDoc } from '../../../detonate_prototype/sandbox_ingest';

const HASH = 'a'.repeat(64);

const SENSITIVE = {
  agent_fleet_enrollment_token: 'enrollment-token-secret-value',
  vm_instance_name: 'sandbox-vm-secret-name',
  elastic_agent_id: 'sandbox-agent-secret-id',
  elastic_endpoint_id: 'sandbox-endpoint-secret-id',
} as const;

const TASK: DetonateTask = {
  id: 'task-1',
  created_at: '2026-01-01T00:00:00.000Z',
  tags: ['space:default', 'alert:alert-9'],
  sample_hash: HASH,
  agent_version: '8.0.0',
  telemetry_cluster_version: '8.0.0',
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  exec_wait_secs: 30,
  pre_exec_commands: [],
  exec_commands: [],
  vm_has_internet: false,
  production_endpoint_alerts_count: 1,
  production_endpoint_alert_groups: [{ alerts_count: 1, event_code: 'malicious_file' }],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  ...SENSITIVE,
};

/** A sandbox alert as the service returns it: it names the VM and its agent too. */
const ALERT = {
  '@timestamp': '2026-01-01T00:01:00.000Z',
  event: { id: 'event-1', kind: 'alert', code: 'malicious_file' },
  host: { name: SENSITIVE.vm_instance_name, id: 'sandbox-host-secret-id', os: { type: 'linux' } },
  agent: { id: SENSITIVE.elastic_agent_id, type: 'endpoint', version: '9.0.0' },
  elastic: { agent: { id: SENSITIVE.elastic_agent_id } },
  Endpoint: { policy: { applied: { id: 'sandbox-policy-secret-id' } } },
  file: { name: 'sample.bin', hash: { sha256: HASH } },
};

const expectClean = (value: unknown) => {
  const serialised = JSON.stringify(value);
  expect(serialised).not.toContain('secret');
  for (const sensitive of Object.values(SENSITIVE)) {
    expect(serialised).not.toContain(sensitive);
  }
};

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const handlerContext = <T>(input: Record<string, unknown>, ...bodies: unknown[]): T => {
  const callKibanaApi = jest.fn();
  bodies.forEach((body) => callKibanaApi.mockResolvedValueOnce({ status: 200, body }));
  return { input, contextManager: { callKibanaApi }, logger } as unknown as T;
};

type VerdictContext = Parameters<typeof detonateVerdictStepDefinition.handler>[0];
type ApplyContext = Parameters<typeof applyDetonationVerdictStepDefinition.handler>[0];
type CaseContext = Parameters<typeof caseCommentStepDefinition.handler>[0];
type HistoryContext = Parameters<typeof detonateRunHistoryStepDefinition.handler>[0];
type CompletedContext = Parameters<typeof detonateCompletedRunsStepDefinition.handler>[0];
type PollContext = Parameters<NonNullable<typeof detonateSampleStepDefinition.poll>>[0];

describe('the enrollment token and sandbox identifiers', () => {
  it('stay out of the run record', () => {
    expectClean(toDetonationRecord(TASK, { iocs: { domains: [], ips: [], file_hashes: [] } }));
  });

  it('stay out of the sandbox stream copy', () => {
    expectClean(toSandboxDoc(TASK, 'production-endpoint-alerts', ALERT));
  });

  it('stay out of the detonate step output', async () => {
    const callKibanaApi = jest.fn(async ({ path }: { path: string }) =>
      path.endsWith('/alerts') ? { status: 200, body: [ALERT] } : { status: 200, body: TASK }
    );
    const context = {
      input: { sample_hash: HASH },
      state: {
        taskId: TASK.id,
        submittedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      },
      attempt: 0,
      contextManager: { callKibanaApi },
      logger,
    } as unknown as PollContext;

    const result = await detonateSampleStepDefinition.poll(context);

    expect(callKibanaApi).toHaveBeenCalled();
    expectClean(result);
  });

  it('stay out of the verdict, the alert tag and note, and the case comment', async () => {
    const { output: verdict } = await detonateVerdictStepDefinition.handler(
      handlerContext<VerdictContext>({ task_id: TASK.id, alert_id: 'alert-9' }, TASK)
    );
    expectClean(verdict);
    if (!verdict) throw new Error('the verdict step returned no output');

    const apply = handlerContext<ApplyContext>(
      {
        verdict: verdict.verdict,
        alert_id: 'alert-9',
        task_id: TASK.id,
        evidence: verdict.evidence,
      },
      {},
      { note: { noteId: 'note-1' } }
    );
    expectClean(await applyDetonationVerdictStepDefinition.handler(apply));
    expectClean((apply.contextManager.callKibanaApi as jest.Mock).mock.calls);

    const comment = handlerContext<CaseContext>(
      { case_id: 'case-1', comment: verdict.evidence },
      { comments: [{ id: 'comment-1' }] }
    );
    expectClean(await caseCommentStepDefinition.handler(comment));
    expectClean((comment.contextManager.callKibanaApi as jest.Mock).mock.calls);
  });

  it('stay out of the run history and its exception proposal comment', async () => {
    const quiet = { ...TASK, production_endpoint_alerts_count: 0 };
    const quietRuns = [quiet, { ...quiet, id: 'task-2' }, { ...quiet, id: 'task-3' }];

    expectClean(exceptionProposalComment(HASH, quietRuns));
    expectClean(
      await detonateRunHistoryStepDefinition.handler(
        handlerContext<HistoryContext>({ sha256: HASH }, { offset: 0, size: 200, tasks: quietRuns })
      )
    );
  });

  it('stay out of the completed-runs sweep', async () => {
    const result = await detonateCompletedRunsStepDefinition.handler(
      handlerContext<CompletedContext>(
        { max_pending: 20 },
        { offset: 0, size: 200, tasks: [TASK] },
        { hits: { hits: [{ _id: 'alert-9', fields: { 'kibana.alert.workflow_tags': [] } }] } }
      )
    );

    expect(result.output?.pending_count).toBe(1);
    expectClean(result);
  });
});
