/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButton, EuiCallOut, EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useProposalTransition } from '../../hooks/use_proposal_transition';
import type { DaybreakProposal, MissingRequirement } from '../../../services/proposals_service';
import { GateTierBadge } from './gate_tier_badge';
import { deriveGateTier } from './gate_tier';

/**
 * Human-readable label for a single gate {@link MissingRequirement} (FR-018).
 * Kept as a plain function (not JSX) so it can be joined into a single
 * `EuiCallOut` body without an intermediate list component — there are only
 * two possible values today (see `MissingRequirement` in
 * `services/proposals_service.ts`), and inlining is clearer than an
 * abstraction with a single caller (constitution gate 1/6: 2+ consumers).
 */
const missingRequirementLabel = (requirement: MissingRequirement): string => {
  switch (requirement) {
    case 'evidence':
      return i18n.translate('xpack.daybreak.gate.missingRequirement.evidence', {
        defaultMessage: 'evidence',
      });
    case 'recommendation':
      return i18n.translate('xpack.daybreak.gate.missingRequirement.recommendation', {
        defaultMessage: 'recommendation',
      });
  }
};

/**
 * Renders a Proposal's {@link GateTierBadge} and, for the
 * `approval-required` tier only, the human-approval action that POSTs to
 * `/proposals/{id}/transition` via {@link useProposalTransition} (FR-016,
 * FR-7). The readiness gate itself stays server-side
 * (`server/client/proposals/gate.ts`'s `evaluateReadinessGate`) — this
 * component never grants approval locally, it only triggers the request and
 * surfaces the specific `missingRequirements` the gate reports back on a 422
 * fail-closed rejection (FR-018), mirroring
 * `use_proposal_transition.test.tsx`'s fixture shape.
 *
 * `auto` and `propose` tier Proposals render only the badge — matching the
 * prototype's "read & gather auto-runs / assemble & draft proposed as a
 * diff" phases, which require no human approval action
 * (`.ao/recon.md` section 4.2).
 */
export const GateApproval: React.FC<{ proposal: DaybreakProposal }> = ({ proposal }) => {
  const tier = deriveGateTier(proposal);
  const { transition, isLoading, missingRequirements } = useProposalTransition();

  const handleApprove = () => {
    void transition({ id: proposal.id, targetStatus: 'approved' });
  };

  return (
    <div data-test-subj="daybreakGateApproval">
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <GateTierBadge tier={tier} />
        </EuiFlexItem>
        {tier === 'approval-required' && (
          <EuiFlexItem grow={false}>
            <EuiButton
              data-test-subj="daybreakGateApproveButton"
              size="s"
              isLoading={isLoading}
              onClick={handleApprove}
            >
              <FormattedMessage id="xpack.daybreak.gate.approve" defaultMessage="Approve" />
            </EuiButton>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {missingRequirements && missingRequirements.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            data-test-subj="daybreakGateApprovalFailure"
            color="danger"
            size="s"
            title={
              <FormattedMessage
                id="xpack.daybreak.gate.approvalFailedTitle"
                defaultMessage="Cannot approve: missing {requirements}"
                values={{
                  requirements: missingRequirements.map(missingRequirementLabel).join(', '),
                }}
              />
            }
          />
        </>
      )}
    </div>
  );
};
