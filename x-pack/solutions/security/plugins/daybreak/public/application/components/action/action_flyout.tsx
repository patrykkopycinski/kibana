/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCheckableCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { DaybreakProposal } from '../../../services/proposals_service';

export interface BlastRow {
  icon: string;
  text: string;
  safe?: boolean;
}

export interface GatedAction {
  label: string;
  cta: string;
  tone: 'danger' | 'warning';
  permNote: string;
  blast: BlastRow[];
}

interface ActionFlyoutProps {
  proposal: DaybreakProposal;
  action: GatedAction;
  onClose: () => void;
  onConfirm: () => void;
}

export const ActionFlyout: React.FC<ActionFlyoutProps> = ({
  proposal,
  action,
  onClose,
  onConfirm,
}) => {
  const [alwaysAllow, setAlwaysAllow] = React.useState(false);
  return (
    <EuiModal
      onClose={onClose}
      className="daybreakActionFlyout"
      data-test-subj="daybreakActionFlyout"
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiIcon type="lock" size="l" />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiTitle size="s">
                <h2>{action.label}</h2>
              </EuiTitle>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiPanel className="daybreakActionContext" paddingSize="s" color="subdued">
          <EuiText size="xs" className="daybreakEyebrow">
            ACTION CONTEXT
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiText size="s">
            <strong>{proposal.title}</strong>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {proposal.severity} severity · {Math.round(proposal.confidence * 100)}% confidence
          </EuiText>
        </EuiPanel>
        <EuiSpacer size="m" />
        <EuiText size="xs" className="daybreakEyebrow">
          BLAST RADIUS
        </EuiText>
        <EuiSpacer size="xs" />
        {action.blast.map((row, index) => (
          <div key={index} className="daybreakBlastRow">
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiIcon type={row.icon} color={row.safe ? 'success' : 'danger'} />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="s" color={row.safe ? 'default' : 'danger'}>
                  {row.text}
                </EuiText>
              </EuiFlexItem>
              {row.safe && (
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="success">
                    safe
                  </EuiText>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </div>
        ))}
        <EuiSpacer size="m" />
        <EuiText size="s" color="subdued">
          <EuiIcon type="user" size="s" /> You — Operator — {action.permNote}
        </EuiText>
        <EuiSpacer size="m" />
        <EuiCheckableCard
          id="always-allow"
          label="Always allow this action in this case — stop asking"
          checked={alwaysAllow}
          onChange={() => setAlwaysAllow((value) => !value)}
          data-test-subj="daybreakActionFlyoutAlwaysAllow"
        />
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onClose}>Cancel</EuiButtonEmpty>
        <EuiButton
          color={action.tone === 'danger' ? 'danger' : 'warning'}
          fill
          onClick={onConfirm}
          data-test-subj="daybreakActionFlyoutConfirm"
        >
          {action.cta}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};
