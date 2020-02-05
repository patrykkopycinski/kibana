/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import {
  Axis,
  Chart,
  getAxisId,
  getSpecId,
  HistogramBarSeries,
  Position,
  Settings,
} from '@elastic/charts';
import React from 'react';
import { EuiProgress } from '@elastic/eui';
import deepEqual from 'fast-deep-equal/es6/react';

import { useTheme } from '../../../../components/charts/common';
import { histogramDateTimeFormatter } from '../../../../components/utils';
import { HistogramData } from './types';

const DEFAULT_CHART_HEIGHT = 174;

interface HistogramSignalsProps {
  chartHeight?: number;
  from: number;
  legendPosition?: Position;
  loading: boolean;
  to: number;
  data: HistogramData[];
  updateDateRange: (min: number, max: number) => void;
}

const MemoChart = React.memo(Chart, deepEqual);
MemoChart.displayName = 'MemoChart';
const MemoSettings = React.memo(Settings, deepEqual);
MemoSettings.displayName = 'MemoSettings';
const MemoHistogramBarSeries = React.memo(HistogramBarSeries, deepEqual);
MemoHistogramBarSeries.displayName = 'MemoBarSeries';
const MemoAxis = React.memo(Axis, deepEqual);
MemoAxis.displayName = 'MemoAxis';

const SignalsHistogramComponent: React.FC<HistogramSignalsProps> = ({
  chartHeight = DEFAULT_CHART_HEIGHT,
  data,
  from,
  legendPosition = 'right',
  loading,
  to,
  updateDateRange,
}) => {
  const theme = useTheme();
  const tickFormat = histogramDateTimeFormatter([from, to]);
  const chartSize: Array<string | number> = ['100%', chartHeight];
  const xAxisId = getAxisId('signalsHistogramAxisX');
  const yAxisId = getAxisId('signalsHistogramAxisY');
  const specId = getSpecId('signalsHistogram');

  return (
    <>
      {loading && (
        <EuiProgress
          data-test-subj="loadingPanelSignalsHistogram"
          size="xs"
          position="absolute"
          color="accent"
        />
      )}

      <MemoChart size={chartSize}>
        <MemoSettings
          legendPosition={legendPosition}
          onBrushEnd={updateDateRange}
          showLegend
          theme={theme}
        />

        <MemoAxis id={xAxisId} position="bottom" tickFormat={tickFormat} />

        <MemoAxis id={yAxisId} position="left" />

        <MemoHistogramBarSeries
          id={specId}
          xScaleType="time"
          yScaleType="linear"
          xAccessor="x"
          yAccessors={['y']}
          splitSeriesAccessors={['g']}
          data={data}
        />
      </MemoChart>
    </>
  );
};

export const SignalsHistogram = React.memo(SignalsHistogramComponent, deepEqual);
