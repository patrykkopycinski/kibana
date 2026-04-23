/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  type EuiBasicTableColumn,
  EuiButtonGroup,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type {
  ArgusCoverageGap,
  ArgusCoverageSeverity,
  ArgusCoverageWindow,
} from '@kbn/argus-console-common';

import { useCoverageGaps, type ArgusHttp } from '../../hooks';

export interface CoverageGapsPanelProps {
  readonly http?: ArgusHttp;
  readonly initialWindow?: ArgusCoverageWindow;
}

const WINDOW_OPTIONS: ReadonlyArray<{ readonly id: ArgusCoverageWindow; readonly label: string }> =
  [
    { id: '24h', label: 'Last 24h' },
    { id: '7d', label: 'Last 7d' },
  ];

const severityBadge = (severity: ArgusCoverageSeverity): JSX.Element => {
  switch (severity) {
    case 'critical':
      return <EuiBadge color="danger">{'Critical'}</EuiBadge>;
    case 'high':
      return <EuiBadge color="warning">{'High'}</EuiBadge>;
    case 'moderate':
      return <EuiBadge color="accent">{'Moderate'}</EuiBadge>;
    case 'low':
      return <EuiBadge color="hollow">{'Low'}</EuiBadge>;
  }
};

const formatConfidence = (value: number): string =>
  Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : '—';

export const CoverageGapsPanel: React.FC<CoverageGapsPanelProps> = ({
  http,
  initialWindow = '7d',
}) => {
  const [window, setWindow] = useState<ArgusCoverageWindow>(initialWindow);

  const state = useCoverageGaps({
    http: http as ArgusHttp,
    window,
    enabled: Boolean(http),
    refreshIntervalMs: 15_000,
  });

  const payload = state.status === 'success' ? state.data : null;
  const isLoading = Boolean(http) && state.status === 'loading';
  const hasLiveData = state.status === 'success';
  const counts = payload?.counts ?? { total: 0, critical: 0, high: 0, moderate: 0, low: 0 };
  const gaps = payload?.gaps ?? [];

  const columns = useMemo<Array<EuiBasicTableColumn<ArgusCoverageGap>>>(
    () => [
      {
        field: 'severity',
        name: 'Severity',
        width: '110px',
        render: (value: ArgusCoverageSeverity) => severityBadge(value),
      },
      {
        field: 'technique_id',
        name: 'Technique',
        width: '200px',
        render: (_value, row) => (
          <div>
            <EuiText size="s">
              <strong>{row.technique_id}</strong>
            </EuiText>
            {row.technique_name ? (
              <EuiText size="xs" color="subdued">
                {row.technique_name}
              </EuiText>
            ) : null}
          </div>
        ),
      },
      {
        field: 'occurrences',
        name: 'Occurrences',
        width: '130px',
        render: (value: number) => <EuiBadge color="hollow">{value}</EuiBadge>,
      },
      {
        field: 'avg_confidence',
        name: 'Avg. detection confidence',
        width: '220px',
        render: (value: number) => <EuiText size="s">{formatConfidence(value)}</EuiText>,
      },
      {
        field: 'source',
        name: 'Source',
        render: (value: string | undefined) =>
          value ? (
            <EuiText size="s" color="subdued">
              <code>{value}</code>
            </EuiText>
          ) : (
            <span>{'—'}</span>
          ),
      },
    ],
    []
  );

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="argusConsoleCoveragePanel">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{'Coverage gaps'}</h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {'MITRE techniques with low-confidence detection or missing coverage from '}
            <code>{'.soc-coverage-gaps'}</code>
            {'. Severity combines noise (occurrences) with detection confidence.'}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={hasLiveData ? 'success' : 'hollow'}>
            {hasLiveData ? 'live' : 'demo-grade'}
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="m" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiStat title={counts.total} description="Gaps" titleSize="s" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={counts.critical}
            description="Critical"
            titleSize="s"
            titleColor="danger"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat title={counts.high} description="High" titleSize="s" titleColor="warning" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={counts.moderate}
            description="Moderate"
            titleSize="s"
            titleColor="accent"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat title={counts.low} description="Low" titleSize="s" titleColor="subdued" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend="Time window"
            idSelected={window}
            onChange={(id) => setWindow(id as ArgusCoverageWindow)}
            options={WINDOW_OPTIONS.map(({ id, label }) => ({ id, label }))}
            buttonSize="s"
            data-test-subj="argusCoverageWindowToggle"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      {isLoading ? (
        <>
          <EuiSpacer size="m" />
          <EuiProgress size="xs" color="primary" />
        </>
      ) : null}

      <EuiSpacer size="m" />

      {state.status === 'error' ? (
        <EuiCallOut
          color="danger"
          iconType="alert"
          title="Couldn't load coverage gaps"
          data-test-subj="argusCoverageError"
        >
          {state.error.message}
        </EuiCallOut>
      ) : gaps.length === 0 ? (
        <EuiEmptyPrompt
          iconType="dot"
          title={<h4>{'No detection coverage gaps'}</h4>}
          body={
            <EuiText size="s">
              {'Nothing in '}
              <code>{'.soc-coverage-gaps'}</code>
              {' for the '}
              <strong>{window === '24h' ? 'last 24 hours' : 'last 7 days'}</strong>
              {'. Either the gap-analyzer has not run yet, or ARGUS is hitting every technique.'}
            </EuiText>
          }
          data-test-subj="argusCoverageEmpty"
        />
      ) : (
        <>
          <EuiBasicTable<ArgusCoverageGap>
            items={[...gaps]}
            columns={columns}
            tableLayout="auto"
            data-test-subj="argusCoverageTable"
          />
          {payload?.truncated ? (
            <>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="subdued">
                {'Showing '}
                <strong>{gaps.length}</strong>
                {' gaps — more matched this window.'}
              </EuiText>
            </>
          ) : null}
        </>
      )}
    </EuiPanel>
  );
};
