/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — alert group tables.
 *
 * Endpoint groups and detection groups are genuinely different shapes
 * (`event_code` versus `kibana_alert_rule_name`), so they get two tables
 * rather than one table over a merged type that would have to lie about half
 * its columns.
 */

import React from 'react';
import {
  EuiBasicTable,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';

import type {
  DetonateDetectionAlertsGroup,
  DetonateEndpointAlertsGroup,
} from '../../../common/detonate_prototype';
import { NO_ALERTS_IN_GROUP } from '../translations';

export const ENDPOINT_GROUPS_TEST_ID = 'detonatePrototypeEndpointAlertGroups';
export const DETECTION_GROUPS_TEST_ID = 'detonatePrototypeDetectionAlertGroups';

const severityColor = (
  severity: DetonateDetectionAlertsGroup['kibana_alert_rule_parameters_severity']
) => {
  switch (severity) {
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    default:
      return 'default';
  }
};

const endpointColumns: Array<EuiBasicTableColumn<DetonateEndpointAlertsGroup>> = [
  {
    field: 'event_code',
    name: 'event.code',
    render: (code: string) => <EuiBadge color="hollow">{code}</EuiBadge>,
  },
  { field: 'rule_name', name: 'Rule', render: (name?: string) => name ?? '—' },
  {
    field: 'message',
    name: 'Message',
    render: (message?: string) => message ?? '—',
    truncateText: true,
  },
  { field: 'alerts_count', name: 'Count', width: '80px', align: 'right' },
];

const detectionColumns: Array<EuiBasicTableColumn<DetonateDetectionAlertsGroup>> = [
  { field: 'kibana_alert_rule_name', name: 'Rule' },
  {
    field: 'kibana_alert_rule_parameters_severity',
    name: 'Severity',
    width: '120px',
    render: (severity: DetonateDetectionAlertsGroup['kibana_alert_rule_parameters_severity']) => (
      <EuiBadge color={severityColor(severity)}>{severity}</EuiBadge>
    ),
  },
  { field: 'alerts_count', name: 'Count', width: '80px', align: 'right' },
];

interface GroupSectionProps {
  title: string;
  /** `undefined` when the service has not reported a count yet. */
  total?: number;
  testSubj: string;
  children: React.ReactNode;
}

const GroupSection = React.memo<GroupSectionProps>(({ title, total, testSubj, children }) => (
  <EuiPanel hasBorder data-test-subj={testSubj}>
    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiTitle size="xs">
          <h3>{title}</h3>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge data-test-subj={`${testSubj}-count`}>{total ?? 0}</EuiBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="s" />
    {children}
  </EuiPanel>
));
GroupSection.displayName = 'GroupSection';

const Empty = () => (
  <EuiText size="s" color="subdued">
    {NO_ALERTS_IN_GROUP}
  </EuiText>
);

export const EndpointAlertGroups = React.memo<{
  title: string;
  total?: number;
  groups: DetonateEndpointAlertsGroup[];
  testSubj?: string;
}>(({ title, total, groups, testSubj = ENDPOINT_GROUPS_TEST_ID }) => (
  <GroupSection title={title} total={total} testSubj={testSubj}>
    {groups.length === 0 ? (
      <Empty />
    ) : (
      <EuiBasicTable
        items={groups}
        columns={endpointColumns}
        tableCaption={title}
        tableLayout="auto"
        data-test-subj={`${testSubj}-table`}
      />
    )}
  </GroupSection>
));
EndpointAlertGroups.displayName = 'EndpointAlertGroups';

export const DetectionAlertGroups = React.memo<{
  title: string;
  total?: number;
  groups: DetonateDetectionAlertsGroup[];
  testSubj?: string;
}>(({ title, total, groups, testSubj = DETECTION_GROUPS_TEST_ID }) => (
  <GroupSection title={title} total={total} testSubj={testSubj}>
    {groups.length === 0 ? (
      <Empty />
    ) : (
      <EuiBasicTable
        items={groups}
        columns={detectionColumns}
        tableCaption={title}
        tableLayout="auto"
        data-test-subj={`${testSubj}-table`}
      />
    )}
  </GroupSection>
));
DetectionAlertGroups.displayName = 'DetectionAlertGroups';
