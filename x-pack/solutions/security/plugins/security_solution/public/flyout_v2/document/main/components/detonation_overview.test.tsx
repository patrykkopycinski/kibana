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

import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { useFlyoutApi } from '../../../use_flyout_api';
import { useCanSubmitDetonation } from '../../../../detonate_prototype/hooks/use_can_submit_detonation';
import {
  useDetonateUsage,
  useDetonationCardRuns,
} from '../../../../detonate_prototype/hooks/use_detonate';
import { VERDICT_BADGE_TEST_ID } from '../../../../detonate_prototype/components/verdict_badge';
import {
  DETONATION_OVERVIEW_ALLOWANCE_TEST_ID,
  DETONATION_OVERVIEW_CONTENT_TEST_ID,
  DETONATION_OVERVIEW_COUNTS_TEST_ID,
  DETONATION_OVERVIEW_ALERT_RUNS_UNAVAILABLE_TEST_ID,
  DETONATION_OVERVIEW_DETONATE_TEST_ID,
  DETONATION_OVERVIEW_EVIDENCE_TEST_ID,
  DETONATION_OVERVIEW_FAILED_TEST_ID,
  DETONATION_OVERVIEW_OPEN_RESULT_TEST_ID,
  DETONATION_OVERVIEW_PRIOR_RUN_TEST_ID,
  DETONATION_OVERVIEW_RERUN_TEST_ID,
  DETONATION_OVERVIEW_UNSUPPORTED_OS_TEST_ID,
  DetonationOverview,
} from './detonation_overview';
import { DETONATION_OVERVIEW_TEST_ID } from './test_ids';
import type { DetonationRecord } from '../../../../../common/detonate_prototype';

jest.mock('../../../../common/hooks/use_experimental_features');
jest.mock('../../../use_flyout_api');
jest.mock('../../../../detonate_prototype/hooks/use_can_submit_detonation');
jest.mock('../../../../detonate_prototype/hooks/use_detonate');
jest.mock('../../../../detonate_prototype/components/submit_modal', () => ({
  SubmitModal: ({
    initialHash,
    initialTags,
    initialOrigin,
    source,
    onSubmitted,
  }: {
    initialHash: string;
    initialTags: string[];
    initialOrigin: Record<string, unknown>;
    source: string;
    onSubmitted: (task: { id: string }) => void;
  }) => (
    <button
      type="button"
      data-test-subj="submitModalMock"
      data-props={JSON.stringify({ initialHash, initialTags, initialOrigin, source })}
      onClick={() => onSubmitted({ id: 'new-task' })}
    >
      {'submit'}
    </button>
  ),
}));

const HASH = 'a'.repeat(64);

const alertHit = (flattened: Record<string, unknown> = {}): DataTableRecord =>
  ({
    flattened: { 'file.hash.sha256': HASH, ...flattened },
    raw: { _id: 'alert-1', _index: '.alerts-security.alerts-default' },
  } as unknown as DataTableRecord);

const run = (overrides: Partial<DetonationRecord> = {}): DetonationRecord =>
  ({
    '@timestamp': '2026-11-01T10:00:00.000Z',
    'detonate.task_id': 'task-1',
    'detonate.state': 'complete',
    'detonate.verdict': 'malicious',
    'detonate.confidence': 'high',
    'detonate.step.number': 4,
    'detonate.step.of': 5,
    'detonate.step.label': 'Reading alerts',
    'detonate.step.worker': 'reader',
    'detonate.alerts.production_endpoint': 3,
    'detonate.alerts.production_detection': 2,
    'detonate.endpoint_event_codes': ['a', 'b'],
    'detonate.iocs.domains': ['evil.example'],
    'detonate.iocs.ips': ['10.0.0.1', '10.0.0.2'],
    ...overrides,
  } as DetonationRecord);

const query = (hits: DetonationRecord[] | undefined, state: Record<string, boolean> = {}) => ({
  data: hits ? { hits } : undefined,
  isLoading: false,
  isError: false,
  ...state,
});

describe('DetonationOverview', () => {
  const openDetonationFlyout = jest.fn();

  const setRuns = (
    alertHits: DetonationRecord[] | undefined,
    hashHits: DetonationRecord[] | undefined = []
  ) =>
    jest.mocked(useDetonationCardRuns).mockReturnValue({
      alertRuns: query(alertHits),
      hashRuns: query(hashHits),
    } as never);

  const setUsage = (usage: { used: number; allowance: number } | undefined) =>
    jest.mocked(useDetonateUsage).mockReturnValue({
      data: usage && { ...usage, resetsAt: '2026-12-01T00:00:00.000Z' },
    } as never);

  const renderCard = (hit = alertHit()) =>
    render(
      <IntlProvider locale="en">
        <DetonationOverview hit={hit} />
      </IntlProvider>
    );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useIsExperimentalFeatureEnabled).mockReturnValue(true);
    jest.mocked(useFlyoutApi).mockReturnValue({ openDetonationFlyout } as never);
    jest.mocked(useCanSubmitDetonation).mockReturnValue(true);
    setRuns([]);
    setUsage({ used: 1, allowance: 500 });
  });

  it('renders nothing when the feature flag is off', () => {
    jest.mocked(useIsExperimentalFeatureEnabled).mockReturnValue(false);
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the alert carries no hash', () => {
    const { container } = renderCard({
      flattened: {},
      raw: { _id: 'alert-1' },
    } as unknown as DataTableRecord);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers to detonate a file that has not been analyzed', () => {
    const { getByTestId, queryByTestId } = renderCard();
    expect(getByTestId(DETONATION_OVERVIEW_DETONATE_TEST_ID)).toBeInTheDocument();
    expect(queryByTestId(DETONATION_OVERVIEW_OPEN_RESULT_TEST_ID)).not.toBeInTheDocument();
  });

  it('shows verdict, confidence and counts for a completed run', () => {
    setRuns([run()]);
    const { getByTestId, queryByTestId } = renderCard();

    expect(getByTestId(`${VERDICT_BADGE_TEST_ID}-malicious`)).toBeInTheDocument();
    expect(getByTestId(DETONATION_OVERVIEW_CONTENT_TEST_ID)).toHaveTextContent('High confidence');
    const counts = getByTestId(DETONATION_OVERVIEW_COUNTS_TEST_ID);
    expect(counts).toHaveTextContent('Behaviors: 2');
    expect(counts).toHaveTextContent('Indicators: 3');
    expect(queryByTestId(DETONATION_OVERVIEW_DETONATE_TEST_ID)).not.toBeInTheDocument();
    expect(queryByTestId(DETONATION_OVERVIEW_RERUN_TEST_ID)).not.toBeInTheDocument();
  });

  it('makes no usage decision for a card that already has a run', () => {
    setUsage({ used: 500, allowance: 500 });
    setRuns([run()]);
    const { queryByTestId } = renderCard();
    expect(queryByTestId(DETONATION_OVERVIEW_ALLOWANCE_TEST_ID)).not.toBeInTheDocument();
    expect(useDetonateUsage).not.toHaveBeenCalled();
  });

  it('shows the step and no counts for a running run', () => {
    setRuns([run({ 'detonate.state': 'running', 'detonate.verdict': undefined })]);
    const { getByTestId, queryByTestId } = renderCard();
    expect(getByTestId('detonatePrototypeStatus-running')).toBeInTheDocument();
    expect(getByTestId('detonatePrototypeStep')).toHaveTextContent('4/5 Reading alerts');
    expect(queryByTestId(DETONATION_OVERVIEW_COUNTS_TEST_ID)).not.toBeInTheDocument();
  });

  it('shows the failure details with a Re-run for a failed run', () => {
    setRuns([run({ 'detonate.state': 'failed', 'detonate.step.details': 'VM boot timed out' })]);
    const { getByTestId } = renderCard();
    expect(getByTestId(DETONATION_OVERVIEW_FAILED_TEST_ID)).toHaveTextContent('VM boot timed out');
    expect(getByTestId(DETONATION_OVERVIEW_RERUN_TEST_ID)).toBeInTheDocument();
  });

  it('hides Re-run from a user who cannot submit', () => {
    jest.mocked(useCanSubmitDetonation).mockReturnValue(false);
    setRuns([run({ 'detonate.state': 'failed' })]);
    const { queryByTestId } = renderCard();
    expect(queryByTestId(DETONATION_OVERVIEW_RERUN_TEST_ID)).not.toBeInTheDocument();
  });

  it('labels a run from another alert and still opens it', () => {
    setRuns([], [run({ 'detonate.task_id': 'task-elsewhere' })]);
    const { getByTestId } = renderCard();
    expect(getByTestId(DETONATION_OVERVIEW_PRIOR_RUN_TEST_ID)).toBeInTheDocument();

    fireEvent.click(getByTestId(DETONATION_OVERVIEW_OPEN_RESULT_TEST_ID));
    expect(openDetonationFlyout).toHaveBeenCalledWith({ taskId: 'task-elsewhere' });
  });

  it("prefers this alert's own run over a run from elsewhere", () => {
    setRuns([run()], [run({ 'detonate.task_id': 'task-elsewhere' })]);
    const { queryByTestId } = renderCard();
    expect(queryByTestId(DETONATION_OVERVIEW_PRIOR_RUN_TEST_ID)).not.toBeInTheDocument();
  });

  it('replaces the Detonate button with the allowance message once the allowance is spent', () => {
    setUsage({ used: 500, allowance: 500 });
    const { getByTestId, queryByTestId } = renderCard();
    expect(getByTestId(DETONATION_OVERVIEW_ALLOWANCE_TEST_ID)).toHaveTextContent('Dec 1, 2026');
    expect(queryByTestId(DETONATION_OVERVIEW_DETONATE_TEST_ID)).not.toBeInTheDocument();
  });

  it('lists the supported operating systems for an unsupported host OS', () => {
    const { getByTestId, queryByTestId } = renderCard(alertHit({ 'host.os.type': 'freebsd' }));
    expect(getByTestId(DETONATION_OVERVIEW_UNSUPPORTED_OS_TEST_ID)).toHaveTextContent(
      'Supported operating systems: Linux, Windows, macOS.'
    );
    expect(queryByTestId(DETONATION_OVERVIEW_DETONATE_TEST_ID)).not.toBeInTheDocument();
  });

  it('shows an existing run even when the host OS is unsupported', () => {
    setRuns([run()]);
    const { getByTestId, queryByTestId } = renderCard(alertHit({ 'host.os.type': 'freebsd' }));
    expect(getByTestId(DETONATION_OVERVIEW_OPEN_RESULT_TEST_ID)).toBeInTheDocument();
    expect(queryByTestId(DETONATION_OVERVIEW_UNSUPPORTED_OS_TEST_ID)).not.toBeInTheDocument();
  });

  it('shows no Detonate button to a user who cannot submit', () => {
    jest.mocked(useCanSubmitDetonation).mockReturnValue(false);
    const { queryByTestId } = renderCard();
    expect(queryByTestId(DETONATION_OVERVIEW_DETONATE_TEST_ID)).not.toBeInTheDocument();
  });

  it('shows a loading skeleton while the alert runs load', () => {
    jest.mocked(useDetonationCardRuns).mockReturnValue({
      alertRuns: query(undefined, { isLoading: true }),
      hashRuns: query(undefined),
    } as never);
    const { getByTestId, queryByTestId } = renderCard();
    expect(getByTestId(`${DETONATION_OVERVIEW_TEST_ID}Loading`)).toBeInTheDocument();
    expect(queryByTestId(DETONATION_OVERVIEW_CONTENT_TEST_ID)).not.toBeInTheDocument();
  });

  it('opens the submit modal prefilled from the alert and opens the new run as a new session', () => {
    const { getByTestId } = renderCard(
      alertHit({
        'host.name': 'host-1',
        'user.name': 'alice',
        'file.path': '/tmp/x',
      })
    );

    fireEvent.click(getByTestId(DETONATION_OVERVIEW_DETONATE_TEST_ID));
    const modal = getByTestId('submitModalMock');
    expect(JSON.parse(modal.getAttribute('data-props') ?? '{}')).toEqual({
      initialHash: HASH,
      initialTags: ['alert:alert-1'],
      initialOrigin: {
        alert_ids: ['alert-1'],
        host_name: 'host-1',
        user_name: 'alice',
        file_path: '/tmp/x',
      },
      source: 'alert_flyout',
    });

    fireEvent.click(modal);
    expect(openDetonationFlyout).toHaveBeenCalledWith({ taskId: 'new-task' });
  });

  it('opens the run as a new session from the card title', () => {
    setRuns([run()]);
    const { getByTestId } = renderCard();

    fireEvent.click(getByTestId(`${DETONATION_OVERVIEW_TEST_ID}TitleLink`));
    expect(openDetonationFlyout).toHaveBeenCalledWith({ taskId: 'task-1' });
  });

  it('has no title link when there is no run to open', () => {
    const { queryByTestId } = renderCard();
    expect(queryByTestId(`${DETONATION_OVERVIEW_TEST_ID}TitleLink`)).not.toBeInTheDocument();
  });

  it('shows the one-line summary of a completed run as escaped text', () => {
    setRuns([run({ 'detonate.evidence': 'Dropped <b>payload</b> and beaconed' })]);
    const { getByTestId } = renderCard();

    const evidence = getByTestId(DETONATION_OVERVIEW_EVIDENCE_TEST_ID);
    expect(evidence).toHaveTextContent('Dropped <b>payload</b> and beaconed');
    expect(evidence.querySelector('b')).toBeNull();
  });

  it('shows no summary line for a run that has no evidence', () => {
    setRuns([run()]);
    const { queryByTestId } = renderCard();
    expect(queryByTestId(DETONATION_OVERVIEW_EVIDENCE_TEST_ID)).not.toBeInTheDocument();
  });

  it('keeps loading, not offering Detonate, while the hash read is still in flight', () => {
    jest.mocked(useDetonationCardRuns).mockReturnValue({
      alertRuns: query([]),
      hashRuns: query(undefined, { isFetching: true }),
    } as never);
    const { getByTestId, queryByTestId } = renderCard();
    expect(getByTestId(`${DETONATION_OVERVIEW_TEST_ID}Loading`)).toBeInTheDocument();
    expect(queryByTestId(DETONATION_OVERVIEW_DETONATE_TEST_ID)).not.toBeInTheDocument();
  });

  it('shows a run from one query even when the other query failed', () => {
    jest.mocked(useDetonationCardRuns).mockReturnValue({
      alertRuns: query(undefined, { isError: true }),
      hashRuns: query([run({ 'detonate.task_id': 'task-elsewhere' })]),
    } as never);
    const { getByTestId } = renderCard();
    expect(getByTestId(DETONATION_OVERVIEW_PRIOR_RUN_TEST_ID)).toBeInTheDocument();
  });

  it('notes that the alert runs are unavailable only when that query failed', () => {
    const prior = run({ 'detonate.task_id': 'task-elsewhere' });
    jest.mocked(useDetonationCardRuns).mockReturnValue({
      alertRuns: query(undefined, { isError: true }),
      hashRuns: query([prior]),
    } as never);
    const failed = renderCard();
    expect(
      failed.getByTestId(DETONATION_OVERVIEW_ALERT_RUNS_UNAVAILABLE_TEST_ID)
    ).toHaveTextContent("Couldn't load this alert's own detonations.");
    failed.unmount();

    jest.mocked(useDetonationCardRuns).mockReturnValue({
      alertRuns: query([]),
      hashRuns: query([prior]),
    } as never);
    const ok = renderCard();
    expect(ok.getByTestId(DETONATION_OVERVIEW_PRIOR_RUN_TEST_ID)).toBeInTheDocument();
    expect(
      ok.queryByTestId(DETONATION_OVERVIEW_ALERT_RUNS_UNAVAILABLE_TEST_ID)
    ).not.toBeInTheDocument();
  });

  it('shows the error only when neither query produced a run', () => {
    jest.mocked(useDetonationCardRuns).mockReturnValue({
      alertRuns: query(undefined, { isError: true }),
      hashRuns: query([]),
    } as never);
    const { getByTestId, queryByTestId } = renderCard();
    expect(getByTestId(`${DETONATION_OVERVIEW_TEST_ID}Panel`)).toBeInTheDocument();
    expect(queryByTestId(DETONATION_OVERVIEW_CONTENT_TEST_ID)).not.toBeInTheDocument();
    expect(queryByTestId(DETONATION_OVERVIEW_DETONATE_TEST_ID)).not.toBeInTheDocument();
  });

  it('keeps Detonate available when only the secondary hash lookup failed', () => {
    jest.mocked(useDetonationCardRuns).mockReturnValue({
      alertRuns: query([]),
      hashRuns: query(undefined, { isError: true }),
    } as never);
    const { getByTestId, queryByTestId } = renderCard();
    expect(getByTestId(DETONATION_OVERVIEW_DETONATE_TEST_ID)).toBeInTheDocument();
    expect(queryByTestId(DETONATION_OVERVIEW_PRIOR_RUN_TEST_ID)).not.toBeInTheDocument();
  });

  it('clamps long failure details to two lines', () => {
    setRuns([run({ 'detonate.state': 'failed', 'detonate.step.details': 'x'.repeat(500) })]);
    const { getByTestId } = renderCard();
    expect(getByTestId(DETONATION_OVERVIEW_FAILED_TEST_ID)).toHaveStyleRule(
      '-webkit-line-clamp',
      '2'
    );
  });

  it('offers Re-run as a text link', () => {
    setRuns([run({ 'detonate.state': 'failed' })]);
    const { getByTestId } = renderCard();
    expect(getByTestId(DETONATION_OVERVIEW_RERUN_TEST_ID).className).toMatch(/euiButtonEmpty/);
  });
});
