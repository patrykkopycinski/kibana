/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonateTask } from '../../../../common/detonate_prototype';
import { summarizeDetonationTask } from './types';

describe('summarizeDetonationTask', () => {
  it('keeps sandbox identifiers out of what the model sees', () => {
    const sensitive = {
      agent_fleet_enrollment_token: 'token-value-1',
      vm_instance_name: 'vm-instance-value-2',
      elastic_agent_id: 'agent-id-value-3',
      elastic_endpoint_id: 'endpoint-id-value-4',
    };
    const task: DetonateTask = {
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
      vm_os_family: 'linux',
      production_endpoint_alert_groups: [],
      diagnostic_endpoint_alert_groups: [],
      production_detection_alert_groups: [],
      ...sensitive,
    };

    const summary = summarizeDetonationTask(task);
    const serialised = JSON.stringify(summary);

    expect(summary).toMatchObject({ task_id: 'task-1', vm_os_family: 'linux' });
    for (const value of Object.values(sensitive)) {
      expect(serialised).not.toContain(value);
    }
  });
});
