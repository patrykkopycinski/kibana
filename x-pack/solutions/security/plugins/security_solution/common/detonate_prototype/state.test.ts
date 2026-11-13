/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { deriveDetonationRunStatus, detonateOsFamilyFromHostOsType } from '.';
import type { DetonateTask } from '.';

const createTask = (overrides: Partial<DetonateTask> = {}): DetonateTask => ({
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

const running = {
  last_worker_name: 'detonate.workers.stop_vm',
  last_worker_status: 'started',
} as const;
const failed = {
  last_worker_name: 'detonate.workers.start_vm',
  last_worker_status: 'failure',
} as const;

describe('deriveDetonationRunStatus', () => {
  it('is complete for a finished run', () => {
    expect(deriveDetonationRunStatus(createTask({ production_endpoint_alerts_count: 1 }))).toBe(
      'complete'
    );
    expect(deriveDetonationRunStatus(createTask())).toBe('complete');
  });

  it('is running until the terminal worker succeeds', () => {
    expect(deriveDetonationRunStatus(createTask(running))).toBe('running');
  });

  it('is failed when a worker failed', () => {
    expect(deriveDetonationRunStatus(createTask(failed))).toBe('failed');
  });

  it('is complete, not a separate state, when only diagnostic alerts fired', () => {
    expect(deriveDetonationRunStatus(createTask({ diagnostic_endpoint_alerts_count: 2 }))).toBe(
      'complete'
    );
  });

  it('ignores a legacy escalation tag', () => {
    const tags = ['detonate:escalated'];
    expect(deriveDetonationRunStatus(createTask({ tags }))).toBe('complete');
    expect(deriveDetonationRunStatus(createTask({ tags, ...failed }))).toBe('failed');
    expect(deriveDetonationRunStatus(createTask({ tags, ...running }))).toBe('running');
  });
});

describe('detonateOsFamilyFromHostOsType', () => {
  it('maps ECS host.os.type to the service family', () => {
    expect(detonateOsFamilyFromHostOsType('linux')).toBe('linux');
    expect(detonateOsFamilyFromHostOsType('Windows')).toBe('windows');
    expect(detonateOsFamilyFromHostOsType('macos')).toBe('darwin');
    expect(detonateOsFamilyFromHostOsType('ios')).toBeUndefined();
  });
});
