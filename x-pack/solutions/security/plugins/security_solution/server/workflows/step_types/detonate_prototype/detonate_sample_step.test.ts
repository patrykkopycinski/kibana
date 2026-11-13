/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  detonateSampleStepDefinition,
  extractIocsFromAlertDocs,
  sanitizeIocs,
} from './detonate_sample_step';
import {
  DETONATE_SUBMIT_HASH_PATH,
  DETONATE_TASKS_PATH,
} from '../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../common/detonate_prototype';

type StartContext = Parameters<NonNullable<typeof detonateSampleStepDefinition.start>>[0];
type PollContext = Parameters<NonNullable<typeof detonateSampleStepDefinition.poll>>[0];

const createMockContext = (input: Record<string, unknown>) =>
  ({
    input,
    config: {},
    rawInput: input,
    contextManager: {
      getContext: jest.fn(() => ({ execution: { id: 'exec-1' } })),
      getScopedEsClient: jest.fn(),
      renderInputTemplate: jest.fn(),
      getFakeRequest: jest.fn(),
      callKibanaApi: jest.fn(),
    },
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    abortSignal: new AbortController().signal,
    stepId: 'test-step',
    stepType: 'detonate.prototype.detonateSample',
  } as unknown as StartContext);

const createTaskFixture = (overrides: Partial<DetonateTask> = {}): DetonateTask => ({
  id: 'task-1',
  created_at: '2026-01-01T00:00:00.000Z',
  tags: [],
  agent_version: '8.0.0',
  telemetry_cluster_version: '8.0.0',
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  exec_wait_secs: 30,
  pre_exec_commands: [],
  exec_commands: [],
  vm_has_internet: false,
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  ...overrides,
});

describe('detonateSampleStepDefinition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('submits via POST to submit-hash with the elastic-api-version header', async () => {
      const mockContext = createMockContext({ sample_hash: 'a'.repeat(64) });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: createTaskFixture({ id: 'task-42' }),
      });

      await detonateSampleStepDefinition.start!(mockContext);

      expect(mockContext.contextManager.callKibanaApi).toHaveBeenCalledWith({
        method: 'POST',
        path: DETONATE_SUBMIT_HASH_PATH,
        headers: { 'elastic-api-version': '1' },
        body: {
          sample_hash: 'a'.repeat(64),
          origin: { source: 'workflow', workflow_execution_id: 'exec-1' },
        },
      });
    });

    it('seeds state with taskId and a deadline 900s out when max_wait_secs is omitted', async () => {
      const mockContext = createMockContext({ sample_hash: 'a'.repeat(64) });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: createTaskFixture({ id: 'task-42' }),
      });

      const before = Date.now();
      const result = (await detonateSampleStepDefinition.start!(mockContext)) as {
        state: { taskId: string; deadlineAt: string };
      };

      expect(result.state.taskId).toBe('task-42');
      const deadlineMs = Date.parse(result.state.deadlineAt);
      // The default budget is 900s; allow only the milliseconds the call took.
      expect(deadlineMs).toBeGreaterThanOrEqual(before + 900_000 - 2_000);
      expect(deadlineMs).toBeLessThanOrEqual(Date.now() + 900_000);
    });

    it('seeds a deadline from the author-provided max_wait_secs', async () => {
      const mockContext = createMockContext({ sample_hash: 'a'.repeat(64), max_wait_secs: 60 });
      (mockContext.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: createTaskFixture({ id: 'task-42' }),
      });

      const before = Date.now();
      const result = (await detonateSampleStepDefinition.start!(mockContext)) as {
        state: { deadlineAt: string };
      };

      expect(Date.parse(result.state.deadlineAt)).toBeGreaterThanOrEqual(before + 60_000 - 2_000);
    });
  });

  describe('poll', () => {
    const pollContext = (state: unknown, attempt = 0) =>
      ({
        ...createMockContext({ sample_hash: 'a'.repeat(64) }),
        state,
        attempt,
      } as unknown as PollContext);

    it('throws when state is missing (poll ran before start)', async () => {
      const context = pollContext(undefined);

      await expect(detonateSampleStepDefinition.poll(context)).rejects.toThrow(
        /Poll ran before start/
      );
      expect(context.contextManager.callKibanaApi).not.toHaveBeenCalled();
    });

    it('returns a completed output derived from the task, with event codes and rule names de-duplicated', async () => {
      const task = createTaskFixture({
        id: 'task-1',
        production_endpoint_alerts_count: 3,
        diagnostic_endpoint_alerts_count: 1,
        production_detection_alerts_count: 2,
        production_endpoint_alert_groups: [
          { alerts_count: 2, event_code: 'malicious_file' },
          { alerts_count: 1, event_code: 'malicious_file' },
        ],
        diagnostic_endpoint_alert_groups: [{ alerts_count: 1, event_code: 'process_injection' }],
        production_detection_alert_groups: [
          {
            alerts_count: 1,
            kibana_alert_rule_name: 'Malware detection',
            kibana_alert_rule_parameters_severity: 'high',
          },
          {
            alerts_count: 1,
            kibana_alert_rule_name: 'Malware detection',
            kibana_alert_rule_parameters_severity: 'high',
          },
        ],
      });
      const context = pollContext({
        taskId: 'task-1',
        submittedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      });
      (context.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: task,
      });

      const result = (await detonateSampleStepDefinition.poll(context)) as {
        output: Record<string, unknown>;
      };

      expect(context.contextManager.callKibanaApi).toHaveBeenCalledWith({
        method: 'GET',
        path: `${DETONATE_TASKS_PATH}/task-1`,
        headers: { 'elastic-api-version': '1' },
      });
      expect(result.output).toEqual({
        task_id: 'task-1',
        completed: true,
        failed: false,
        last_worker_name: 'detonate.workers.make_summary',
        last_worker_status: 'success',
        sample_source: undefined,
        production_endpoint_alerts_count: 3,
        diagnostic_endpoint_alerts_count: 1,
        production_detection_alerts_count: 2,
        total_alerts_count: 6,
        endpoint_alert_event_codes: ['malicious_file', 'process_injection'],
        detection_rule_names: ['Malware detection'],
      });
    });

    describe('extracted IOCs', () => {
      const SAMPLE = 'a'.repeat(64);
      const liveState = () => ({
        taskId: 'task-1',
        submittedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      });

      /** Routes each `callKibanaApi` by path: the task read, then per-kind alert reads. */
      const routeCalls = (
        context: PollContext,
        task: DetonateTask,
        alerts: Partial<Record<string, unknown>>
      ) =>
        (context.contextManager.callKibanaApi as jest.Mock).mockImplementation(
          async ({ path, query }: { path: string; query?: { kind?: string } }) => {
            if (path === `${DETONATE_TASKS_PATH}/task-1`) return { status: 200, body: task };
            const kind = query?.kind ?? '';
            const body = alerts[kind];
            if (body instanceof Error) throw body;
            if (body === undefined) throw new Error(`unexpected read ${path} ${kind}`);
            return { status: 200, body };
          }
        );

      const completedTask = (overrides: Partial<DetonateTask> = {}) =>
        createTaskFixture({
          sample_hash: SAMPLE,
          production_endpoint_alerts_count: 1,
          diagnostic_endpoint_alerts_count: 1,
          production_detection_alerts_count: 1,
          ...overrides,
        });

      it('merges IOCs from all three alert kinds, read through the space-scoped route', async () => {
        const context = pollContext(liveState());
        routeCalls(context, completedTask(), {
          'production-endpoint-alerts': [
            { _source: { dns: { question: { name: 'C2.Example.com' } } } },
          ],
          'diagnostic-endpoint-alerts': [
            { 'destination.ip': '203.0.113.9', 'file.hash.sha256': 'b'.repeat(64) },
          ],
          'production-detection-alerts': [
            {
              destination: { ip: ['198.51.100.4', '10.0.0.5'] },
              file: { hash: { md5: 'c'.repeat(32) } },
            },
          ],
        });

        const result = (await detonateSampleStepDefinition.poll(context)) as {
          output: Record<string, unknown>;
        };

        expect(result.output.extracted_iocs).toEqual({
          domains: ['c2.example.com'],
          ips: ['203.0.113.9', '198.51.100.4'],
          file_hashes: ['b'.repeat(64), 'c'.repeat(32)],
        });
        expect(context.contextManager.callKibanaApi).toHaveBeenCalledWith({
          method: 'GET',
          path: `${DETONATE_TASKS_PATH}/task-1/alerts`,
          headers: { 'elastic-api-version': '1' },
          query: { kind: 'production-endpoint-alerts', limit: 500 },
        });
      });

      it('leaves extracted_iocs absent when no alert kind could be read', async () => {
        const context = pollContext(liveState());
        const notFound = new Error('404 not found');
        routeCalls(context, completedTask(), {
          'production-endpoint-alerts': notFound,
          'diagnostic-endpoint-alerts': notFound,
          'production-detection-alerts': notFound,
        });

        const result = (await detonateSampleStepDefinition.poll(context)) as {
          output: Record<string, unknown>;
        };

        expect(result.output.completed).toBe(true);
        expect(result.output).not.toHaveProperty('extracted_iocs');
      });

      it('still reports what was read when only some kinds fail', async () => {
        const context = pollContext(liveState());
        routeCalls(context, completedTask(), {
          'production-endpoint-alerts': new Error('404'),
          'diagnostic-endpoint-alerts': [{ dns: { question: { name: 'evil.example.org' } } }],
          'production-detection-alerts': new Error('502'),
        });

        const result = (await detonateSampleStepDefinition.poll(context)) as {
          output: Record<string, unknown>;
        };

        expect(result.output.extracted_iocs).toEqual({
          domains: ['evil.example.org'],
          ips: [],
          file_hashes: [],
        });
      });

      it('reports empty families without any read when the task counts no alerts', async () => {
        const context = pollContext(liveState());
        routeCalls(
          context,
          completedTask({
            production_endpoint_alerts_count: 0,
            diagnostic_endpoint_alerts_count: 0,
            production_detection_alerts_count: 0,
          }),
          {}
        );

        const result = (await detonateSampleStepDefinition.poll(context)) as {
          output: Record<string, unknown>;
        };

        expect(result.output.extracted_iocs).toEqual({ domains: [], ips: [], file_hashes: [] });
        expect(context.contextManager.callKibanaApi).toHaveBeenCalledTimes(1);
      });

      it('does not read alerts while the run is still in flight', async () => {
        const context = pollContext(liveState());
        routeCalls(
          context,
          completedTask({
            last_worker_name: 'detonate.workers.start_vm',
            last_worker_status: 'started',
          }),
          {}
        );

        await detonateSampleStepDefinition.poll(context);

        expect(context.contextManager.callKibanaApi).toHaveBeenCalledTimes(1);
      });
    });

    it('drops service fields the real contract does not have from the submit body', async () => {
      const context = createMockContext({
        sample_hash: 'a'.repeat(64),
        force_fresh: true,
        vm_architecture: 'aarch64',
      });
      (context.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: createTaskFixture({ id: 'task-42' }),
      });

      await detonateSampleStepDefinition.start!(context);

      expect(context.contextManager.callKibanaApi).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            sample_hash: 'a'.repeat(64),
            origin: { source: 'workflow', workflow_execution_id: 'exec-1' },
          },
        })
      );
    });

    it('returns failed: true for a failed run instead of throwing', async () => {
      const task = createTaskFixture({
        last_worker_name: 'detonate.workers.start_vm',
        last_worker_status: 'failure',
        last_worker_status_details: 'vm boot failed',
        production_endpoint_alerts_count: 1,
        production_endpoint_alert_groups: [{ alerts_count: 1, event_code: 'startup' }],
      });
      const context = pollContext({
        taskId: 'task-1',
        submittedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      });
      (context.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: task,
      });

      const result = (await detonateSampleStepDefinition.poll(context)) as {
        output: Record<string, unknown>;
      };

      expect(result.output).toMatchObject({
        task_id: 'task-1',
        completed: true,
        failed: true,
        last_worker_status_details: 'vm boot failed',
        endpoint_alert_event_codes: ['startup'],
      });
    });

    it('returns completed: false when the deadline has passed, without throwing', async () => {
      const task = createTaskFixture({
        last_worker_name: 'detonate.workers.start_vm',
        last_worker_status: 'started',
      });
      const context = pollContext({
        taskId: 'task-1',
        submittedAt: new Date(Date.now() - 120_000).toISOString(),
        deadlineAt: new Date(Date.now() - 60_000).toISOString(),
      });
      (context.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: task,
      });

      const result = (await detonateSampleStepDefinition.poll(context)) as {
        output: Record<string, unknown>;
      };

      expect(result.output).toMatchObject({ task_id: 'task-1', completed: false, failed: false });
    });

    it('continues polling while the run is in flight and the deadline has not passed', async () => {
      const task = createTaskFixture({
        last_worker_name: 'detonate.workers.start_vm',
        last_worker_status: 'started',
      });
      const state = {
        taskId: 'task-1',
        submittedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      };
      const context = pollContext(state, 2);
      (context.contextManager.callKibanaApi as jest.Mock).mockResolvedValue({
        status: 200,
        body: task,
      });

      const result = await detonateSampleStepDefinition.poll(context);

      expect(result).toEqual({ state });
    });
  });
});

describe('sanitizeIocs', () => {
  it('passes through only syntactically valid IOCs, normalized and de-duplicated', () => {
    expect(
      sanitizeIocs({
        domains: ['Evil.Example.com', 'evil.example.com', 'x") OR TRUE | WHERE ("', 'a b.com', ''],
        ips: ['203.0.113.7', '2001:DB8::1', '203.0.113.7"', '999.1.1.1'],
        file_hashes: ['A'.repeat(64), 'zz'.repeat(32), 'b'.repeat(31)],
      })
    ).toEqual({
      domains: ['evil.example.com'],
      ips: ['203.0.113.7', '2001:db8::1'],
      file_hashes: ['a'.repeat(64)],
    });
  });

  it('caps each IOC family so the hunt query stays bounded', () => {
    const { domains } = sanitizeIocs({
      domains: Array.from({ length: 150 }, (_, i) => `host${i}.example.com`),
      ips: [],
      file_hashes: [],
    });
    expect(domains).toHaveLength(100);
  });
});

describe('extractIocsFromAlertDocs', () => {
  const SAMPLE = 'a'.repeat(64);

  it("excludes every digest of the sample's own file", () => {
    expect(
      extractIocsFromAlertDocs(
        [
          {
            file: {
              hash: { sha256: SAMPLE.toUpperCase(), md5: 'd'.repeat(32), sha1: 'e'.repeat(40) },
            },
          },
          { file: { hash: { sha256: 'b'.repeat(64), sha1: 'f'.repeat(40) } } },
        ],
        SAMPLE
      ).file_hashes
    ).toEqual(['b'.repeat(64), 'f'.repeat(40)]);
  });

  it('drops the sandbox network: private, loopback, link-local and multicast addresses', () => {
    const ips = [
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '127.0.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.251',
      '::1',
      'fe80::1',
      'fd00::1',
      'ff02::fb',
      '203.0.113.7',
      '2001:db8::7',
    ];
    expect(extractIocsFromAlertDocs(ips.map((ip) => ({ destination: { ip } }))).ips).toEqual([
      '203.0.113.7',
      '2001:db8::7',
    ]);
  });

  it('drops hostile values instead of passing them to the hunt queries', () => {
    expect(
      extractIocsFromAlertDocs([
        {
          dns: { question: { name: ['ok.example.com', 'x") | DROP', { nested: 'object' }] } },
          destination: { ip: '203.0.113.7" OR TRUE' },
          file: { hash: { sha256: 'not-hex'.repeat(10) } },
        },
      ])
    ).toEqual({ domains: ['ok.example.com'], ips: [], file_hashes: [] });
  });

  it('caps each family', () => {
    const docs = Array.from({ length: 150 }, (_, i) => ({
      'dns.question.name': `host${i}.example.com`,
    }));
    expect(extractIocsFromAlertDocs(docs).domains).toHaveLength(100);
  });
});
