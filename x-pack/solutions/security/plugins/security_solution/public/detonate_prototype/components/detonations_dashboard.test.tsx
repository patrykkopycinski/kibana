/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Dashboard tests: a figure with no data reads "—" with a tooltip saying why, the verdict
 * breakdown counts and shares, the trend feeds the chart one datum per day and verdict, and each
 * panel shows its own loading, empty and error state.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { EuiProvider } from '@elastic/eui';

import type { DetonationRunStatsResponse } from '../../../common/detonate_prototype';
import {
  DASHBOARD_KPI_ALERTS_TEST_ID,
  DASHBOARD_KPI_DETONATIONS_TEST_ID,
  DASHBOARD_KPI_MEAN_TIME_TEST_ID,
  DASHBOARD_TOP_EVENT_CODES_TEST_ID,
  DASHBOARD_TOP_RULES_TEST_ID,
  DASHBOARD_TREND_TEST_ID,
  DASHBOARD_VERDICTS_TEST_ID,
  DetonationsDashboard,
  toTrendData,
  verdictColor,
} from './detonations_dashboard';

interface BarSeriesProps {
  data: Array<{ x: number; y: number; verdict: string }>;
  splitSeriesAccessors: string[];
  stackAccessors: string[];
  color: (identifier: { splitAccessors: Map<string, string> }) => string;
}
const mockBarSeries = jest.fn<void, [BarSeriesProps]>();

jest.mock('@elastic/charts', () => ({
  Chart: ({ children }: { children: React.ReactNode }) => (
    <div data-test-subj="chart">{children}</div>
  ),
  Settings: () => null,
  Axis: () => null,
  BarSeries: (props: BarSeriesProps) => {
    mockBarSeries(props);
    return null;
  },
  Position: { Bottom: 'bottom', Left: 'left' },
  ScaleType: { Time: 'time', Linear: 'linear' },
}));
jest.mock('@kbn/charts-theme', () => ({ useElasticChartsTheme: () => ({}) }));

const DAY = 86_400_000;
const verdicts = (v: Partial<DetonationRunStatsResponse['verdicts']> = {}) => ({
  malicious: 0,
  inconclusive: 0,
  benign: 0,
  unknown: 0,
  ...v,
});

const makeStats = (
  overrides: Partial<DetonationRunStatsResponse> = {}
): DetonationRunStatsResponse => ({
  total: 10,
  verdicts: verdicts({ malicious: 5, benign: 3, inconclusive: 1, unknown: 1 }),
  meanDurationMs: 125_000,
  alerts: { siem: 7, endpoint: 4 },
  trend: {
    intervalMs: DAY,
    buckets: [
      { key: 0, total: 4, verdicts: verdicts({ malicious: 3, benign: 1 }) },
      { key: DAY, total: 6, verdicts: verdicts({ malicious: 2, benign: 2, unknown: 2 }) },
    ],
  },
  topRules: [
    { key: 'Rule A', count: 6 },
    { key: 'Rule B', count: 2 },
  ],
  topEventCodes: [{ key: 'malicious_file', count: 3 }],
  ...overrides,
});

const renderDashboard = (props: Partial<React.ComponentProps<typeof DetonationsDashboard>> = {}) =>
  render(
    <EuiProvider>
      <I18nProvider>
        <DetonationsDashboard stats={makeStats()} isLoading={false} isError={false} {...props} />
      </I18nProvider>
    </EuiProvider>
  );

describe('DetonationsDashboard', () => {
  beforeEach(() => {
    mockBarSeries.mockClear();
  });

  describe('KPIs', () => {
    it('shows the count, the mean time and the alerts with their SIEM / endpoint split', () => {
      renderDashboard();

      expect(screen.getByTestId(`${DASHBOARD_KPI_DETONATIONS_TEST_ID}-value`)).toHaveTextContent(
        '10'
      );
      expect(screen.getByTestId(`${DASHBOARD_KPI_MEAN_TIME_TEST_ID}-value`)).toHaveTextContent(
        '2m 05s'
      );
      const alerts = screen.getByTestId(`${DASHBOARD_KPI_ALERTS_TEST_ID}-value`);
      expect(alerts).toHaveTextContent('11');
      expect(alerts).toHaveTextContent('7 SIEM · 4 endpoint');
      expect(
        screen.queryByTestId(`${DASHBOARD_KPI_MEAN_TIME_TEST_ID}-noData`)
      ).not.toBeInTheDocument();
    });

    it('shows "—" with a tooltip for a mean time when no run has a duration', async () => {
      renderDashboard({ stats: makeStats({ meanDurationMs: null }) });

      const noData = screen.getByTestId(`${DASHBOARD_KPI_MEAN_TIME_TEST_ID}-noData`);
      expect(noData).toHaveTextContent('—');
      fireEvent.mouseOver(noData);
      expect(await screen.findByText(/has finished with a recorded duration/)).toBeInTheDocument();
      // The other figures still have data.
      expect(
        screen.queryByTestId(`${DASHBOARD_KPI_DETONATIONS_TEST_ID}-noData`)
      ).not.toBeInTheDocument();
    });

    it('shows "—" with a tooltip on the count and the alerts when the range has no runs', async () => {
      renderDashboard({
        stats: makeStats({
          total: 0,
          verdicts: verdicts(),
          meanDurationMs: null,
          alerts: { siem: 0, endpoint: 0 },
        }),
      });

      for (const id of [
        DASHBOARD_KPI_DETONATIONS_TEST_ID,
        DASHBOARD_KPI_MEAN_TIME_TEST_ID,
        DASHBOARD_KPI_ALERTS_TEST_ID,
      ]) {
        expect(screen.getByTestId(`${id}-noData`)).toHaveTextContent('—');
      }
      fireEvent.mouseOver(screen.getByTestId(`${DASHBOARD_KPI_DETONATIONS_TEST_ID}-noData`));
      expect(
        await screen.findByText('No detonations match the time range and filters')
      ).toBeInTheDocument();
    });
  });

  describe('verdict breakdown', () => {
    it('lists each verdict with its count and share of the runs', () => {
      renderDashboard();

      const row = (verdict: string) =>
        screen.getByTestId(`${DASHBOARD_VERDICTS_TEST_ID}-${verdict}`);
      expect(row('malicious')).toHaveTextContent('5 (50%)');
      expect(row('benign')).toHaveTextContent('3 (30%)');
      expect(row('inconclusive')).toHaveTextContent('1 (10%)');
      expect(row('unknown')).toHaveTextContent('1 (10%)');
    });

    it('colours verdicts as the badge does', () => {
      const colors = { danger: 'd', success: 's', warning: 'w', mediumShade: 'm' };

      expect(verdictColor('malicious', colors)).toBe('d');
      expect(verdictColor('benign', colors)).toBe('s');
      expect(verdictColor('inconclusive', colors)).toBe('w');
      expect(verdictColor('unknown', colors)).toBe('m');
    });
  });

  describe('trend chart', () => {
    it('makes one datum per bucket and verdict', () => {
      const data = toTrendData(makeStats());

      expect(data).toHaveLength(8);
      expect(data.filter(({ x }) => x === DAY)).toEqual([
        { x: DAY, y: 2, verdict: 'malicious' },
        { x: DAY, y: 0, verdict: 'inconclusive' },
        { x: DAY, y: 2, verdict: 'benign' },
        { x: DAY, y: 2, verdict: 'unknown' },
      ]);
    });

    it('stacks the verdicts of a day, splits the series by verdict and colours them', () => {
      renderDashboard();

      const props = mockBarSeries.mock.calls[mockBarSeries.mock.calls.length - 1][0];
      expect(props.data).toEqual(toTrendData(makeStats()));
      expect(props.splitSeriesAccessors).toEqual(['verdict']);
      expect(props.stackAccessors).toEqual(['x']);
      expect(props.color({ splitAccessors: new Map([['verdict', 'malicious']]) })).not.toBe(
        props.color({ splitAccessors: new Map([['verdict', 'benign']]) })
      );
    });
  });

  describe('top terms', () => {
    it('lists the detection rules and the endpoint event codes with their counts', () => {
      renderDashboard();

      const rules = within(screen.getByTestId(DASHBOARD_TOP_RULES_TEST_ID)).getAllByTestId(
        `${DASHBOARD_TOP_RULES_TEST_ID}-row`
      );
      expect(rules.map((rule) => rule.querySelector('strong')?.textContent)).toEqual(['6', '2']);
      expect(rules[0]).toHaveTextContent('Rule A');
      expect(rules[1]).toHaveTextContent('Rule B');
      expect(screen.getByTestId(DASHBOARD_TOP_EVENT_CODES_TEST_ID)).toHaveTextContent(
        'malicious_file'
      );
    });

    it('says so when there are no terms', () => {
      renderDashboard({ stats: makeStats({ topRules: [] }) });

      expect(screen.getByTestId(`${DASHBOARD_TOP_RULES_TEST_ID}-empty`)).toBeInTheDocument();
      expect(
        screen.queryByTestId(`${DASHBOARD_TOP_EVENT_CODES_TEST_ID}-empty`)
      ).not.toBeInTheDocument();
    });
  });

  describe('panel states', () => {
    const panels = [
      DASHBOARD_VERDICTS_TEST_ID,
      DASHBOARD_TREND_TEST_ID,
      DASHBOARD_TOP_RULES_TEST_ID,
      DASHBOARD_TOP_EVENT_CODES_TEST_ID,
    ];

    it('shows a skeleton in every panel while the first load is in flight', () => {
      renderDashboard({ stats: undefined, isLoading: true });

      for (const id of [
        ...panels,
        DASHBOARD_KPI_DETONATIONS_TEST_ID,
        DASHBOARD_KPI_MEAN_TIME_TEST_ID,
        DASHBOARD_KPI_ALERTS_TEST_ID,
      ]) {
        expect(screen.getByTestId(`${id}-loading`)).toBeInTheDocument();
      }
      expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
    });

    it('keeps the last data on screen while a refresh loads', () => {
      renderDashboard({ isLoading: true });

      expect(screen.queryByTestId(`${DASHBOARD_VERDICTS_TEST_ID}-loading`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`${DASHBOARD_KPI_DETONATIONS_TEST_ID}-value`)).toHaveTextContent(
        '10'
      );
    });

    it('shows the server message in each panel when the stats cannot be loaded', () => {
      renderDashboard({ stats: undefined, isError: true, errorMessage: 'stats search exploded' });

      for (const id of panels) {
        expect(screen.getByTestId(`${id}-error`)).toHaveTextContent('stats search exploded');
      }
      expect(screen.getByTestId(`${DASHBOARD_KPI_ALERTS_TEST_ID}-error`)).toHaveTextContent(
        'stats search exploded'
      );
    });

    it('shows the error without a message when none is given, as for a rejected KQL', () => {
      renderDashboard({ stats: undefined, isError: true });

      const error = screen.getByTestId(`${DASHBOARD_VERDICTS_TEST_ID}-error`);
      expect(error).toHaveTextContent('Could not load this panel');
      expect(error).not.toHaveTextContent('exploded');
    });

    it('keeps the last data when a later refresh fails', () => {
      renderDashboard({ isError: true, errorMessage: 'poll failed' });

      expect(screen.queryByTestId(`${DASHBOARD_VERDICTS_TEST_ID}-error`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`${DASHBOARD_VERDICTS_TEST_ID}-malicious`)).toBeInTheDocument();
    });

    it('shows an empty state in the chart panels when the range has no runs', () => {
      renderDashboard({
        stats: makeStats({ total: 0, verdicts: verdicts(), topRules: [], topEventCodes: [] }),
      });

      expect(screen.getByTestId(`${DASHBOARD_VERDICTS_TEST_ID}-empty`)).toBeInTheDocument();
      expect(screen.getByTestId(`${DASHBOARD_TREND_TEST_ID}-empty`)).toBeInTheDocument();
      expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
    });
  });
});
