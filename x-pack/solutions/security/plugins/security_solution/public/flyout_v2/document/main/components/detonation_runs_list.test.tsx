/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';

import { useFlyoutApi } from '../../../use_flyout_api';
import { useDetonationCardRuns } from '../../../../detonate_prototype/hooks/use_detonate';
import { VERDICT_BADGE_TEST_ID } from '../../../../detonate_prototype/components/verdict_badge';
import { DETONATE_STATUS_TEST_ID } from '../../../../detonate_prototype/components/detonation_state_badge';
import {
  DETONATION_RUNS_LIST_EMPTY_TEST_ID,
  DETONATION_RUNS_LIST_ERROR_TEST_ID,
  DETONATION_RUNS_LIST_OPEN_TEST_ID,
  DETONATION_RUNS_LIST_TEST_ID,
  DetonationRunsList,
} from './detonation_runs_list';
import type { DetonationRecord } from '../../../../../common/detonate_prototype';

jest.mock('../../../use_flyout_api');
jest.mock('../../../../detonate_prototype/hooks/use_detonate');

const hit = {
  flattened: {},
  raw: { _id: 'alert-1', _index: '.alerts-security.alerts-default' },
} as unknown as DataTableRecord;

const run = (overrides: Partial<DetonationRecord> = {}): DetonationRecord =>
  ({
    '@timestamp': '2026-11-01T10:00:00.000Z',
    'detonate.task_id': 'task-1',
    'detonate.state': 'complete',
    'detonate.verdict': 'malicious',
    'detonate.submitter': 'analyst-1',
    ...overrides,
  } as DetonationRecord);

describe('DetonationRunsList', () => {
  const openDetonationFlyout = jest.fn();

  const setAlertRuns = (alertRuns: Record<string, unknown>) =>
    jest.mocked(useDetonationCardRuns).mockReturnValue({ alertRuns, hashRuns: {} } as never);

  const renderList = () =>
    render(
      <IntlProvider locale="en">
        <DetonationRunsList hit={hit} />
      </IntlProvider>
    );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useFlyoutApi).mockReturnValue({ openDetonationFlyout } as never);
  });

  it('queries by the alert id only, not by hash', () => {
    setAlertRuns({ data: { hits: [] }, isLoading: false, isError: false });
    renderList();
    expect(useDetonationCardRuns).toHaveBeenCalledWith({ alertId: 'alert-1', hash: undefined });
  });

  it('lists each run with submitter, status, verdict and a link that opens it', () => {
    setAlertRuns({
      data: {
        hits: [
          run(),
          run({
            'detonate.task_id': 'task-2',
            'detonate.state': 'running',
            'detonate.verdict': undefined,
            'detonate.submitter': 'analyst-2',
          }),
        ],
      },
      isLoading: false,
      isError: false,
    });
    const { getByTestId, getByText, getAllByTestId } = renderList();

    expect(getByText('analyst-1')).toBeInTheDocument();
    expect(getByText('analyst-2')).toBeInTheDocument();
    expect(getByTestId(`${VERDICT_BADGE_TEST_ID}-malicious`)).toBeInTheDocument();
    expect(getByTestId(`${DETONATE_STATUS_TEST_ID}-running`)).toBeInTheDocument();
    expect(getAllByTestId(DETONATE_STATUS_TEST_ID).length).toBeGreaterThan(0);

    fireEvent.click(getByTestId(`${DETONATION_RUNS_LIST_OPEN_TEST_ID}-task-2`));
    expect(openDetonationFlyout).toHaveBeenCalledWith({ taskId: 'task-2' });
  });

  it('shows an empty state when the alert has no runs', () => {
    setAlertRuns({ data: { hits: [] }, isLoading: false, isError: false });
    const { getByTestId } = renderList();
    expect(getByTestId(DETONATION_RUNS_LIST_EMPTY_TEST_ID)).toBeInTheDocument();
  });

  it('shows an error rather than an empty state when the read fails', () => {
    setAlertRuns({ data: undefined, isLoading: false, isError: true });
    const { getByTestId, queryByTestId } = renderList();
    expect(getByTestId(DETONATION_RUNS_LIST_ERROR_TEST_ID)).toBeInTheDocument();
    expect(queryByTestId(DETONATION_RUNS_LIST_EMPTY_TEST_ID)).not.toBeInTheDocument();
  });

  it('shows neither the empty state nor the error while loading', () => {
    setAlertRuns({ data: undefined, isLoading: true, isError: false });
    const { getByTestId, queryByTestId } = renderList();
    expect(getByTestId(DETONATION_RUNS_LIST_TEST_ID)).toBeInTheDocument();
    expect(queryByTestId(DETONATION_RUNS_LIST_EMPTY_TEST_ID)).not.toBeInTheDocument();
    expect(queryByTestId(DETONATION_RUNS_LIST_ERROR_TEST_ID)).not.toBeInTheDocument();
  });
});
