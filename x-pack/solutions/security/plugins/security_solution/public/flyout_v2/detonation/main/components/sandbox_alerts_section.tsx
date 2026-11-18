/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import {
  isDetonationComplete,
  totalDetonationAlerts,
} from '../../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../../common/detonate_prototype';
import {
  DetectionAlertGroups,
  EndpointAlertGroups,
} from '../../../../detonate_prototype/components/alert_groups';
import * as i18n from '../../../../detonate_prototype/translations';
import {
  DETONATION_SANDBOX_ALERTS_EMPTY_TEST_ID,
  DETONATION_SANDBOX_ALERTS_TEST_ID,
} from '../test_ids';
import { OverviewSection } from './overview_section';

interface SandboxAlertsSectionProps {
  task: DetonateTask;
}

/**
 * The three alert groups a run produces. The groups stay on screen when empty
 * so their counts are always there to read. The "Open in Correlations" link is
 * left out: Correlations does not exist yet.
 *
 * Epic #20877 §State inventory: the Copy section's response statement ("We observed {N} sandbox
 * SIEM alerts from {M} rules during this detonation. {K} of those rules are disabled in this
 * cluster.") is not shown: the run carries no rule count and no disabled-rule count; pending
 * product answer.
 */
export const SandboxAlertsSection = ({ task }: SandboxAlertsSectionProps) => {
  const noAlerts = totalDetonationAlerts(task) === 0;

  return (
    <OverviewSection
      sectionId="sandboxalerts"
      title={i18n.OVERVIEW_SANDBOX_ALERTS_TITLE}
      defaultExpanded
      data-test-subj={DETONATION_SANDBOX_ALERTS_TEST_ID}
    >
      {noAlerts && (
        <EuiText size="s" color="subdued" data-test-subj={DETONATION_SANDBOX_ALERTS_EMPTY_TEST_ID}>
          {isDetonationComplete(task)
            ? i18n.OVERVIEW_SANDBOX_ALERTS_EMPTY_COMPLETE
            : i18n.OVERVIEW_SANDBOX_ALERTS_EMPTY_RUNNING}
        </EuiText>
      )}
      <EuiFlexGroup direction="column" gutterSize="l">
        <EuiFlexItem>
          <EndpointAlertGroups
            title={i18n.PRODUCTION_ENDPOINT_ALERTS}
            total={task.production_endpoint_alerts_count}
            groups={task.production_endpoint_alert_groups}
            testSubj="detonatePrototypeProductionEndpointAlerts"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <DetectionAlertGroups
            title={i18n.PRODUCTION_DETECTION_ALERTS}
            total={task.production_detection_alerts_count}
            groups={task.production_detection_alert_groups}
            testSubj="detonatePrototypeProductionDetectionAlerts"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EndpointAlertGroups
            title={i18n.DIAGNOSTIC_ENDPOINT_ALERTS}
            total={task.diagnostic_endpoint_alerts_count}
            groups={task.diagnostic_endpoint_alert_groups}
            testSubj="detonatePrototypeDiagnosticEndpointAlerts"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </OverviewSection>
  );
};
