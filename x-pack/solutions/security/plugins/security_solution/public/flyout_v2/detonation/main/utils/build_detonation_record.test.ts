/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonateTask } from '../../../../../common/detonate_prototype';
import { buildDetonationRecord } from './build_detonation_record';

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

describe('buildDetonationRecord', () => {
  it('redacts the Fleet enrollment token', () => {
    const record = buildDetonationRecord(
      makeTask({ agent_fleet_enrollment_token: 'secret-token' } as Partial<DetonateTask>)
    );

    expect(JSON.stringify(record.raw)).not.toContain('secret-token');
    expect(record.flattened.agent_fleet_enrollment_token).toBeUndefined();
  });

  it('flattens scalar and array fields and stringifies arrays of objects', () => {
    const record = buildDetonationRecord(
      makeTask({
        production_endpoint_alert_groups: [{ event_code: 'proc-1', alerts_count: 2 }],
      } as Partial<DetonateTask>)
    );

    expect(record.raw._id).toBe('task-1');
    expect(record.flattened.sample_filename).toEqual(['invoice.pdf']);
    expect(record.flattened.tags).toEqual(['alert:1']);
    expect(record.flattened.production_endpoint_alert_groups).toEqual([
      JSON.stringify({ event_code: 'proc-1', alerts_count: 2 }),
    ]);
  });
});
