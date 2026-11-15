/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * List page tests: the "Submit sample" button owns the submit modal, an alert
 * hand-off URL opens it prefilled, and a successful submit closes it and
 * toasts a link to the result.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route } from '@kbn/shared-ux-router';
import { useHistory } from 'react-router-dom';

import type { DetonateTask } from '../../../common/detonate_prototype';
import { useKibana } from '../../common/lib/kibana';
import { useFlyoutApi } from '../../flyout_v2/use_flyout_api';
import { useDetonateHealthcheck, useDetonationTasks } from '../hooks/use_detonate';
import type { SubmitModal as SubmitModalType } from '../components/submit_modal';
import { DetonateListPage, SUBMIT_SAMPLE_BUTTON_TEST_ID } from './list_page';

type SubmitModalProps = React.ComponentProps<typeof SubmitModalType>;

const mockModalProps = jest.fn<void, [SubmitModalProps]>();

jest.mock('../components/submit_modal', () => ({
  SubmitModal: (props: SubmitModalProps) => {
    mockModalProps(props);
    return (
      <div data-test-subj="mockSubmitModal">
        <input data-test-subj="mockHashInput" defaultValue={props.initialHash ?? ''} />
        <button type="button" data-test-subj="mockCancel" onClick={props.onClose} />
      </div>
    );
  },
}));
jest.mock('../../common/lib/kibana');
jest.mock('../../flyout_v2/use_flyout_api');
jest.mock('../hooks/use_detonate');
jest.mock('@kbn/react-kibana-mount', () => ({
  toMountPoint: jest.fn((node: React.ReactNode) => node),
}));

const addSuccess = jest.fn();
const openDetonationFlyout = jest.fn();

const renderPage = (url = '/detonate_prototype') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Route path="/detonate_prototype">
        <HistoryProbe />
        <DetonateListPage />
      </Route>
    </MemoryRouter>
  );

let pushUrl: (url: string) => void = () => {};

const HistoryProbe = () => {
  const history = useHistory();
  pushUrl = (url) => history.push(url);
  return null;
};

const lastModalProps = (): SubmitModalProps => {
  const { calls } = mockModalProps.mock;
  return calls[calls.length - 1][0];
};

describe('DetonateListPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useKibana).mockReturnValue({
      services: { notifications: { toasts: { addSuccess } } },
    } as never);
    jest.mocked(useFlyoutApi).mockReturnValue({ openDetonationFlyout } as never);
    jest.mocked(useDetonateHealthcheck).mockReturnValue({ isError: false } as never);
    jest
      .mocked(useDetonationTasks)
      .mockReturnValue({ data: { tasks: [] }, isLoading: false } as never);
  });

  it('keeps the modal closed until "Submit sample" is clicked', () => {
    renderPage();
    expect(screen.queryByTestId('mockSubmitModal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(SUBMIT_SAMPLE_BUTTON_TEST_ID));

    expect(screen.getByTestId('mockSubmitModal')).toBeInTheDocument();
    expect(lastModalProps()).toEqual(expect.objectContaining({ source: 'detonate_page' }));
  });

  it('opens the modal prefilled when the URL carries a hash and tags', () => {
    renderPage(`/detonate_prototype?sample_hash=${'a'.repeat(64)}&tags=alert:1`);

    expect(screen.getByTestId('mockSubmitModal')).toBeInTheDocument();
    expect(lastModalProps()).toEqual(
      expect.objectContaining({ initialHash: 'a'.repeat(64), initialTags: ['alert:1'] })
    );
  });

  it('opens the modal prefilled when the query string changes while the page is mounted', () => {
    renderPage();
    expect(screen.queryByTestId('mockSubmitModal')).not.toBeInTheDocument();

    act(() => {
      pushUrl(`/detonate_prototype?sample_hash=${'b'.repeat(64)}&tags=alert:2`);
    });

    expect(screen.getByTestId('mockSubmitModal')).toBeInTheDocument();
    expect(lastModalProps()).toEqual(
      expect.objectContaining({ initialHash: 'b'.repeat(64), initialTags: ['alert:2'] })
    );
  });

  it('opens a blank modal from "Submit sample" after the prefilled one was cancelled', () => {
    renderPage(`/detonate_prototype?sample_hash=${'a'.repeat(64)}&tags=alert:1`);
    expect(screen.getByTestId('mockHashInput')).toHaveValue('a'.repeat(64));

    fireEvent.click(screen.getByTestId('mockCancel'));
    expect(screen.queryByTestId('mockSubmitModal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(SUBMIT_SAMPLE_BUTTON_TEST_ID));

    expect(screen.getByTestId('mockHashInput')).toHaveValue('');
    expect(lastModalProps().initialTags).toBeUndefined();
  });

  it('closes the modal and toasts a result link on a successful submit', () => {
    renderPage();
    fireEvent.click(screen.getByTestId(SUBMIT_SAMPLE_BUTTON_TEST_ID));

    act(() => {
      lastModalProps().onSubmitted({ id: 'task-5' } as DetonateTask);
    });

    expect(screen.queryByTestId('mockSubmitModal')).not.toBeInTheDocument();
    expect(addSuccess).toHaveBeenCalledTimes(1);
  });

  it('closes the modal and opens the run flyout from the prior-run link', () => {
    renderPage();
    fireEvent.click(screen.getByTestId(SUBMIT_SAMPLE_BUTTON_TEST_ID));

    act(() => {
      lastModalProps().onViewTask('run-2');
    });

    expect(screen.queryByTestId('mockSubmitModal')).not.toBeInTheDocument();
    expect(openDetonationFlyout).toHaveBeenCalledWith({ taskId: 'run-2' });
  });
});
