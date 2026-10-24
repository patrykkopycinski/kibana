/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — submission form.
 *
 * Two ways in, because the service has two: a hash the service fetches, and a
 * file the analyst already holds. The alert action reaches this form with the
 * hash pre-filled, which is why `initialHash` exists rather than the action
 * owning a second, divergent submit path.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiComboBox,
  EuiFilePicker,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiTitle,
  EuiFieldText,
} from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { KbnDangerCallout } from '@kbn/ui-callout';

import {
  DETONATE_VM_ARCHITECTURES,
  DETONATE_VM_OS_FAMILIES,
} from '../../../common/detonate_prototype';
import type {
  DetonateTask,
  DetonateVmArchitecture,
  DetonateVmOsFamily,
} from '../../../common/detonate_prototype';
import { useSubmitFile, useSubmitHash } from '../hooks/use_detonate';
import * as i18n from '../translations';

export const SUBMIT_FORM_TEST_ID = 'detonatePrototypeSubmitForm';
export const SUBMIT_HASH_INPUT_TEST_ID = 'detonatePrototypeSampleHash';
export const SUBMIT_FILE_INPUT_TEST_ID = 'detonatePrototypeSampleFile';
export const SUBMIT_BUTTON_TEST_ID = 'detonatePrototypeSubmitButton';
export const SUBMIT_ERROR_TEST_ID = 'detonatePrototypeSubmitError';

type SubmitMode = 'hash' | 'file';

/**
 * The service decides OS and architecture when the request omits them, and its
 * default is the right answer more often than ours would be. An empty value
 * means "do not send the field".
 */
const UNSET = '' as const;

const osOptions = [
  { value: UNSET, text: i18n.SERVICE_DEFAULT },
  ...DETONATE_VM_OS_FAMILIES.map((value) => ({ value, text: value })),
];

const archOptions = [
  { value: UNSET, text: i18n.SERVICE_DEFAULT },
  ...DETONATE_VM_ARCHITECTURES.map((value) => ({ value, text: value })),
];

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
  onSubmitted: (task: DetonateTask) => void;
}

export const SubmitForm = React.memo<Props>(({ initialHash, initialTags, onSubmitted }) => {
  const [mode, setMode] = useState<SubmitMode>('hash');
  const [hash, setHash] = useState(initialHash ?? '');
  const [file, setFile] = useState<File | undefined>();
  const [tags, setTags] = useState<Array<EuiComboBoxOptionOption<string>>>(
    (initialTags ?? []).map((label) => ({ label }))
  );
  const [osFamily, setOsFamily] = useState<DetonateVmOsFamily | typeof UNSET>(UNSET);
  const [architecture, setArchitecture] = useState<DetonateVmArchitecture | typeof UNSET>(UNSET);

  const submitHash = useSubmitHash();
  const submitFile = useSubmitFile();
  const active = mode === 'hash' ? submitHash : submitFile;

  const tagValues = useMemo(() => tags.map(({ label }) => label), [tags]);

  const options = useMemo(
    () => ({
      ...(tagValues.length ? { tags: tagValues } : {}),
      ...(osFamily ? { vm_os_family: osFamily } : {}),
      ...(architecture ? { vm_architecture: architecture } : {}),
    }),
    [tagValues, osFamily, architecture]
  );

  const canSubmit = mode === 'hash' ? hash.trim().length > 0 : file !== undefined;

  const onSubmit = useCallback(async () => {
    if (mode === 'hash') {
      const task = await submitHash.mutateAsync({ sample_hash: hash.trim(), ...options });
      onSubmitted(task);
      return;
    }
    if (file) {
      const task = await submitFile.mutateAsync({ file, tags: tagValues });
      onSubmitted(task);
    }
  }, [mode, hash, file, options, tagValues, submitHash, submitFile, onSubmitted]);

  const onCreateTag = useCallback((label: string) => {
    const trimmed = label.trim();
    if (trimmed) {
      setTags((current) => [...current, { label: trimmed }]);
    }
  }, []);

  const onFileChange = useCallback((files: FileList | null) => {
    setFile(files?.[0]);
  }, []);

  return (
    <EuiPanel hasBorder data-test-subj={SUBMIT_FORM_TEST_ID}>
      <EuiTitle size="s">
        <h2>{i18n.SUBMIT_PANEL_TITLE}</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiTabs size="s">
        <EuiTab isSelected={mode === 'hash'} onClick={() => setMode('hash')}>
          {i18n.SUBMIT_BY_HASH}
        </EuiTab>
        <EuiTab isSelected={mode === 'file'} onClick={() => setMode('file')}>
          {i18n.SUBMIT_BY_FILE}
        </EuiTab>
      </EuiTabs>
      <EuiSpacer size="m" />

      <EuiForm component="form" onSubmit={(event) => event.preventDefault()}>
        {mode === 'hash' ? (
          <EuiFormRow label={i18n.SAMPLE_HASH_LABEL} helpText={i18n.SAMPLE_HASH_HELP} fullWidth>
            <EuiFieldText
              fullWidth
              value={hash}
              onChange={(event) => setHash(event.target.value)}
              data-test-subj={SUBMIT_HASH_INPUT_TEST_ID}
            />
          </EuiFormRow>
        ) : (
          <EuiFormRow label={i18n.SAMPLE_FILE_LABEL} fullWidth>
            <EuiFilePicker
              fullWidth
              initialPromptText={i18n.SAMPLE_FILE_PROMPT}
              onChange={onFileChange}
              data-test-subj={SUBMIT_FILE_INPUT_TEST_ID}
            />
          </EuiFormRow>
        )}

        <EuiFormRow label={i18n.TAGS_LABEL} helpText={i18n.TAGS_HELP} fullWidth>
          <EuiComboBox
            fullWidth
            noSuggestions
            selectedOptions={tags}
            onChange={setTags}
            onCreateOption={onCreateTag}
            data-test-subj="detonatePrototypeTags"
          />
        </EuiFormRow>

        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem>
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
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow label={i18n.ARCHITECTURE_LABEL} fullWidth>
              <EuiSelect
                fullWidth
                options={archOptions}
                value={architecture}
                onChange={(event) =>
                  setArchitecture(event.target.value as DetonateVmArchitecture | typeof UNSET)
                }
                data-test-subj="detonatePrototypeArchitecture"
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>

        {active.isError && (
          <>
            <EuiSpacer size="m" />
            <KbnDangerCallout
              announceOnMount
              title={errorMessage(active.error)}
              data-test-subj={SUBMIT_ERROR_TEST_ID}
            />
          </>
        )}

        <EuiSpacer size="m" />
        <EuiButton
          fill
          type="submit"
          isDisabled={!canSubmit}
          isLoading={active.isLoading}
          onClick={onSubmit}
          data-test-subj={SUBMIT_BUTTON_TEST_ID}
        >
          {i18n.DETONATE_BUTTON}
        </EuiButton>
      </EuiForm>
    </EuiPanel>
  );
});
SubmitForm.displayName = 'SubmitForm';
