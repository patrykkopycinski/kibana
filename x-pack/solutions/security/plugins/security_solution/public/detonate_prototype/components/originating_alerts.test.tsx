/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { useQueryAlerts } from '../../detections/containers/detection_engine/alerts/use_query';
import { useSignalIndexName } from '../../data_view_manager/hooks/use_signal_index_name';
import { useFlyoutApi } from '../../flyout_v2/use_flyout_api';
import { createFlyoutApiMock } from '../../flyout_v2/use_flyout_api.mock';
import { ORIGINATING_ALERTS_MAX, OriginatingAlerts } from './originating_alerts';

jest.mock('../../detections/containers/detection_engine/alerts/use_query');
jest.mock('../../data_view_manager/hooks/use_signal_index_name');
jest.mock('../../flyout_v2/use_flyout_api');

const INDEX = '.alerts-security.alerts-team-a';
const CONCRETE_INDEX = '.internal.alerts-security.alerts-team-a-000001';

const hit = (id: string, source: Record<string, unknown> = {}) => ({
  _id: id,
  _index: CONCRETE_INDEX,
  _source: { 'kibana.alert.rule.name': `Rule ${id}`, ...source },
});

const mockAlerts = (hits: Array<ReturnType<typeof hit>> | null) =>
  jest.mocked(useQueryAlerts).mockReturnValue({
    loading: false,
    data: hits && { hits: { hits, total: { value: hits.length, relation: 'eq' } } },
    refetch: jest.fn(),
  } as never);

const idsOf = (count: number) => Array.from({ length: count }, (_, i) => `alert-${i}`);
const lastQuery = () => {
  const { calls } = jest.mocked(useQueryAlerts).mock;
  return calls[calls.length - 1][0];
};

describe('OriginatingAlerts', () => {
  const flyoutApi = createFlyoutApiMock();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useFlyoutApi).mockReturnValue(flyoutApi);
    jest.mocked(useSignalIndexName).mockReturnValue(INDEX);
    mockAlerts([]);
  });

  it('asks the current user for the alerts by id, uncounted and capped', () => {
    mockAlerts([hit('alert-0')]);
    render(<OriginatingAlerts ids={['alert-0']} />);

    expect(lastQuery()).toMatchObject({
      indexName: INDEX,
      skip: false,
      query: {
        query: { ids: { values: ['alert-0'] } },
        size: 1,
        track_total_hits: false,
      },
    });
  });

  it('lists a found alert and opens the alert flyout from its concrete index', () => {
    mockAlerts([hit('alert-0', { 'kibana.alert.severity': 'high', 'host.name': 'host-1' })]);
    render(<OriginatingAlerts ids={['alert-0']} />);

    const row = screen.getByTestId('detonatePrototypeOriginatingAlerts-alert');
    expect(row).toHaveTextContent('Rule alert-0');
    expect(row).toHaveTextContent('high');
    expect(row).toHaveTextContent('host-1');

    fireEvent.click(within(row).getByTestId('detonatePrototypeOriginatingAlerts-open'));

    expect(flyoutApi.openDocumentFlyoutFromIndex).toHaveBeenCalledWith({
      documentId: 'alert-0',
      indexName: CONCRETE_INDEX,
      title: 'Rule alert-0',
    });
  });

  it('says an id that was not returned is not available', () => {
    mockAlerts([hit('alert-0')]);
    render(<OriginatingAlerts ids={['alert-0', 'alert-gone']} />);

    expect(screen.getAllByTestId('detonatePrototypeOriginatingAlerts-alert')).toHaveLength(1);
    expect(screen.getByTestId('detonatePrototypeOriginatingAlerts-missing')).toHaveTextContent(
      'Originating alert not available'
    );
  });

  it('says every alert is not available when the read is refused', () => {
    mockAlerts(null);
    render(<OriginatingAlerts ids={['alert-0', 'alert-1']} />);

    expect(screen.getAllByTestId('detonatePrototypeOriginatingAlerts-missing')).toHaveLength(2);
    expect(screen.queryByTestId('detonatePrototypeOriginatingAlerts-open')).not.toBeInTheDocument();
  });

  it(`reads ${ORIGINATING_ALERTS_MAX} alerts and counts the rest`, () => {
    const ids = idsOf(ORIGINATING_ALERTS_MAX + 3);
    mockAlerts(ids.slice(0, ORIGINATING_ALERTS_MAX).map((id) => hit(id)));
    render(<OriginatingAlerts ids={ids} />);

    expect(lastQuery().query).toMatchObject({
      query: { ids: { values: ids.slice(0, ORIGINATING_ALERTS_MAX) } },
      size: ORIGINATING_ALERTS_MAX,
    });
    expect(screen.getAllByTestId('detonatePrototypeOriginatingAlerts-alert')).toHaveLength(
      ORIGINATING_ALERTS_MAX
    );
    expect(screen.getByTestId('detonatePrototypeOriginatingAlerts-more')).toHaveTextContent(
      '+3 more'
    );
  });

  it('shows no "more" line at the cap', () => {
    const ids = idsOf(ORIGINATING_ALERTS_MAX);
    mockAlerts(ids.map((id) => hit(id)));
    render(<OriginatingAlerts ids={ids} />);

    expect(screen.queryByTestId('detonatePrototypeOriginatingAlerts-more')).not.toBeInTheDocument();
  });

  it('does not read before the signal index is known', () => {
    jest.mocked(useSignalIndexName).mockReturnValue('');
    render(<OriginatingAlerts ids={['alert-0']} />);

    expect(lastQuery().skip).toBe(true);
  });
});
