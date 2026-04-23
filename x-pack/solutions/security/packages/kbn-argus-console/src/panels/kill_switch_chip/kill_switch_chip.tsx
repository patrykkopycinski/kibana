/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiConfirmModal,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiHealth,
  EuiLoadingSpinner,
  EuiPanel,
  EuiText,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';

import type { ArgusKillSwitchState } from '@kbn/argus-console-common';

import { useKillSwitch, type ArgusHttp } from '../../hooks';

export interface KillSwitchChipProps {
  readonly http?: ArgusHttp;
  /**
   * Whether the signed-in user is allowed to toggle autonomy. When `false`
   * the chip still renders (so everyone sees the current state), but the
   * modal confirm button is hidden.
   */
  readonly canToggle?: boolean;
  /** Optional toast surface so we can report failures without swallowing them. */
  readonly onError?: (error: Error) => void;
}

const enabledBadge = (state?: ArgusKillSwitchState): JSX.Element => {
  const enabled = state?.autonomy_enabled ?? true;
  return (
    <EuiHealth color={enabled ? 'success' : 'danger'}>
      <strong>{enabled ? 'Autonomy ON' : 'Autonomy OFF'}</strong>
    </EuiHealth>
  );
};

export const KillSwitchChip: React.FC<KillSwitchChipProps> = ({
  http,
  canToggle = false,
  onError,
}) => {
  const killSwitch = useKillSwitch({
    http: http as ArgusHttp,
    enabled: Boolean(http),
    refreshIntervalMs: 15_000,
  });

  const [isModalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const modalTitleId = useGeneratedHtmlId();

  if (!http) return null;

  if (killSwitch.state.status === 'loading' || killSwitch.state.status === 'idle') {
    return (
      <EuiPanel paddingSize="s" hasBorder={false} color="transparent">
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="s" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {'Autonomy state…'}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    );
  }

  if (killSwitch.state.status === 'error') {
    return (
      <EuiToolTip position="bottom" content={killSwitch.state.error.message}>
        <EuiBadge color="warning">{'Autonomy state unknown'}</EuiBadge>
      </EuiToolTip>
    );
  }

  const current = killSwitch.state.data.state;
  const currentlyEnabled = current.autonomy_enabled;
  const bootstrap = killSwitch.state.data.bootstrap;

  const onOpenModal = () => {
    setReason('');
    setModalOpen(true);
  };

  const onConfirmToggle = async () => {
    try {
      await killSwitch.toggle({
        autonomy_enabled: !currentlyEnabled,
        reason: reason.trim() || undefined,
        scope: 'global',
        artifact_type: 'all',
      });
      setModalOpen(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (onError) onError(error);
    }
  };

  const tooltip = currentlyEnabled
    ? 'Autonomy is ON. ARGUS can apply trusted-tier mutations without human review.'
    : `Autonomy is OFF. All mutations require human approval.${
        current.reason ? ` — ${current.reason}` : ''
      }`;

  return (
    <>
      <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiToolTip position="bottom" content={tooltip}>
            {enabledBadge(current)}
          </EuiToolTip>
        </EuiFlexItem>
        {bootstrap ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{'bootstrap'}</EuiBadge>
          </EuiFlexItem>
        ) : null}
        {canToggle ? (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="xs"
              color={currentlyEnabled ? 'danger' : 'success'}
              onClick={onOpenModal}
              isLoading={killSwitch.toggling}
              data-test-subj="argusKillSwitchToggleButton"
            >
              {currentlyEnabled ? 'Pause autonomy' : 'Resume autonomy'}
            </EuiButtonEmpty>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>

      {isModalOpen ? (
        <EuiConfirmModal
          aria-labelledby={modalTitleId}
          titleProps={{ id: modalTitleId }}
          title={currentlyEnabled ? 'Pause ARGUS autonomy?' : 'Resume ARGUS autonomy?'}
          onCancel={() => setModalOpen(false)}
          onConfirm={onConfirmToggle}
          cancelButtonText="Cancel"
          confirmButtonText={currentlyEnabled ? 'Pause autonomy' : 'Resume autonomy'}
          buttonColor={currentlyEnabled ? 'danger' : 'primary'}
          isLoading={killSwitch.toggling}
          defaultFocusedButton="confirm"
          confirmButtonDisabled={killSwitch.toggling}
          data-test-subj="argusKillSwitchConfirmModal"
        >
          <EuiText size="s">
            {currentlyEnabled
              ? 'Queued mutation intents will stop being auto-applied. In-flight rollbacks still complete.'
              : 'Trusted-tier mutations will resume auto-applying on the next tick.'}
          </EuiText>
          <EuiFormRow label="Reason (optional, recorded in the audit trail)">
            <EuiFieldText
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. investigating false positives on endpoint rules"
              data-test-subj="argusKillSwitchReason"
            />
          </EuiFormRow>
        </EuiConfirmModal>
      ) : null}
    </>
  );
};
