/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonateTask } from '../../common/detonate_prototype';
import { toDetonationRecord } from './detonation_record';

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
