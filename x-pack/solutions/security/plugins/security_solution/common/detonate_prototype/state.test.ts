/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DETONATE_ESCALATED_TAG,
  DETONATE_QUEUED_TAG,
  deriveDetonationRunState,
  deriveDetonationState,
  detonateOsFamilyFromHostOsType,
} from '.';
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

describe('deriveDetonationRunState', () => {
  it('is complete for a finished run with a verdict', () => {
    expect(deriveDetonationRunState(createTask({ production_endpoint_alerts_count: 1 }))).toBe(
      'complete'
    );
    expect(deriveDetonationRunState(createTask())).toBe('complete');
  });

  it('is running until the terminal worker succeeds', () => {
    expect(deriveDetonationRunState(createTask(running))).toBe('running');
  });

  it('is failed when a worker failed', () => {
    expect(deriveDetonationRunState(createTask(failed))).toBe('failed');
  });

  it('is inconclusive when only diagnostic alerts fired', () => {
    expect(deriveDetonationRunState(createTask({ diagnostic_endpoint_alerts_count: 2 }))).toBe(
      'inconclusive'
    );
  });

  it('is escalated for a finished or failed run carrying the escalation tag', () => {
    const tags = [DETONATE_ESCALATED_TAG];
    expect(deriveDetonationRunState(createTask({ tags }))).toBe('escalated');
    expect(deriveDetonationRunState(createTask({ tags, ...failed }))).toBe('escalated');
  });

  it('never shows a run that is still going as escalated', () => {
    expect(
      deriveDetonationRunState(createTask({ tags: [DETONATE_ESCALATED_TAG], ...running }))
    ).toBe('running');
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

describe('deriveDetonationState', () => {
  it('lets a run win over every alert-only signal', () => {
    expect(
      deriveDetonationState({
        run: createTask(running),
        alertTags: [DETONATE_QUEUED_TAG],
        hostOsType: 'ios',
        allowanceExhausted: true,
      })
    ).toBe('running');
  });

  it('puts an unsupported OS ahead of the allowance', () => {
    expect(deriveDetonationState({ hostOsType: 'ios', allowanceExhausted: true })).toBe(
      'unsupported_os'
    );
  });

  it('puts the allowance ahead of the queue marker', () => {
    expect(
      deriveDetonationState({ allowanceExhausted: true, alertTags: [DETONATE_QUEUED_TAG] })
    ).toBe('allowance_reached');
  });

  it('is queued when a Worker marked the alert', () => {
    expect(deriveDetonationState({ alertTags: [DETONATE_QUEUED_TAG] })).toBe('queued');
  });

  it('is not analyzed otherwise', () => {
    expect(deriveDetonationState({})).toBe('not_analyzed');
    expect(deriveDetonationState({ hostOsType: 'linux' })).toBe('not_analyzed');
  });

  it('does not treat a missing OS as unsupported', () => {
    expect(deriveDetonationState({ allowanceExhausted: true })).toBe('allowance_reached');
  });

  it('honours a configured OS list', () => {
    expect(deriveDetonationState({ hostOsType: 'macos', supportedOsFamilies: ['linux'] })).toBe(
      'unsupported_os'
    );
    expect(deriveDetonationState({ hostOsType: 'macos' })).toBe('not_analyzed');
  });
});
