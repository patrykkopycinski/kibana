/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonateTask } from '../../common/detonate_prototype';
import { DETONATION_RECORD_FIELDS, toDetonationRecord } from './detonation_record';

const createTask = (overrides: Partial<DetonateTask> = {}): DetonateTask => ({
  id: 'task-1',
  created_at: '2026-01-01T00:00:00.000Z',
  tags: ['space:default', 'alert:alert-1'],
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

const maliciousTask = (overrides: Partial<DetonateTask> = {}) =>
  createTask({
    sample_hash: 'ABCDEF',
    sample_filename: 'sample.bin',
    sample_source: 'malwarebazaar',
    vm_os_family: 'linux',
    production_endpoint_alerts_count: 2,
    production_endpoint_alert_groups: [{ alerts_count: 2, event_code: 'malicious_file' }],
    diagnostic_endpoint_alerts_count: 1,
    diagnostic_endpoint_alert_groups: [{ alerts_count: 1, event_code: 'behavior' }],
    ...overrides,
  });

describe('toDetonationRecord', () => {
  it('never carries the sandbox identifiers or the enrollment token', () => {
    const sensitive = {
      agent_fleet_enrollment_token: 'token-value-1',
      vm_instance_name: 'vm-instance-value-2',
      elastic_agent_id: 'agent-id-value-3',
      elastic_endpoint_id: 'endpoint-id-value-4',
      vm_disk_image: 'disk-image-value-5',
      agent_dist_base_url: 'https://dist.example/value-6',
    };
    const serialised = JSON.stringify(
      toDetonationRecord(maliciousTask(sensitive), {
        iocs: { domains: [], ips: [], file_hashes: [] },
      })
    );

    for (const value of Object.values(sensitive)) {
      expect(serialised).not.toContain(value);
    }
    expect(serialised).not.toMatch(/token|vm_instance|elastic_agent|elastic_endpoint/);
  });

  it('describes a finished malicious run', () => {
    const record = toDetonationRecord(maliciousTask());

    expect(record).toMatchObject({
      'detonate.task_id': 'task-1',
      'detonate.alert_id': 'alert-1',
      'detonate.state': 'complete',
      'detonate.verdict': 'malicious',
      'detonate.confidence': 'high',
      'detonate.step.number': 4,
      'detonate.step.of': 4,
      'detonate.step.label': 'Writing the summary',
      'detonate.step.worker': 'detonate.workers.make_summary',
      'file.hash.sha256': 'abcdef',
      'file.name': 'sample.bin',
      'detonate.vm.os_family': 'linux',
      'detonate.alerts.total': 3,
      // Same list the verdict note uses: production and diagnostic codes together.
      'detonate.endpoint_event_codes': ['malicious_file', 'behavior'],
      'detonate.detections_to_review': ['behavior'],
    });
    expect(record['detonate.evidence']).toContain('malicious_file');
  });

  it('gives a benign run medium confidence', () => {
    expect(toDetonationRecord(createTask())).toMatchObject({
      'detonate.state': 'complete',
      'detonate.verdict': 'benign',
      'detonate.confidence': 'medium',
      'detonate.alerts.total': 0,
    });
  });

  it('gives a complete run with only diagnostic alerts the inconclusive verdict', () => {
    const record = toDetonationRecord(
      createTask({
        diagnostic_endpoint_alerts_count: 1,
        diagnostic_endpoint_alert_groups: [{ alerts_count: 1, event_code: 'behavior' }],
      })
    );

    expect(record).toMatchObject({
      'detonate.state': 'complete',
      'detonate.verdict': 'inconclusive',
      'detonate.confidence': 'low',
      'detonate.detections_to_review': ['behavior'],
    });
  });

  it('marks a failed run failed with its evidence and the service detail, but no verdict', () => {
    const record = toDetonationRecord(
      createTask({
        last_worker_name: 'detonate.workers.start_vm',
        last_worker_status: 'failure',
        last_worker_status_details: 'VM did not boot',
      })
    );

    expect(record).toMatchObject({
      'detonate.state': 'failed',
      'detonate.step.number': 2,
      'detonate.step.details': 'VM did not boot',
    });
    expect(record['detonate.evidence']).toContain('VM did not boot');
    expect(record).not.toHaveProperty(['detonate.verdict']);
    expect(record).not.toHaveProperty(['detonate.confidence']);
  });

  it('gives a running run a step but no verdict, confidence, evidence or duration', () => {
    const record = toDetonationRecord(
      createTask({ last_worker_name: 'detonate.workers.stop_vm', last_worker_status: 'started' }),
      { updates: [{ task: createTask(), timestamp: '2026-01-01T00:05:00.000Z' }] }
    );

    expect(record).toMatchObject({
      'detonate.state': 'running',
      'detonate.step.number': 3,
      'detonate.step.label': 'Stopping the sandbox',
      'detonate.step.worker': 'detonate.workers.stop_vm',
    });
    for (const field of [
      'detonate.verdict',
      'detonate.confidence',
      'detonate.evidence',
      'event.end',
      'event.duration',
    ]) {
      expect(record).not.toHaveProperty([field]);
    }
  });

  it('takes the duration from the last update of a finished run', () => {
    const record = toDetonationRecord(createTask(), {
      updates: [
        { task: createTask(), timestamp: '2026-01-01T00:04:00.000Z' },
        { task: createTask(), timestamp: '2026-01-01T00:02:30.000Z' },
        { task: createTask(), timestamp: 'not a date' },
      ],
    });

    expect(record['event.end']).toBe('2026-01-01T00:04:00.000Z');
    expect(record['event.duration']).toBe(4 * 60 * 1000 * 1_000_000);
  });

  it('omits the duration when there are no updates', () => {
    expect(toDetonationRecord(createTask())).not.toHaveProperty(['event.duration']);
  });

  it('adds the space and the tags without the space tags when given a space', () => {
    const record = toDetonationRecord(
      createTask({ tags: ['space:team-a', 'alert:alert-1', 'demo'] }),
      {
        spaceId: 'team-a',
      }
    );

    expect(record).toMatchObject({
      'detonate.space_id': 'team-a',
      tags: ['alert:alert-1', 'demo'],
    });
    expect(record).not.toHaveProperty(['detonate.source']);
  });

  it('records the origin, merging the tagged alert with the ones the caller named', () => {
    const record = toDetonationRecord(createTask(), {
      spaceId: 'default',
      origin: {
        source: 'agent',
        submitter: 'analyst',
        alert_ids: ['alert-2', 'alert-1'],
        host_name: 'host-1',
        user_name: 'user-1',
        file_path: '/tmp/x',
        conversation_id: 'conv-1',
        workflow_execution_id: 'exec-1',
        file: { size: 12, mime_type: 'text/plain' },
      },
    });

    expect(record).toMatchObject({
      'detonate.source': 'agent',
      'detonate.submitter': 'analyst',
      'detonate.origin.alert_ids': ['alert-1', 'alert-2'],
      'host.name': 'host-1',
      'user.name': 'user-1',
      'file.path': '/tmp/x',
      'detonate.conversation_id': 'conv-1',
      'detonate.workflow.execution_id': 'exec-1',
      'file.size': 12,
      'file.mime_type': 'text/plain',
    });
  });

  it('leaves out origin fields the caller did not know', () => {
    const record = toDetonationRecord(createTask({ tags: ['space:default'] }), {
      origin: { source: 'detonate_page', file: { size: 0 } },
    });

    expect(record).not.toHaveProperty(['detonate.origin.alert_ids']);
    expect(record).not.toHaveProperty(['host.name']);
    expect(record).not.toHaveProperty(['file.mime_type']);
  });

  it('lists every record field in DETONATION_RECORD_FIELDS, which the index mapping is built from', () => {
    const record = toDetonationRecord(
      maliciousTask({ last_worker_status_details: 'details', sample_hash: 'ABCDEF' }),
      {
        spaceId: 'default',
        iocs: { domains: ['evil.test'], ips: ['192.0.2.1'], file_hashes: ['abc'] },
        updates: [{ task: createTask(), timestamp: '2026-01-01T00:04:00.000Z' }],
        origin: {
          source: 'agent',
          submitter: 'analyst',
          alert_ids: ['alert-2'],
          host_name: 'host-1',
          user_name: 'user-1',
          file_path: '/tmp/x',
          conversation_id: 'conv-1',
          workflow_execution_id: 'exec-1',
          file: { size: 12, mime_type: 'text/plain' },
        },
      }
    );

    expect(Object.keys(record).sort()).toEqual(Object.keys(DETONATION_RECORD_FIELDS).sort());
  });

  it('distinguishes IOCs that were not read from IOCs that were read and empty', () => {
    expect(toDetonationRecord(createTask())).not.toHaveProperty(['detonate.iocs.domains']);
    expect(
      toDetonationRecord(createTask(), {
        iocs: { domains: ['evil.test'], ips: [], file_hashes: [] },
      })
    ).toMatchObject({
      'detonate.iocs.domains': ['evil.test'],
      'detonate.iocs.ips': [],
      'detonate.iocs.file_hashes': [],
    });
  });
});
