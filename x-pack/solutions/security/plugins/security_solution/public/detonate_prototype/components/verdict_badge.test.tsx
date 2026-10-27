/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import type { DetonateTask } from '../../../common/detonate_prototype';
import { DetonateVerdictBadge, VERDICT_BADGE_TEST_ID } from './verdict_badge';
import * as i18n from '../translations';

const baseTask = {
  created_at: '2026-10-27T10:00:00Z',
  file_name: 'invoice.pdf',
  file_sha256: 'a'.repeat(64),
  reputation: 'unknown',
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  tags: [],
} as const;

const makeTask = (overrides: Partial<DetonateTask>): DetonateTask =>
  ({ ...baseTask, ...overrides } as unknown as DetonateTask);

describe('DetonateVerdictBadge', () => {
  it('renders nothing while the run is still in flight', () => {
    const task = makeTask({
      last_worker_name: 'detonate.workers.start_vm',
      last_worker_status: 'started',
    });

    const { container } = render(<DetonateVerdictBadge task={task} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['malicious', 2, 0],
    ['quiet', 0, 0],
  ] as const)(
    'renders the %s verdict from the run outcome',
    (verdict, endpointAlerts, detectionAlerts) => {
      const task = makeTask({
        ...(endpointAlerts > 0
          ? {
              production_endpoint_alerts_count: endpointAlerts,
              production_endpoint_alert_groups: Array.from({ length: endpointAlerts }, (_, i) => ({
                event_code: `proc-${i}`,
                alerts_count: 1,
              })),
            }
          : {}),
        ...(detectionAlerts > 0
          ? {
              production_detection_alerts_count: detectionAlerts,
              production_detection_alert_groups: Array.from(
                { length: detectionAlerts },
                (_, i) => ({
                  kibana_alert_rule_name: `rule-${i}`,
                  kibana_alert_rule_parameters_severity: 'high' as const,
                  alerts_count: 1,
                })
              ),
            }
          : {}),
      });

      render(<DetonateVerdictBadge task={task} />);
      const badge = screen.getByTestId(`${VERDICT_BADGE_TEST_ID}-${verdict}`);
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent(
        verdict === 'malicious'
          ? i18n.VERDICT_MALICIOUS
          : verdict === 'quiet'
          ? i18n.VERDICT_QUIET
          : i18n.VERDICT_INCONCLUSIVE
      );
    }
  );

  it('renders inconclusive when the run failed', () => {
    const task = makeTask({
      last_worker_name: 'detonate.workers.start_vm',
      last_worker_status: 'failure',
    });

    render(<DetonateVerdictBadge task={task} />);
    expect(screen.getByTestId(`${VERDICT_BADGE_TEST_ID}-inconclusive`)).toBeInTheDocument();
  });
});
