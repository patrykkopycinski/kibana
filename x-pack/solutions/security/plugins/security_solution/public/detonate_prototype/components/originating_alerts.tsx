/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — the production alerts a detonation was submitted from.
 *
 * The alerts are read through the detection engine's alert search, so they are read as the current
 * user and a user who cannot read alerts sees "not available" rather than an error. Nothing here
 * writes to an alert.
 */

import React, { useMemo } from 'react';
import { get } from 'lodash';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiSkeletonText,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import { ALERTS_QUERY_NAMES } from '../../detections/containers/detection_engine/alerts/constants';
import { useQueryAlerts } from '../../detections/containers/detection_engine/alerts/use_query';
import { useSignalIndexName } from '../../data_view_manager/hooks/use_signal_index_name';
import { useFlyoutApi } from '../../flyout_v2/use_flyout_api';
import {
  ORIGINATING_ALERTS_MORE,
  ORIGINATING_ALERTS_TITLE,
  ORIGINATING_ALERT_NOT_AVAILABLE,
  ORIGINATING_ALERT_OPEN,
  RUNS_TABLE_LOADING,
} from '../translations';

export const ORIGINATING_ALERTS_TEST_ID = 'detonatePrototypeOriginatingAlerts';
export const ORIGINATING_ALERTS_MAX = 25;

const SOURCE_FIELDS = [
  '@timestamp',
  'kibana.alert.rule.name',
  'kibana.alert.severity',
  'kibana.alert.workflow_status',
  'host.name',
  'user.name',
  'file.name',
];

interface AlertHit {
  _id: string;
  _index: string;
  _source?: Record<string, unknown>;
}

const severityColor = (severity: string | undefined) => {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    default:
      return 'default';
  }
};

const text = (source: Record<string, unknown> | undefined, field: string): string | undefined => {
  const value: unknown = get(source, field);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * Mount it only for a run that has origin alert ids and remount (`key`) when they change: the alert
 * search keeps the query it was first given.
 */
export const OriginatingAlerts = ({ ids }: { ids: string[] }) => {
  const { openDocumentFlyoutFromIndex } = useFlyoutApi();
  const signalIndexName = useSignalIndexName();
  const shownIds = useMemo(() => ids.slice(0, ORIGINATING_ALERTS_MAX), [ids]);
  const hiddenCount = ids.length - shownIds.length;

  const { data, refetch } = useQueryAlerts<AlertHit, {}>({
    query: {
      query: { ids: { values: shownIds } },
      size: shownIds.length,
      track_total_hits: false,
      _source: SOURCE_FIELDS,
    },
    indexName: signalIndexName,
    skip: shownIds.length === 0 || !signalIndexName,
    queryName: ALERTS_QUERY_NAMES.BY_ID,
  });

  const hitsById = useMemo(
    () => new Map((data?.hits.hits ?? []).map((hit) => [hit._id, hit])),
    [data]
  );
  // `refetch` is set once the read has settled, whether it answered or failed.
  const isLoading = Boolean(signalIndexName) && refetch === null;

  return (
    <EuiPanel hasBorder data-test-subj={ORIGINATING_ALERTS_TEST_ID}>
      <EuiTitle size="xs">
        <h3>{ORIGINATING_ALERTS_TITLE(ids.length)}</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {isLoading ? (
        <EuiSkeletonText
          lines={shownIds.length > 2 ? 3 : 2}
          isLoading
          contentAriaLabel={RUNS_TABLE_LOADING}
          data-test-subj={`${ORIGINATING_ALERTS_TEST_ID}-loading`}
        />
      ) : (
        <EuiFlexGroup direction="column" gutterSize="xs">
          {shownIds.map((id) => {
            const hit = hitsById.get(id);
            if (!hit) {
              return (
                <EuiFlexItem key={id} data-test-subj={`${ORIGINATING_ALERTS_TEST_ID}-missing`}>
                  <EuiText size="s" color="subdued">
                    {ORIGINATING_ALERT_NOT_AVAILABLE}
                  </EuiText>
                </EuiFlexItem>
              );
            }
            const source = hit._source;
            const name = text(source, 'kibana.alert.rule.name') ?? id;
            const severity = text(source, 'kibana.alert.severity');
            const context = ['host.name', 'user.name', 'file.name']
              .map((field) => text(source, field))
              .filter(Boolean)
              .join(' · ');
            return (
              <EuiFlexItem key={id} data-test-subj={`${ORIGINATING_ALERTS_TEST_ID}-alert`}>
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
                  <EuiFlexItem grow={false}>
                    <EuiLink
                      aria-label={ORIGINATING_ALERT_OPEN(name)}
                      data-test-subj={`${ORIGINATING_ALERTS_TEST_ID}-open`}
                      onClick={() =>
                        openDocumentFlyoutFromIndex({
                          documentId: hit._id,
                          indexName: hit._index,
                          title: name,
                        })
                      }
                    >
                      {name}
                    </EuiLink>
                  </EuiFlexItem>
                  {severity && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={severityColor(severity)}>{severity}</EuiBadge>
                    </EuiFlexItem>
                  )}
                  {context && (
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        {context}
                      </EuiText>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiFlexItem>
            );
          })}
          {hiddenCount > 0 && (
            <EuiFlexItem data-test-subj={`${ORIGINATING_ALERTS_TEST_ID}-more`}>
              <EuiText size="s" color="subdued">
                {ORIGINATING_ALERTS_MORE(hiddenCount)}
              </EuiText>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      )}
    </EuiPanel>
  );
};
