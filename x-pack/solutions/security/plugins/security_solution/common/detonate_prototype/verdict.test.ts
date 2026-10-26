/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DETONATE_QUIET_SEED_SHA256,
  deriveDetonateVerdict,
  parseAlertTag,
  detonateVerdictTag,
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

describe('deriveDetonateVerdict', () => {
  it('derives malicious from a completed run with alerts', () => {
    const verdict = deriveDetonateVerdict(
      createTask({
        production_endpoint_alerts_count: 3,
        production_endpoint_alert_groups: [
          { alerts_count: 2, event_code: 'malicious_file' },
          { alerts_count: 1, event_code: 'malicious_file' },
        ],
        production_detection_alerts_count: 2,
        production_detection_alert_groups: [
          {
            alerts_count: 2,
            kibana_alert_rule_name: 'Malware Prevention Alert',
            kibana_alert_rule_parameters_severity: 'high',
          },
        ],
      })
    );

    expect(verdict.verdict).toBe('malicious');
    expect(verdict.total_alerts_count).toBe(5);
    expect(verdict.endpoint_alert_event_codes).toEqual(['malicious_file']);
    expect(verdict.detection_rule_names).toEqual(['Malware Prevention Alert']);
    expect(verdict.suggested_tag).toBe('detonate:malicious');
    expect(verdict.evidence).toContain('5 alert(s)');
  });

  it('derives quiet from a completed run with zero alerts', () => {
    const verdict = deriveDetonateVerdict(createTask({ sample_hash: DETONATE_QUIET_SEED_SHA256 }));

    expect(verdict.verdict).toBe('quiet');
    expect(verdict.total_alerts_count).toBe(0);
    expect(verdict.suggested_tag).toBe('detonate:quiet');
    expect(verdict.evidence).toContain('no alerts');
  });

  it('derives inconclusive from a failed run — never benign', () => {
    const verdict = deriveDetonateVerdict(
      createTask({
        last_worker_name: 'detonate.workers.start_vm',
        last_worker_status: 'failure',
        last_worker_status_details: 'vm boot failed',
      })
    );

    expect(verdict.verdict).toBe('inconclusive');
    expect(verdict.suggested_tag).toBe('detonate:inconclusive');
    expect(verdict.evidence).toContain('start_vm');
    expect(verdict.evidence).toContain('vm boot failed');
  });

  it('derives inconclusive from an unfinished run', () => {
    const verdict = deriveDetonateVerdict(
      createTask({ last_worker_name: 'detonate.workers.stop_vm', last_worker_status: 'success' })
    );

    expect(verdict.verdict).toBe('inconclusive');
  });

  it('carries the alert id parsed off the alert:<id> tag', () => {
    const verdict = deriveDetonateVerdict(createTask({ tags: ['demo', 'alert:abc-123'] }));

    expect(verdict.alert_id).toBe('abc-123');
  });

  it('omits alert_id when no alert tag is present', () => {
    expect(deriveDetonateVerdict(createTask({ tags: ['demo'] })).alert_id).toBeUndefined();
  });

  it('is pure: the same task yields the same verdict twice', () => {
    const task = createTask({
      production_endpoint_alerts_count: 1,
      production_endpoint_alert_groups: [{ alerts_count: 1, event_code: 'ransomware' }],
    });
    expect(deriveDetonateVerdict(task)).toEqual(deriveDetonateVerdict(task));
  });
});

describe('alert tag helpers', () => {
  it('round-trips an alert id through the tag', () => {
    expect(parseAlertTag(['demo', 'alert:xyz'])).toBe('xyz');
  });

  it('ignores a bare alert: prefix and non-alert tags', () => {
    expect(parseAlertTag(['alert:'])).toBeUndefined();
    expect(parseAlertTag(['detonate:quiet'])).toBeUndefined();
  });
});

describe('verdict tags', () => {
  it('uses the detonate: prefix for every verdict', () => {
    expect(detonateVerdictTag('malicious')).toBe('detonate:malicious');
    expect(detonateVerdictTag('quiet')).toBe('detonate:quiet');
    expect(detonateVerdictTag('inconclusive')).toBe('detonate:inconclusive');
  });
});
