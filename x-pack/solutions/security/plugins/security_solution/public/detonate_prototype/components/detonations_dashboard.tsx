/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — Detonations dashboard.
 *
 * The panels above the runs table: KPIs, the verdict breakdown, a trend of detonations per day
 * stacked by verdict, and the top detection rules and endpoint event codes. They read one stats
 * response, so a time or KQL change moves every panel together, each with its own loading, empty
 * and error state.
 *
 * Deliberate difference from the epic: no ATT&CK panel, because a run carries no tactic data to
 * count yet.
 */

import React, { useMemo } from 'react';
import {
  EuiEmptyPrompt,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiPanel,
  EuiProgress,
  EuiSkeletonRectangle,
  EuiStat,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import type { EuiThemeComputed } from '@elastic/eui';
import { Axis, BarSeries, Chart, Position, ScaleType, Settings } from '@elastic/charts';
import { useElasticChartsTheme } from '@kbn/charts-theme';
import { i18n as kbnI18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import type {
  DetonationRunStatsResponse,
  DetonationStatsTerm,
  DetonationStatsVerdict,
} from '../../../common/detonate_prototype';
import { formatDetonationDuration } from '../../flyout_v2/detonation/main/utils/detonation_duration';
import * as i18n from '../translations';

export const DASHBOARD_TEST_ID = 'detonatePrototypeDashboard';
export const DASHBOARD_KPI_DETONATIONS_TEST_ID = `${DASHBOARD_TEST_ID}-kpiDetonations`;
export const DASHBOARD_KPI_MEAN_TIME_TEST_ID = `${DASHBOARD_TEST_ID}-kpiMeanTime`;
export const DASHBOARD_KPI_ALERTS_TEST_ID = `${DASHBOARD_TEST_ID}-kpiAlerts`;
export const DASHBOARD_VERDICTS_TEST_ID = `${DASHBOARD_TEST_ID}-verdicts`;
export const DASHBOARD_TREND_TEST_ID = `${DASHBOARD_TEST_ID}-trend`;
export const DASHBOARD_TOP_RULES_TEST_ID = `${DASHBOARD_TEST_ID}-topRules`;
export const DASHBOARD_TOP_EVENT_CODES_TEST_ID = `${DASHBOARD_TEST_ID}-topEventCodes`;

/** What a figure with no data shows; the tooltip beside it says why. */
const NO_VALUE = '—';
const CHART_HEIGHT = 220;
const DAY_MS = 24 * 60 * 60 * 1000;
const VERDICT_ORDER: readonly DetonationStatsVerdict[] = [
  'malicious',
  'inconclusive',
  'benign',
  'unknown',
];

const verdictLabel = (verdict: DetonationStatsVerdict): string =>
  verdict === 'malicious'
    ? i18n.VERDICT_MALICIOUS
    : verdict === 'benign'
    ? i18n.VERDICT_BENIGN
    : verdict === 'inconclusive'
    ? i18n.VERDICT_INCONCLUSIVE
    : i18n.DASHBOARD_VERDICT_UNKNOWN;

/** The same hues as the verdict badge, so a verdict reads alike in the table and here. */
export const verdictColor = (
  verdict: DetonationStatsVerdict,
  colors: Pick<EuiThemeComputed['colors'], 'danger' | 'success' | 'warning' | 'mediumShade'>
): string =>
  verdict === 'malicious'
    ? colors.danger
    : verdict === 'benign'
    ? colors.success
    : verdict === 'inconclusive'
    ? colors.warning
    : colors.mediumShade;

// The app's locale, not the browser's, so counts and dates agree with the translated text around them.
const numberFormat = new Intl.NumberFormat(kbnI18n.getLocale());
const formatCount = (count: number): string => numberFormat.format(count);
const dayFormat = new Intl.DateTimeFormat(kbnI18n.getLocale(), {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

interface PanelState {
  isLoading: boolean;
  /** Set only when there is nothing to show: a failed refresh keeps the last good data on screen. */
  isError: boolean;
  /** The server's message for a server-side failure; a rejected KQL is reported once by the page. */
  errorMessage?: string;
}

interface DashboardPanelProps extends PanelState {
  title: string;
  testId: string;
  isEmpty: boolean;
  children: React.ReactNode;
}

const DashboardPanel = ({
  title,
  testId,
  isLoading,
  isError,
  errorMessage,
  isEmpty,
  children,
}: DashboardPanelProps) => (
  <EuiPanel hasBorder css={{ minWidth: 0, height: '100%' }} data-test-subj={testId}>
    <EuiText size="s">
      <h3>{title}</h3>
    </EuiText>
    <EuiFlexGroup direction="column" gutterSize="s" css={{ paddingTop: 8 }}>
      {isLoading ? (
        <EuiSkeletonRectangle
          width="100%"
          height={CHART_HEIGHT / 2}
          data-test-subj={`${testId}-loading`}
        />
      ) : isError ? (
        <EuiEmptyPrompt
          iconType="warning"
          color="danger"
          titleSize="xs"
          title={<h4>{i18n.DASHBOARD_PANEL_ERROR}</h4>}
          body={errorMessage ? <p>{errorMessage}</p> : undefined}
          data-test-subj={`${testId}-error`}
        />
      ) : isEmpty ? (
        <EuiEmptyPrompt
          titleSize="xs"
          body={<p>{i18n.DASHBOARD_PANEL_EMPTY}</p>}
          data-test-subj={`${testId}-empty`}
        />
      ) : (
        children
      )}
    </EuiFlexGroup>
  </EuiPanel>
);

interface KpiProps extends PanelState {
  title: string;
  testId: string;
  /** Undefined when the range has no data for this figure. */
  value?: string;
  noDataTooltip: string;
  description?: string;
}

const Kpi = ({ title, testId, value, noDataTooltip, description, ...state }: KpiProps) => (
  <EuiPanel hasBorder css={{ minWidth: 0, height: '100%' }} data-test-subj={testId}>
    {state.isLoading ? (
      <EuiSkeletonRectangle width="100%" height={64} data-test-subj={`${testId}-loading`} />
    ) : state.isError ? (
      <EuiEmptyPrompt
        iconType="warning"
        color="danger"
        titleSize="xs"
        title={<h4>{i18n.DASHBOARD_PANEL_ERROR}</h4>}
        body={state.errorMessage ? <p>{state.errorMessage}</p> : undefined}
        data-test-subj={`${testId}-error`}
      />
    ) : (
      <EuiStat
        title={
          value ?? (
            <EuiToolTip content={noDataTooltip}>
              <span
                tabIndex={0}
                aria-label={i18n.DASHBOARD_NO_DATA}
                data-test-subj={`${testId}-noData`}
              >
                {NO_VALUE}
              </span>
            </EuiToolTip>
          )
        }
        titleSize="l"
        description={title}
        data-test-subj={`${testId}-value`}
      >
        {description ? (
          <EuiText size="xs" color="subdued">
            {description}
          </EuiText>
        ) : null}
      </EuiStat>
    )}
  </EuiPanel>
);

const TopTerms = ({
  terms,
  title,
  testId,
  ...state
}: PanelState & { terms: DetonationStatsTerm[]; title: string; testId: string }) => {
  const max = Math.max(1, ...terms.map(({ count }) => count));
  return (
    <DashboardPanel title={title} testId={testId} isEmpty={false} {...state}>
      {terms.length === 0 ? (
        <EuiText size="s" color="subdued" data-test-subj={`${testId}-empty`}>
          {i18n.DASHBOARD_TOP_TERMS_EMPTY}
        </EuiText>
      ) : (
        terms.map(({ key, count }) => (
          <EuiFlexItem key={key} grow={false} data-test-subj={`${testId}-row`}>
            <EuiFlexGroup gutterSize="s" responsive={false} justifyContent="spaceBetween">
              <EuiFlexItem css={{ minWidth: 0 }}>
                <EuiText size="xs" css={{ overflowWrap: 'anywhere' }}>
                  {key}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs">
                  <strong>{formatCount(count)}</strong>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiProgress value={count} max={max} size="xs" color="primary" aria-hidden />
          </EuiFlexItem>
        ))
      )}
    </DashboardPanel>
  );
};

interface TrendDatum {
  x: number;
  y: number;
  verdict: DetonationStatsVerdict;
}

/** One datum per bucket and verdict, so the chart stacks the verdicts of each day. */
export const toTrendData = (stats: DetonationRunStatsResponse): TrendDatum[] =>
  stats.trend.buckets.flatMap(({ key, verdicts }) =>
    VERDICT_ORDER.map((verdict) => ({ x: key, y: verdicts[verdict], verdict }))
  );

export interface DetonationsDashboardProps {
  stats?: DetonationRunStatsResponse;
  isLoading: boolean;
  isError: boolean;
  /** Shown in the failing panels; leave out for a rejected filter, which the page reports once. */
  errorMessage?: string;
}

export const DetonationsDashboard = React.memo<DetonationsDashboardProps>(
  ({ stats, isLoading, isError, errorMessage }) => {
    const { euiTheme } = useEuiTheme();
    const baseTheme = useElasticChartsTheme();
    const state: PanelState = {
      isLoading: isLoading && !stats,
      isError: isError && !stats,
      errorMessage,
    };
    const hasRuns = (stats?.total ?? 0) > 0;
    const trendData = useMemo(() => (stats ? toTrendData(stats) : []), [stats]);
    // Deviation from the epic: the bucket widens with the range, so the title says how wide it is.
    const trendTitle = i18n.DASHBOARD_TREND_TITLE(
      stats ? Math.max(1, Math.round(stats.trend.intervalMs / DAY_MS)) : 1
    );
    const colorOf = (verdict: DetonationStatsVerdict) => verdictColor(verdict, euiTheme.colors);

    return (
      <div data-test-subj={DASHBOARD_TEST_ID}>
        <EuiFlexGrid columns={3} gutterSize="m">
          <EuiFlexItem>
            <Kpi
              {...state}
              title={i18n.DASHBOARD_KPI_DETONATIONS}
              testId={DASHBOARD_KPI_DETONATIONS_TEST_ID}
              value={hasRuns && stats ? formatCount(stats.total) : undefined}
              noDataTooltip={i18n.DASHBOARD_NO_RUNS_TOOLTIP}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <Kpi
              {...state}
              title={i18n.DASHBOARD_KPI_MEAN_TIME}
              testId={DASHBOARD_KPI_MEAN_TIME_TEST_ID}
              value={
                stats?.meanDurationMs != null
                  ? formatDetonationDuration(stats.meanDurationMs)
                  : undefined
              }
              noDataTooltip={i18n.DASHBOARD_NO_DURATION_TOOLTIP}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <Kpi
              {...state}
              title={i18n.DASHBOARD_KPI_ALERTS}
              testId={DASHBOARD_KPI_ALERTS_TEST_ID}
              value={
                hasRuns && stats
                  ? formatCount(stats.alerts.siem + stats.alerts.endpoint)
                  : undefined
              }
              description={
                hasRuns && stats
                  ? i18n.DASHBOARD_KPI_ALERTS_SPLIT({
                      siem: formatCount(stats.alerts.siem),
                      endpoint: formatCount(stats.alerts.endpoint),
                    })
                  : undefined
              }
              noDataTooltip={i18n.DASHBOARD_NO_RUNS_TOOLTIP}
            />
          </EuiFlexItem>
        </EuiFlexGrid>
        <EuiFlexGrid columns={2} gutterSize="m" css={{ marginTop: euiTheme.size.m }}>
          <EuiFlexItem>
            <DashboardPanel
              {...state}
              title={i18n.DASHBOARD_VERDICTS_TITLE}
              testId={DASHBOARD_VERDICTS_TEST_ID}
              isEmpty={!hasRuns}
            >
              {VERDICT_ORDER.map((verdict) => {
                const count = stats?.verdicts[verdict] ?? 0;
                const share =
                  stats && stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <EuiFlexItem
                    key={verdict}
                    grow={false}
                    data-test-subj={`${DASHBOARD_VERDICTS_TEST_ID}-${verdict}`}
                  >
                    <EuiFlexGroup gutterSize="s" responsive={false} justifyContent="spaceBetween">
                      <EuiFlexItem>
                        <EuiHealth color={colorOf(verdict)}>{verdictLabel(verdict)}</EuiHealth>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiText size="s">
                          <FormattedMessage
                            id="xpack.securitySolution.detonatePrototype.dashboard.verdicts.share"
                            defaultMessage="{count} ({share}%)"
                            values={{ count: <strong>{formatCount(count)}</strong>, share }}
                          />
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                );
              })}
            </DashboardPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <DashboardPanel
              {...state}
              title={trendTitle}
              testId={DASHBOARD_TREND_TEST_ID}
              isEmpty={!hasRuns}
            >
              <div css={{ height: CHART_HEIGHT, width: '100%', minWidth: 0 }}>
                <Chart title={trendTitle}>
                  <Settings
                    baseTheme={baseTheme}
                    showLegend
                    legendPosition={Position.Bottom}
                    // NaN leaves an end unbounded; the interval keeps a bar one bucket wide.
                    xDomain={
                      stats
                        ? { min: NaN, max: NaN, minInterval: stats.trend.intervalMs }
                        : undefined
                    }
                  />
                  <Axis
                    id="detonations-trend-x"
                    position={Position.Bottom}
                    title={i18n.DASHBOARD_TREND_X_AXIS}
                    tickFormat={(value) => dayFormat.format(new Date(Number(value)))}
                  />
                  <Axis
                    id="detonations-trend-y"
                    position={Position.Left}
                    title={i18n.DASHBOARD_TREND_Y_AXIS}
                    integersOnly
                  />
                  <BarSeries
                    id="detonations-trend"
                    xScaleType={ScaleType.Time}
                    yScaleType={ScaleType.Linear}
                    xAccessor="x"
                    yAccessors={['y']}
                    splitSeriesAccessors={['verdict']}
                    stackAccessors={['x']}
                    timeZone="UTC"
                    data={trendData}
                    color={({ splitAccessors }) =>
                      colorOf(splitAccessors.get('verdict') as DetonationStatsVerdict)
                    }
                    name={({ splitAccessors }) =>
                      verdictLabel(splitAccessors.get('verdict') as DetonationStatsVerdict)
                    }
                  />
                </Chart>
              </div>
            </DashboardPanel>
          </EuiFlexItem>
        </EuiFlexGrid>
        <EuiFlexGrid columns={2} gutterSize="m" css={{ marginTop: euiTheme.size.m }}>
          <EuiFlexItem>
            <TopTerms
              {...state}
              title={i18n.DASHBOARD_TOP_RULES_TITLE}
              testId={DASHBOARD_TOP_RULES_TEST_ID}
              terms={stats?.topRules ?? []}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <TopTerms
              {...state}
              title={i18n.DASHBOARD_TOP_EVENT_CODES_TITLE}
              testId={DASHBOARD_TOP_EVENT_CODES_TEST_ID}
              terms={stats?.topEventCodes ?? []}
            />
          </EuiFlexItem>
        </EuiFlexGrid>
      </div>
    );
  }
);
DetonationsDashboard.displayName = 'DetonationsDashboard';
