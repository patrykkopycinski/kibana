/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import {
  EuiButton,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSelect,
  type EuiSelectOption,
} from '@elastic/eui';

export interface SubjectPickerKindOption<K extends string> {
  readonly value: K;
  readonly label: string;
}

export interface SubjectPickerProps<K extends string> {
  readonly kinds: readonly SubjectPickerKindOption<K>[];
  readonly value: { readonly kind: K; readonly id: string } | undefined;
  readonly placeholder?: string;
  readonly onApply: (subject: { kind: K; id: string } | undefined) => void;
  readonly testSubj: string;
}

/**
 * Small inline form for picking a subject (kind + id) to drive one of the
 * drilldown panels. Holds a local draft so typing doesn't refetch on every
 * keystroke — the parent only sees the change once "Load" is pressed (or
 * when the field is cleared).
 */
export const SubjectPicker = <K extends string>({
  kinds,
  value,
  placeholder,
  onApply,
  testSubj,
}: SubjectPickerProps<K>): React.ReactElement => {
  const [draftKind, setDraftKind] = useState<K>(value?.kind ?? kinds[0].value);
  const [draftId, setDraftId] = useState<string>(value?.id ?? '');

  useEffect(() => {
    setDraftKind(value?.kind ?? kinds[0].value);
    setDraftId(value?.id ?? '');
  }, [value, kinds]);

  const selectOptions: EuiSelectOption[] = kinds.map((k) => ({ value: k.value, text: k.label }));

  /**
   * Tolerate the `kind:id` form users frequently paste (e.g. from log
   * lines or docs). When the pasted id starts with a valid kind prefix
   * we auto-switch the kind dropdown and strip the prefix so the caller
   * always receives the raw id the backend indexes.
   */
  const apply = (): void => {
    const trimmed = draftId.trim();
    if (!trimmed) {
      onApply(undefined);
      return;
    }
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const maybeKind = trimmed.slice(0, colonIdx);
      const match = kinds.find((k) => k.value === maybeKind);
      if (match) {
        const rest = trimmed.slice(colonIdx + 1).trim();
        if (rest) {
          setDraftKind(match.value);
          setDraftId(rest);
          onApply({ kind: match.value, id: rest });
          return;
        }
      }
    }
    onApply({ kind: draftKind, id: trimmed });
  };

  return (
    <EuiFlexGroup gutterSize="s" responsive={false} alignItems="flexEnd">
      <EuiFlexItem grow={false} style={{ width: 140 }}>
        <EuiSelect
          aria-label="Subject kind"
          compressed
          options={selectOptions}
          value={draftKind}
          onChange={(e) => setDraftKind(e.target.value as K)}
          data-test-subj={`${testSubj}Kind`}
        />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiFieldText
          compressed
          value={draftId}
          placeholder={placeholder}
          onChange={(e) => setDraftId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply();
          }}
          data-test-subj={`${testSubj}Id`}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButton size="s" onClick={apply} data-test-subj={`${testSubj}Apply`}>
          {'Load'}
        </EuiButton>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
