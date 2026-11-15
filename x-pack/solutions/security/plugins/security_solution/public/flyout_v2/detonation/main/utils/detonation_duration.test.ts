/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonateTask, DetonateTaskUpdate } from '../../../../../common/detonate_prototype';
import { formatDetonationDuration, getDetonationDurationMs } from './detonation_duration';

const baseTask = {
  id: 'task-1',
  created_at: '2026-10-27T10:00:00Z',
  sample_filename: 'invoice.pdf',
  sample_hash: 'a'.repeat(64),
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  tags: ['alert:1'],
} as const;

const makeTask = (overrides: Partial<DetonateTask> = {}): DetonateTask =>
  ({ ...baseTask, ...overrides } as unknown as DetonateTask);

const update = (task: DetonateTask, timestamp: string): DetonateTaskUpdate => ({ task, timestamp });

describe('getDetonationDurationMs', () => {
  it('uses the newest update as the completion time', () => {
    const task = makeTask();
    const duration = getDetonationDurationMs(task, [
      update(task, '2026-10-27T10:01:00Z'),
      update(task, '2026-10-27T10:02:05Z'),
      update(task, '2026-10-27T10:00:30Z'),
    ]);

    expect(duration).toBe(125_000);
  });

  it('ignores an unparseable timestamp instead of hiding the duration', () => {
    const task = makeTask();

    expect(
      getDetonationDurationMs(task, [
        update(task, 'not-a-date'),
        update(task, '2026-10-27T10:02:05Z'),
      ])
    ).toBe(125_000);
  });

  it('is undefined when no update has a parseable timestamp', () => {
    const task = makeTask();

    expect(getDetonationDurationMs(task, [update(task, 'not-a-date')])).toBeUndefined();
  });

  it('is undefined while the run is still in flight', () => {
    const task = makeTask({
      last_worker_name: 'detonate.workers.start_vm',
      last_worker_status: 'started',
    });

    expect(getDetonationDurationMs(task, [update(task, '2026-10-27T10:02:00Z')])).toBeUndefined();
  });

  it('is undefined when the update history has not loaded', () => {
    expect(getDetonationDurationMs(makeTask(), undefined)).toBeUndefined();
    expect(getDetonationDurationMs(makeTask(), [])).toBeUndefined();
  });
});

describe('formatDetonationDuration', () => {
  it.each([
    [45_000, '45s'],
    [125_000, '2m 05s'],
    [3_780_000, '1h 03m'],
  ])('formats %d ms as %s', (ms, expected) => {
    expect(formatDetonationDuration(ms)).toBe(expected);
  });
});
