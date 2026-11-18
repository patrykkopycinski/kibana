/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Submit-modal tests.
 *
 * The acceptance criteria: a submit never reaches the API without an explicit
 * confirm (a detonation spends a VM), cancelling submits nothing, an untouched
 * modal sends only the hash and its source, a malformed hash is stopped before
 * the service sees it, and an exhausted allowance disables submit.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { DETONATE_VM_OS_FAMILIES } from '../../../common/detonate_prototype';
import type { DetonateTask, DetonateUsage } from '../../../common/detonate_prototype';
import * as kibana from '../../common/lib/kibana';
import * as useDetonate from '../hooks/use_detonate';
import * as i18n from '../translations';
import {
  isValidSampleHash,
  SubmitModal,
  SUBMIT_MODAL_ALLOWANCE_EXHAUSTED_TEST_ID,
  SUBMIT_MODAL_BUTTON_TEST_ID,
  SUBMIT_MODAL_FILE_INPUT_TEST_ID,
  SUBMIT_MODAL_HASH_ERROR_TEST_ID,
  SUBMIT_MODAL_HASH_INPUT_TEST_ID,
  SUBMIT_MODAL_LIMITATIONS_TEST_ID,
  SUBMIT_MODAL_PRIOR_RUN_TEST_ID,
  SUBMIT_MODAL_READ_ONLY_TEST_ID,
  SUBMIT_MODAL_ERROR_TEST_ID,
  SUBMIT_MODAL_EXEC_WAIT_TEST_ID,
  SUBMIT_MODAL_USAGE_ERROR_TEST_ID,
  SUBMIT_MODAL_USAGE_TEST_ID,
} from './submit_modal';

jest.mock('../../common/lib/kibana', () => ({
  ...jest.requireActual('../../common/lib/kibana'),
  useKibana: jest.fn(),
}));

const SHA256 = 'a'.repeat(64);

const mutateAsync = jest.fn();
const mutateFileAsync = jest.fn();

const mockCapabilities = (security: Record<string, boolean>) =>
  jest.mocked(kibana.useKibana).mockReturnValue({
    services: { http: {}, application: { capabilities: { siemV5: security } } },
  } as never);

const mockUsage = (usage: DetonateUsage | undefined, isError = false) =>
  jest.spyOn(useDetonate, 'useDetonateUsage').mockReturnValue({ data: usage, isError } as never);

const mockPriorRun = (completedRun: { id: string } | undefined) =>
  jest
    .spyOn(useDetonate, 'useCompletedDetonationByHash')
    .mockReturnValue({ completedRun } as never);

const defaultProps = {
  source: 'detonate_page' as const,
  onClose: jest.fn(),
  onSubmitted: jest.fn(),
  onViewTask: jest.fn(),
};

const renderModal = (props: Partial<React.ComponentProps<typeof SubmitModal>> = {}) =>
  render(<SubmitModal {...defaultProps} {...props} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockCapabilities({ show: true, crud: true });
  mockUsage(undefined);
  mockPriorRun(undefined);
  mutateAsync.mockResolvedValue({ id: 'task-1' } as DetonateTask);
  mutateFileAsync.mockResolvedValue({ id: 'task-2' } as DetonateTask);
  jest.spyOn(useDetonate, 'useSubmitHash').mockReturnValue({
    mutateAsync,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  jest.spyOn(useDetonate, 'useSubmitFile').mockReturnValue({
    mutateAsync: mutateFileAsync,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
});

const typeHash = (value = SHA256) =>
  fireEvent.change(screen.getByTestId(SUBMIT_MODAL_HASH_INPUT_TEST_ID), { target: { value } });

const submit = () => {
  typeHash();
  fireEvent.click(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID));
};

describe('isValidSampleHash', () => {
  it.each([
    ['md5', 'b'.repeat(32), true],
    ['sha1', 'c'.repeat(40), true],
    ['sha256', SHA256, true],
    ['mixed-case sha256 with whitespace', ` ${'A'.repeat(64)} `, true],
    ['wrong length', 'a'.repeat(33), false],
    ['non-hex characters', 'z'.repeat(64), false],
    ['empty', '', false],
  ])('%s', (_name, value, expected) => {
    expect(isValidSampleHash(value)).toBe(expected);
  });
});

describe('SubmitModal', () => {
  it('offers By hash and By file only, with no architecture select', () => {
    renderModal();

    expect(screen.getByText(i18n.SUBMIT_BY_HASH)).toBeInTheDocument();
    expect(screen.getByText(i18n.SUBMIT_BY_FILE)).toBeInTheDocument();
    expect(screen.getByTestId('detonatePrototypeTags')).toBeInTheDocument();
    expect(screen.getByTestId('detonatePrototypeOsFamily')).toBeInTheDocument();
    expect(screen.queryByText(/architecture/i)).toBeNull();
  });

  it('shows the limitations notice with the agreed wording', () => {
    renderModal();

    expect(screen.getByTestId(SUBMIT_MODAL_LIMITATIONS_TEST_ID)).toHaveTextContent(
      'No anti-evasion hardening and no outbound internet. Samples that check for a VM or need a live C2 may show little activity and return an inconclusive verdict.'
    );
  });

  describe('confirm', () => {
    it('does not submit until the confirm modal is confirmed', () => {
      renderModal();

      submit();
      expect(mutateAsync).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });

    it('submits nothing when the confirm modal is cancelled', () => {
      renderModal();

      submit();
      fireEvent.click(screen.getByTestId('confirmModalCancelButton'));
      expect(mutateAsync).not.toHaveBeenCalled();
      // The confirm is gone, so a retry starts from the confirm again.
      expect(screen.queryByTestId('confirmModalConfirmButton')).toBeNull();
    });

    it('sends only the hash and the surface it was submitted from when no option was chosen', () => {
      renderModal();

      submit();
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      expect(mutateAsync).toHaveBeenCalledWith({
        sample_hash: SHA256,
        origin: { source: 'detonate_page' },
      });
    });

    it('records the alert flyout as the origin when it hosts the modal', () => {
      renderModal({ source: 'alert_flyout' });

      submit();
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ origin: { source: 'alert_flyout' } })
      );
    });

    it('merges the origin context the surface prefilled with the source', () => {
      const initialOrigin = { alert_ids: ['alert-1'], host_name: 'win-01', user_name: 'alice' };
      renderModal({ source: 'alert_flyout', initialOrigin });

      submit();
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ origin: { ...initialOrigin, source: 'alert_flyout' } })
      );
    });

    it('sends the prefilled hash and tags', () => {
      renderModal({ initialHash: SHA256, initialTags: ['alert:doc-7'] });

      fireEvent.click(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID));
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      expect(mutateAsync).toHaveBeenCalledWith({
        sample_hash: SHA256,
        tags: ['alert:doc-7'],
        origin: { source: 'detonate_page' },
      });
    });

    describe('tags', () => {
      const createTag = (value: string) => {
        const input = screen
          .getByTestId('detonatePrototypeTags')
          .querySelector<HTMLInputElement>('[data-test-subj="comboBoxSearchInput"]');
        fireEvent.change(input as HTMLInputElement, { target: { value } });
        fireEvent.keyDown(input as HTMLInputElement, { key: 'Enter', code: 'Enter', keyCode: 13 });
      };

      it('does not add a tag that is already selected, including a prefilled one', () => {
        renderModal({ initialHash: SHA256, initialTags: ['alert:doc-7'] });

        createTag('alert:doc-7');
        // The padded value is the one that reaches onCreateTag; EUI blocks exact repeats itself.
        createTag(' alert:doc-7 ');
        createTag('extra');
        createTag('extra');

        fireEvent.click(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID));
        fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
        expect(mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ tags: ['alert:doc-7', 'extra'] })
        );
      });

      it('treats tags that differ only in case as different tags', () => {
        renderModal({ initialHash: SHA256, initialTags: ['extra'] });

        createTag('Extra');

        fireEvent.click(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID));
        fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
        expect(mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ tags: ['extra', 'Extra'] })
        );
      });
    });

    it('sends the chosen OS family', () => {
      renderModal();

      fireEvent.change(screen.getByTestId('detonatePrototypeOsFamily'), {
        target: { value: 'windows' },
      });
      submit();
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ vm_os_family: 'windows' })
      );
    });

    // Epic #20877 §State inventory: an alert on an unsupported OS gets no hash-only path
    // (pending product answer, P-2); the form offers only the supported VM families.
    it('offers only the supported OS families and no hash-only lookup', () => {
      renderModal({ initialHash: SHA256 });

      const options = Array.from(
        screen.getByTestId('detonatePrototypeOsFamily').querySelectorAll('option')
      ).map((option) => option.getAttribute('value'));
      expect(options).toEqual(['', ...DETONATE_VM_OS_FAMILIES]);
      expect(screen.queryByText(/hash only|look up/i)).toBeNull();
    });

    it('pre-fills the OS family and the exec wait of a run being repeated and sends them', () => {
      renderModal({ initialHash: SHA256, initialOsFamily: 'linux', initialExecWaitSecs: 600 });

      expect(screen.getByTestId('detonatePrototypeOsFamily')).toHaveValue('linux');
      expect(screen.getByTestId(SUBMIT_MODAL_EXEC_WAIT_TEST_ID)).toHaveValue(600);
      fireEvent.click(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID));
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ vm_os_family: 'linux', exec_wait_secs: 600 })
      );
    });

    it('sends the exec wait the analyst typed, and omits it when the field is cleared', () => {
      renderModal({ initialHash: SHA256, initialExecWaitSecs: 300 });

      fireEvent.change(screen.getByTestId(SUBMIT_MODAL_EXEC_WAIT_TEST_ID), {
        target: { value: '450' },
      });
      fireEvent.click(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID));
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      expect(mutateAsync).toHaveBeenLastCalledWith(
        expect.objectContaining({ exec_wait_secs: 450 })
      );

      fireEvent.change(screen.getByTestId(SUBMIT_MODAL_EXEC_WAIT_TEST_ID), {
        target: { value: '' },
      });
      fireEvent.click(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID));
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      expect(mutateAsync).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ exec_wait_secs: expect.anything() })
      );
    });

    it.each([['1.5'], ['-1'], ['901']])(
      'flags an exec wait of %s as invalid and disables submit',
      (value) => {
        renderModal({ initialHash: SHA256 });

        fireEvent.change(screen.getByTestId(SUBMIT_MODAL_EXEC_WAIT_TEST_ID), {
          target: { value },
        });

        expect(screen.getByTestId(SUBMIT_MODAL_EXEC_WAIT_TEST_ID)).toHaveAttribute(
          'aria-invalid',
          'true'
        );
        expect(screen.getByText(i18n.EXEC_WAIT_INVALID(900))).toBeInTheDocument();
        expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeDisabled();
        expect(mutateAsync).not.toHaveBeenCalled();
      }
    );

    it.each([['0'], ['900']])('accepts an exec wait of %s at the bounds', (value) => {
      renderModal({ initialHash: SHA256 });

      fireEvent.change(screen.getByTestId(SUBMIT_MODAL_EXEC_WAIT_TEST_ID), {
        target: { value },
      });

      expect(screen.queryByText(i18n.EXEC_WAIT_INVALID(900))).toBeNull();
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();
      fireEvent.click(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID));
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      expect(mutateAsync).toHaveBeenLastCalledWith(
        expect.objectContaining({ exec_wait_secs: Number(value) })
      );
    });

    it.each([['abc'], ['-']])(
      'flags a browser-rejected exec wait of %s as invalid, not as an empty field',
      (value) => {
        renderModal({ initialHash: SHA256, initialExecWaitSecs: 300 });
        const input = screen.getByTestId(SUBMIT_MODAL_EXEC_WAIT_TEST_ID);
        Object.defineProperty(input, 'validity', { value: { badInput: true }, configurable: true });

        fireEvent.change(input, { target: { value } });

        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText(i18n.EXEC_WAIT_INVALID(900))).toBeInTheDocument();
        expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeDisabled();

        Object.defineProperty(input, 'validity', {
          value: { badInput: false },
          configurable: true,
        });
        fireEvent.change(input, { target: { value: '450' } });

        expect(screen.queryByText(i18n.EXEC_WAIT_INVALID(900))).toBeNull();
        expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();
      }
    );

    it('tracks bad input from native input events when the value string stays empty', () => {
      renderModal({ initialHash: SHA256 });
      const input = screen.getByTestId(SUBMIT_MODAL_EXEC_WAIT_TEST_ID);
      const setBadInput = (badInput: boolean) =>
        Object.defineProperty(input, 'validity', { value: { badInput }, configurable: true });

      setBadInput(true);
      fireEvent.input(input, { target: { value: '' } });

      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeDisabled();

      setBadInput(false);
      fireEvent.input(input, { target: { value: '' } });

      expect(screen.queryByText(i18n.EXEC_WAIT_INVALID(900))).toBeNull();
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();

      setBadInput(true);
      fireEvent.input(input, { target: { value: '' } });

      expect(screen.getByText(i18n.EXEC_WAIT_INVALID(900))).toBeInTheDocument();
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeDisabled();
    });

    it('treats an empty exec wait as valid', () => {
      renderModal({ initialHash: SHA256, initialExecWaitSecs: 300 });

      fireEvent.change(screen.getByTestId(SUBMIT_MODAL_EXEC_WAIT_TEST_ID), {
        target: { value: '' },
      });

      expect(screen.queryByText(i18n.EXEC_WAIT_INVALID(900))).toBeNull();
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();
    });

    it('calls onSubmitted with the task the service answered', async () => {
      const onSubmitted = jest.fn();
      renderModal({ onSubmitted });

      submit();
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith({ id: 'task-1' }));
    });
  });

  describe('by file', () => {
    it('keeps submit disabled until a file is chosen, then submits the file', async () => {
      const onSubmitted = jest.fn();
      renderModal({ onSubmitted });

      fireEvent.click(screen.getByText(i18n.SUBMIT_BY_FILE));
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeDisabled();

      const file = new File(['MZ'], 'sample.exe');
      fireEvent.change(screen.getByTestId(SUBMIT_MODAL_FILE_INPUT_TEST_ID), {
        target: { files: [file] },
      });
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();

      fireEvent.click(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID));
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

      expect(mutateFileAsync).toHaveBeenCalledWith({
        file,
        origin: { source: 'detonate_page' },
      });
      expect(mutateAsync).not.toHaveBeenCalled();
      await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith({ id: 'task-2' }));
    });
  });

  describe('mode switch', () => {
    it('drops the chosen file when switching tabs, so the remounted picker cannot leave submit enabled', () => {
      renderModal();

      fireEvent.click(screen.getByText(i18n.SUBMIT_BY_FILE));
      fireEvent.change(screen.getByTestId(SUBMIT_MODAL_FILE_INPUT_TEST_ID), {
        target: { files: [new File(['MZ'], 'sample.exe')] },
      });
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();

      fireEvent.click(screen.getByText(i18n.SUBMIT_BY_HASH));
      fireEvent.click(screen.getByText(i18n.SUBMIT_BY_FILE));

      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeDisabled();
    });

    it('keeps the chosen file when the already-selected tab is clicked again', () => {
      renderModal();

      fireEvent.click(screen.getByText(i18n.SUBMIT_BY_FILE));
      fireEvent.change(screen.getByTestId(SUBMIT_MODAL_FILE_INPUT_TEST_ID), {
        target: { files: [new File(['MZ'], 'sample.exe')] },
      });
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();

      fireEvent.click(screen.getByText(i18n.SUBMIT_BY_FILE));

      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();
    });
  });

  describe('submit errors', () => {
    const failSubmit = () => {
      const error = Object.assign(new Error('boom'), { body: { message: 'Service said no' } });
      mutateAsync.mockRejectedValue(error);
      jest.spyOn(useDetonate, 'useSubmitHash').mockReturnValue({
        mutateAsync,
        isLoading: false,
        isError: true,
        error,
      } as never);
    };

    it('shows the error and keeps the modal open when the submit fails', async () => {
      failSubmit();
      const onClose = jest.fn();
      const onSubmitted = jest.fn();
      renderModal({ onClose, onSubmitted });

      expect(screen.queryByTestId(SUBMIT_MODAL_ERROR_TEST_ID)).toBeNull();

      submit();
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

      await waitFor(() =>
        expect(screen.getByTestId(SUBMIT_MODAL_ERROR_TEST_ID)).toHaveTextContent('Service said no')
      );
      expect(onSubmitted).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('keeps showing the error of the last submitted mutation after switching tabs', async () => {
      failSubmit();
      renderModal();

      submit();
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      await waitFor(() =>
        expect(screen.getByTestId(SUBMIT_MODAL_ERROR_TEST_ID)).toBeInTheDocument()
      );

      fireEvent.click(screen.getByText(i18n.SUBMIT_BY_FILE));

      expect(screen.getByTestId(SUBMIT_MODAL_ERROR_TEST_ID)).toHaveTextContent('Service said no');
    });
  });

  describe('hash validation', () => {
    it('shows an inline error, disables submit and stays open for a malformed hash', () => {
      const onClose = jest.fn();
      renderModal({ onClose });

      typeHash('not-a-hash');

      expect(screen.getByTestId(SUBMIT_MODAL_HASH_ERROR_TEST_ID)).toHaveTextContent(
        i18n.SUBMIT_MODAL_INVALID_HASH
      );
      expect(screen.getByTestId(SUBMIT_MODAL_HASH_INPUT_TEST_ID)).toHaveAttribute(
        'aria-invalid',
        'true'
      );
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeDisabled();
      expect(onClose).not.toHaveBeenCalled();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it.each([
      [32, 'b'.repeat(32)],
      [40, 'c'.repeat(40)],
      [64, SHA256],
    ])('accepts the %i-character hash', (_length, value) => {
      renderModal();

      typeHash(value);

      expect(screen.queryByText(i18n.SUBMIT_MODAL_INVALID_HASH)).toBeNull();
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();
    });

    it('does not flag an empty field as invalid', () => {
      renderModal();

      expect(screen.queryByText(i18n.SUBMIT_MODAL_INVALID_HASH)).toBeNull();
      expect(screen.queryByTestId(SUBMIT_MODAL_HASH_ERROR_TEST_ID)).toBeNull();
    });
  });

  describe('allowance', () => {
    it('shows the remaining allowance line', () => {
      mockUsage({
        used: 3,
        allowance: 10,
        resetsAt: '2026-12-01T00:00:00.000Z',
      } as DetonateUsage);
      renderModal();

      expect(screen.getByTestId(SUBMIT_MODAL_USAGE_TEST_ID)).toHaveTextContent(
        i18n.SUBMIT_MODAL_USAGE({ used: 3, allowance: 10 })
      );
      typeHash();
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();
    });

    it('disables submit and shows the reset date when the allowance is exhausted', () => {
      const resetsAt = '2026-12-01T00:00:00.000Z';
      mockUsage({ used: 10, allowance: 10, resetsAt } as DetonateUsage);
      renderModal({ initialHash: SHA256 });

      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeDisabled();
      expect(screen.getByTestId(SUBMIT_MODAL_ALLOWANCE_EXHAUSTED_TEST_ID)).toHaveTextContent(
        i18n.SUBMIT_MODAL_ALLOWANCE_EXHAUSTED(
          new Date(resetsAt).toLocaleDateString(undefined, {
            timeZone: 'UTC',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        )
      );
    });

    it('formats the reset date in UTC whatever the host zone is', () => {
      // The jest sandbox cannot change the process zone, so pin the option, not the output.
      const toLocaleDate = jest.spyOn(Date.prototype, 'toLocaleDateString');
      try {
        mockUsage({
          used: 10,
          allowance: 10,
          resetsAt: '2026-12-01T00:00:00.000Z',
        } as DetonateUsage);
        renderModal({ initialHash: SHA256 });

        expect(toLocaleDate).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ timeZone: 'UTC' })
        );
      } finally {
        toLocaleDate.mockRestore();
      }
    });

    it('says the allowance is unavailable when the usage fetch fails', () => {
      mockUsage(undefined, true);
      renderModal();

      expect(screen.getByTestId(SUBMIT_MODAL_USAGE_ERROR_TEST_ID)).toHaveTextContent(
        i18n.SUBMIT_MODAL_USAGE_UNAVAILABLE
      );
      expect(screen.queryByTestId(SUBMIT_MODAL_USAGE_TEST_ID)).toBeNull();
    });

    it('keeps submit disabled and the exhausted line when a refetch fails after the allowance was used up', () => {
      mockUsage(
        { used: 10, allowance: 10, resetsAt: '2026-12-01T00:00:00.000Z' } as DetonateUsage,
        true
      );
      renderModal({ initialHash: SHA256 });

      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeDisabled();
      expect(screen.getByTestId(SUBMIT_MODAL_ALLOWANCE_EXHAUSTED_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId(SUBMIT_MODAL_USAGE_ERROR_TEST_ID)).toBeInTheDocument();
      expect(screen.queryByTestId(SUBMIT_MODAL_USAGE_TEST_ID)).toBeNull();
    });

    it('hides the stale count when a refetch failed but the last data is still held', () => {
      mockUsage(
        { used: 3, allowance: 10, resetsAt: '2026-12-01T00:00:00.000Z' } as DetonateUsage,
        true
      );
      renderModal();

      expect(screen.getByTestId(SUBMIT_MODAL_USAGE_ERROR_TEST_ID)).toBeInTheDocument();
      expect(screen.queryByTestId(SUBMIT_MODAL_USAGE_TEST_ID)).toBeNull();
    });
  });

  describe('prior run', () => {
    it('links to a completed run for a 64-hex hash and leaves submit enabled', () => {
      mockPriorRun({ id: 'run-9' });
      const onViewTask = jest.fn();
      renderModal({ initialHash: SHA256, onViewTask });

      const notice = screen.getByTestId(SUBMIT_MODAL_PRIOR_RUN_TEST_ID);
      expect(notice).toHaveTextContent(i18n.SUBMIT_MODAL_PRIOR_RUN);
      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();

      fireEvent.click(screen.getByText(i18n.SUBMIT_MODAL_PRIOR_RUN_VIEW));
      expect(onViewTask).toHaveBeenCalledWith('run-9');
    });

    it('looks up a prior run only for a 64-hex hash', () => {
      const lookup = mockPriorRun(undefined);
      renderModal({ initialHash: 'b'.repeat(40) });

      expect(lookup).toHaveBeenLastCalledWith(undefined);

      typeHash(SHA256);
      expect(lookup).toHaveBeenLastCalledWith(SHA256);
    });
  });

  describe('privileges', () => {
    it('disables submit and explains why for a read-only role', () => {
      mockCapabilities({ show: true, crud: false });
      renderModal({ initialHash: SHA256 });

      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeDisabled();
      expect(screen.getByTestId(SUBMIT_MODAL_READ_ONLY_TEST_ID)).toBeInTheDocument();
    });

    it('allows submit for a role holding only the Detonate sub-feature', () => {
      mockCapabilities({ show: true, crud: false, detonateAll: true });
      renderModal({ initialHash: SHA256 });

      expect(screen.getByTestId(SUBMIT_MODAL_BUTTON_TEST_ID)).toBeEnabled();
      expect(screen.queryByTestId(SUBMIT_MODAL_READ_ONLY_TEST_ID)).toBeNull();
    });
  });
});
