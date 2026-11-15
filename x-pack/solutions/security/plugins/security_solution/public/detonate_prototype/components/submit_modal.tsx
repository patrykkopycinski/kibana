/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — submission modal.
 *
 * One component, two surfaces: the Detonate page (button in the header) and
 * the alert flyout (Take action → "Detonate file"). The hash input is
 * validated client-side so an obviously-wrong digest never spends a confirm
 * cycle, and the allowance line is the analyst's only cost signal before the
 * confirm.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiComboBox,
  EuiConfirmModal,
  EuiFieldNumber,
  EuiFieldText,
  EuiFilePicker,
  EuiForm,
  EuiFormRow,
  EuiLink,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSelect,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { KbnDangerCallout, KbnInfoCallout, KbnWarningCallout } from '@kbn/ui-callout';

import {
  DETONATE_MAX_EXEC_WAIT_SECS,
  DETONATE_VM_OS_FAMILIES,
  isAllowanceExhausted,
} from '../../../common/detonate_prototype';
import type {
  DetonateSubmitOrigin,
  DetonateSubmitSource,
  DetonateTask,
  DetonateVmOsFamily,
} from '../../../common/detonate_prototype';
import {
  useCompletedDetonationByHash,
  useDetonateUsage,
  useSubmitFile,
  useSubmitHash,
} from '../hooks/use_detonate';
import { useCanSubmitDetonation } from '../hooks/use_can_submit_detonation';
import * as i18n from '../translations';
import { submitAndNotify } from './submit_and_notify';

export const SUBMIT_MODAL_TEST_ID = 'detonatePrototypeSubmitModal';
export const SUBMIT_MODAL_HASH_INPUT_TEST_ID = 'detonatePrototypeSampleHash';
export const SUBMIT_MODAL_EXEC_WAIT_TEST_ID = 'detonatePrototypeExecWaitSecs';
export const SUBMIT_MODAL_FILE_INPUT_TEST_ID = 'detonatePrototypeSampleFile';
export const SUBMIT_MODAL_BUTTON_TEST_ID = 'detonatePrototypeSubmitButton';
export const SUBMIT_MODAL_ERROR_TEST_ID = 'detonatePrototypeSubmitError';
export const SUBMIT_MODAL_READ_ONLY_TEST_ID = 'detonatePrototypeSubmitReadOnly';
export const SUBMIT_MODAL_LIMITATIONS_TEST_ID = 'detonatePrototypeSubmitLimitations';
export const SUBMIT_MODAL_USAGE_TEST_ID = 'detonatePrototypeSubmitUsage';
export const SUBMIT_MODAL_PRIOR_RUN_TEST_ID = 'detonatePrototypeSubmitPriorRun';
export const SUBMIT_MODAL_ALLOWANCE_EXHAUSTED_TEST_ID = 'detonatePrototypeSubmitAllowanceExhausted';
export const SUBMIT_MODAL_HASH_ERROR_TEST_ID = 'detonatePrototypeSubmitHashError';
export const SUBMIT_MODAL_USAGE_ERROR_TEST_ID = 'detonatePrototypeSubmitUsageError';
export const SUBMIT_CONFIRM_TEST_ID = 'detonatePrototypeSubmitConfirm';

type SubmitMode = 'hash' | 'file';

/**
 * The service decides the OS when the request omits it, and its default is
 * the right answer more often than ours would be. An empty value means "do
 * not send the field".
 */
const UNSET = '' as const;

const osOptions = [
  { value: UNSET, text: i18n.SERVICE_DEFAULT },
  ...DETONATE_VM_OS_FAMILIES.map((value) => ({ value, text: value })),
];

/** MD5 (32), SHA-1 (40) or SHA-256 (64) hexadecimal characters. */
const HASH_PATTERN = /^(?:[0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64})$/i;

export const isValidSampleHash = (hash: string): boolean => HASH_PATTERN.test(hash.trim());

const isSha256 = (hash: string): boolean => /^[0-9a-f]{64}$/i.test(hash.trim());

const errorMessage = (error: unknown): string => {
  // Kibana's http client puts the server's `{ message }` on `body`.
  const body = (error as { body?: { message?: string } } | undefined)?.body;
  if (body?.message) {
    return body.message;
  }
  return error instanceof Error ? error.message : String(error);
};

interface Props {
  /** Pre-filled by the alert action so the analyst does not retype a hash. */
  initialHash?: string;
  /** Pre-filled by the alert action so the run is findable afterwards. */
  initialTags?: string[];
  /** Pre-filled by Re-run so the new run uses the same VM OS as the one being repeated. */
  initialOsFamily?: DetonateVmOsFamily;
  /** Pre-filled by Re-run with a longer wait; left empty, the service default applies. */
  initialExecWaitSecs?: number;
  /** Which surface the modal was opened from; recorded with the run. */
  source: DetonateSubmitSource;
  /** Context the surface already knows (alert, host, user, path); recorded with the run. */
  initialOrigin?: Omit<DetonateSubmitOrigin, 'source'>;
  onClose: () => void;
  /** Called with the created run once the submission was accepted. */
  onSubmitted: (task: DetonateTask) => void;
  /** Opens an existing run (the prior-run View link). */
  onViewTask: (taskId: string) => void;
}

export const SubmitModal = React.memo<Props>(
  ({
    initialHash,
    initialTags,
    initialOsFamily,
    initialExecWaitSecs,
    source,
    initialOrigin,
    onClose,
    onSubmitted,
    onViewTask,
  }) => {
    const modalTitleId = useGeneratedHtmlId();
    const confirmTitleId = useGeneratedHtmlId();
    const [mode, setMode] = useState<SubmitMode>('hash');
    const [hash, setHash] = useState(initialHash ?? '');
    const [file, setFile] = useState<File | undefined>();
    const [tags, setTags] = useState<Array<EuiComboBoxOptionOption<string>>>(
      (initialTags ?? []).map((label) => ({ label }))
    );
    const [osFamily, setOsFamily] = useState<DetonateVmOsFamily | typeof UNSET>(
      initialOsFamily ?? UNSET
    );
    const [execWaitSecs, setExecWaitSecs] = useState<number | undefined>(initialExecWaitSecs);
    /** A browser-rejected entry ('abc', a lone '-') reads as '' but is not an empty field. */
    const [execWaitBadInput, setExecWaitBadInput] = useState(false);
    /** The button arms the run; the confirm modal is what actually submits. */
    const [isConfirming, setIsConfirming] = useState(false);

    const submitHash = useSubmitHash();
    const submitFile = useSubmitFile();
    /** The error and spinner follow the mutation that was last submitted, not the visible tab. */
    const [lastSubmitted, setLastSubmitted] = useState<SubmitMode | undefined>();
    const active =
      lastSubmitted === 'file' ? submitFile : lastSubmitted === 'hash' ? submitHash : undefined;
    const usageQuery = useDetonateUsage();
    // React Query keeps the last data when a refetch fails. Submit stays blocked and the
    // exhausted line stays up from that last data, because Kibana does not enforce the
    // allowance on submit and a failed refetch must not re-enable it. Only the count is
    // hidden on error, since it may be out of date; the error line shows instead.
    // With no usage loaded yet, submit stays open: the service's own quota still
    // refuses, and a usage outage should not block every submission.
    const usageData = usageQuery.data;
    // No architecture select: the service's submit contract has no architecture field yet.
    // The run's architecture is shown read-only in the result.

    const tagValues = useMemo(() => tags.map(({ label }) => label), [tags]);

    const options = useMemo(
      () => ({
        ...(tagValues.length ? { tags: tagValues } : {}),
        ...(osFamily ? { vm_os_family: osFamily } : {}),
        ...(execWaitSecs !== undefined ? { exec_wait_secs: execWaitSecs } : {}),
        origin: { ...initialOrigin, source },
      }),
      [tagValues, osFamily, execWaitSecs, source, initialOrigin]
    );

    const hasSubmitPrivilege = useCanSubmitDetonation();
    const allowanceExhausted = usageData ? isAllowanceExhausted(usageData) : false;

    // Run docs store only the SHA-256, so only that digest can have a prior run.
    const priorRunLookup = useMemo(
      () => (mode === 'hash' && isSha256(hash) ? hash.trim().toLowerCase() : undefined),
      [mode, hash]
    );
    const { completedRun } = useCompletedDetonationByHash(priorRunLookup);

    const hashInvalid = mode === 'hash' && hash.trim().length > 0 && !isValidSampleHash(hash);
    const hasSample = mode === 'hash' ? isValidSampleHash(hash) : file !== undefined;
    const execWaitInvalid =
      execWaitBadInput ||
      (execWaitSecs !== undefined &&
        (!Number.isInteger(execWaitSecs) ||
          execWaitSecs < 0 ||
          execWaitSecs > DETONATE_MAX_EXEC_WAIT_SECS));
    const canSubmit = hasSubmitPrivilege && hasSample && !allowanceExhausted && !execWaitInvalid;

    const doSubmit = useCallback(async () => {
      setLastSubmitted(mode);
      const request =
        mode === 'hash'
          ? submitHash.mutateAsync({ sample_hash: hash.trim(), ...options })
          : file
          ? submitFile.mutateAsync({ file, ...options })
          : undefined;
      await submitAndNotify(request, onSubmitted);
    }, [mode, hash, file, options, submitHash, submitFile, onSubmitted]);

    const onConfirm = useCallback(() => {
      setIsConfirming(false);
      void doSubmit();
    }, [doSubmit]);

    const onCreateTag = useCallback((label: string) => {
      const trimmed = label.trim();
      if (trimmed) {
        setTags((current) =>
          current.some(({ label: existing }) => existing === trimmed)
            ? current
            : [...current, { label: trimmed }]
        );
      }
    }, []);

    // The file picker remounts on a tab switch and no longer shows the old file,
    // so a stale selection must not keep submit enabled.
    // EuiTab also fires onClick on the already-selected tab; that must not clear the file.
    const onModeChange = useCallback(
      (next: SubmitMode) => {
        if (next === mode) {
          return;
        }
        setMode(next);
        setFile(undefined);
      },
      [mode]
    );

    const onFileChange = useCallback((files: FileList | null) => {
      setFile(files?.[0]);
    }, []);

    return (
      <EuiModal
        onClose={onClose}
        aria-labelledby={modalTitleId}
        data-test-subj={SUBMIT_MODAL_TEST_ID}
      >
        <EuiModalHeader>
          <EuiModalHeaderTitle id={modalTitleId}>{i18n.SUBMIT_MODAL_TITLE}</EuiModalHeaderTitle>
        </EuiModalHeader>
        <EuiModalBody>
          <EuiTabs size="s">
            <EuiTab isSelected={mode === 'hash'} onClick={() => onModeChange('hash')}>
              {i18n.SUBMIT_BY_HASH}
            </EuiTab>
            <EuiTab isSelected={mode === 'file'} onClick={() => onModeChange('file')}>
              {i18n.SUBMIT_BY_FILE}
            </EuiTab>
          </EuiTabs>
          <EuiSpacer size="m" />

          <EuiForm component="form" onSubmit={(event) => event.preventDefault()}>
            {mode === 'hash' ? (
              <EuiFormRow
                label={i18n.SAMPLE_HASH_LABEL}
                helpText={i18n.SAMPLE_HASH_HELP}
                isInvalid={hashInvalid}
                error={
                  hashInvalid ? (
                    <span data-test-subj={SUBMIT_MODAL_HASH_ERROR_TEST_ID}>
                      {i18n.SUBMIT_MODAL_INVALID_HASH}
                    </span>
                  ) : undefined
                }
                fullWidth
              >
                <EuiFieldText
                  fullWidth
                  value={hash}
                  onChange={(event) => setHash(event.target.value)}
                  isInvalid={hashInvalid}
                  data-test-subj={SUBMIT_MODAL_HASH_INPUT_TEST_ID}
                />
              </EuiFormRow>
            ) : (
              <EuiFormRow label={i18n.SAMPLE_FILE_LABEL} fullWidth>
                <EuiFilePicker
                  fullWidth
                  initialPromptText={i18n.SAMPLE_FILE_PROMPT}
                  onChange={onFileChange}
                  data-test-subj={SUBMIT_MODAL_FILE_INPUT_TEST_ID}
                />
              </EuiFormRow>
            )}

            {completedRun && (
              <EuiText size="s" data-test-subj={SUBMIT_MODAL_PRIOR_RUN_TEST_ID}>
                {i18n.SUBMIT_MODAL_PRIOR_RUN}{' '}
                <EuiLink onClick={() => onViewTask(completedRun.id)}>
                  {i18n.SUBMIT_MODAL_PRIOR_RUN_VIEW}
                </EuiLink>
              </EuiText>
            )}

            <EuiFormRow label={i18n.TAGS_LABEL} helpText={i18n.TAGS_HELP} fullWidth>
              <EuiComboBox
                fullWidth
                noSuggestions
                // Tags are keyword-mapped and compared exactly, so `Extra` and `extra` differ.
                isCaseSensitive
                selectedOptions={tags}
                onChange={setTags}
                onCreateOption={onCreateTag}
                data-test-subj="detonatePrototypeTags"
              />
            </EuiFormRow>

            <EuiFormRow label={i18n.OS_FAMILY_LABEL} fullWidth>
              <EuiSelect
                fullWidth
                options={osOptions}
                value={osFamily}
                onChange={(event) =>
                  setOsFamily(event.target.value as DetonateVmOsFamily | typeof UNSET)
                }
                data-test-subj="detonatePrototypeOsFamily"
              />
            </EuiFormRow>

            <EuiFormRow
              label={i18n.EXEC_WAIT_LABEL}
              helpText={i18n.EXEC_WAIT_HELP(DETONATE_MAX_EXEC_WAIT_SECS)}
              isInvalid={execWaitInvalid}
              error={i18n.EXEC_WAIT_INVALID(DETONATE_MAX_EXEC_WAIT_SECS)}
              fullWidth
            >
              <EuiFieldNumber
                fullWidth
                min={0}
                max={DETONATE_MAX_EXEC_WAIT_SECS}
                step={1}
                isInvalid={execWaitInvalid}
                value={execWaitSecs ?? ''}
                placeholder={i18n.SERVICE_DEFAULT}
                onChange={(event) => {
                  const { value, validity } = event.target;
                  setExecWaitBadInput(validity.badInput);
                  setExecWaitSecs(value === '' ? undefined : Number(value));
                }}
                data-test-subj={SUBMIT_MODAL_EXEC_WAIT_TEST_ID}
              />
            </EuiFormRow>
          </EuiForm>

          <EuiSpacer size="m" />
          <KbnWarningCallout
            title={i18n.SUBMIT_MODAL_LIMITATIONS}
            data-test-subj={SUBMIT_MODAL_LIMITATIONS_TEST_ID}
          />

          {usageQuery.isError && (
            <EuiText size="s" color="subdued" data-test-subj={SUBMIT_MODAL_USAGE_ERROR_TEST_ID}>
              {i18n.SUBMIT_MODAL_USAGE_UNAVAILABLE}
            </EuiText>
          )}

          {usageData && !usageQuery.isError && (
            <EuiText size="s" color="subdued" data-test-subj={SUBMIT_MODAL_USAGE_TEST_ID}>
              {i18n.SUBMIT_MODAL_USAGE({
                used: usageData.used,
                allowance: usageData.allowance,
              })}
            </EuiText>
          )}

          {allowanceExhausted && usageData && (
            <EuiText
              size="s"
              color="danger"
              data-test-subj={SUBMIT_MODAL_ALLOWANCE_EXHAUSTED_TEST_ID}
            >
              {i18n.SUBMIT_MODAL_ALLOWANCE_EXHAUSTED(
                new Date(usageData.resetsAt).toLocaleDateString(undefined, {
                  timeZone: 'UTC',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              )}
            </EuiText>
          )}

          {active?.isError && (
            <>
              <EuiSpacer size="m" />
              <KbnDangerCallout
                announceOnMount
                title={errorMessage(active.error)}
                data-test-subj={SUBMIT_MODAL_ERROR_TEST_ID}
              />
            </>
          )}

          {!hasSubmitPrivilege && (
            <>
              <EuiSpacer size="m" />
              <KbnInfoCallout
                title={i18n.SUBMIT_READ_ONLY_TITLE}
                text={i18n.SUBMIT_READ_ONLY_DESCRIPTION}
                data-test-subj={SUBMIT_MODAL_READ_ONLY_TEST_ID}
              />
            </>
          )}
        </EuiModalBody>
        <EuiModalFooter>
          <EuiButtonEmpty onClick={onClose}>{i18n.SUBMIT_MODAL_CANCEL}</EuiButtonEmpty>
          <EuiButton
            fill
            isDisabled={!canSubmit}
            isLoading={active?.isLoading}
            onClick={() => setIsConfirming(true)}
            data-test-subj={SUBMIT_MODAL_BUTTON_TEST_ID}
          >
            {i18n.DETONATE_BUTTON}
          </EuiButton>
        </EuiModalFooter>

        {isConfirming && (
          <EuiConfirmModal
            aria-labelledby={confirmTitleId}
            title={i18n.SUBMIT_CONFIRM_TITLE}
            titleProps={{ id: confirmTitleId }}
            onCancel={() => setIsConfirming(false)}
            onConfirm={onConfirm}
            cancelButtonText={i18n.SUBMIT_CONFIRM_CANCEL}
            confirmButtonText={i18n.DETONATE_BUTTON}
            buttonColor="primary"
            defaultFocusedButton="confirm"
            data-test-subj={SUBMIT_CONFIRM_TEST_ID}
          >
            <p>{i18n.SUBMIT_CONFIRM_BODY}</p>
          </EuiConfirmModal>
        )}
      </EuiModal>
    );
  }
);
SubmitModal.displayName = 'SubmitModal';
