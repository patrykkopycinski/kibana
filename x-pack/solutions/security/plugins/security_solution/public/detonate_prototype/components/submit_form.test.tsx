/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Submission-form tests.
 *
 * The acceptance criteria: a submit never reaches the API without an explicit
 * confirm (a detonation spends a VM), cancelling the modal submits nothing,
 * and the force-fresh checkbox reaches the request (bypassing completed-report
 * dedup is the analyst's explicit choice, not a form default).
 *
 * Mutation checks: wire the button straight to `doSubmit` and the first case
 * goes red; drop `force_fresh` from `options` and the force-fresh case goes
 * red.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type { DetonateTask } from '../../../common/detonate_prototype';
import * as useDetonate from '../hooks/use_detonate';
import {
  SubmitForm,
  SUBMIT_BUTTON_TEST_ID,
  SUBMIT_CONFIRM_FORCE_FRESH_TEST_ID,
  SUBMIT_HASH_INPUT_TEST_ID,
} from './submit_form';

jest.mock('../../common/lib/kibana', () => ({
  ...jest.requireActual('../../common/lib/kibana'),
  useKibana: jest.fn(),
}));

const mutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(require('../../common/lib/kibana').useKibana).mockReturnValue({
    services: { http: {} },
  } as never);
  mutateAsync.mockResolvedValue({ id: 'task-1' } as DetonateTask);
  jest.spyOn(useDetonate, 'useSubmitHash').mockReturnValue({
    mutateAsync,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  jest.spyOn(useDetonate, 'useSubmitFile').mockReturnValue({
    mutateAsync,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
});

const submit = async () => {
  fireEvent.change(screen.getByTestId(SUBMIT_HASH_INPUT_TEST_ID), {
    target: { value: 'a'.repeat(64) },
  });
  fireEvent.click(screen.getByTestId(SUBMIT_BUTTON_TEST_ID));
};

describe('SubmitForm', () => {
  it('does not submit until the confirm modal is confirmed', async () => {
    render(<SubmitForm onSubmitted={jest.fn()} />);

    await submit();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('submits nothing when the modal is cancelled', async () => {
    render(<SubmitForm onSubmitted={jest.fn()} />);

    await submit();
    fireEvent.click(screen.getByTestId('confirmModalCancelButton'));
    expect(mutateAsync).not.toHaveBeenCalled();
    // The modal is gone, so a retry starts from the confirm again.
    expect(screen.queryByTestId('confirmModalConfirmButton')).toBeNull();
  });

  it('sends force_fresh only when the analyst checked the box', async () => {
    render(<SubmitForm onSubmitted={jest.fn()} />);

    await submit();
    // Default: dedup applies — no force_fresh in the request.
    fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
    expect(mutateAsync).toHaveBeenCalledWith(expect.not.objectContaining({ force_fresh: true }));

    mutateAsync.mockClear();
    await submit();
    fireEvent.click(screen.getByTestId(SUBMIT_CONFIRM_FORCE_FRESH_TEST_ID));
    fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ force_fresh: true }));
  });

  it('calls onSubmitted with the task the service answered', async () => {
    const onSubmitted = jest.fn();
    render(<SubmitForm onSubmitted={onSubmitted} />);

    await submit();
    fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith({ id: 'task-1' }));
  });
});
