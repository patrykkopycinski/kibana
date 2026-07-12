/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DaybreakProposal, DecisionRecord } from '../../../services/proposals_service';
import type { DaybreakEvidence } from '../../../services/evidence_service';
import { PROPOSAL_STATUS_META } from './proposal_status';

const decisionLabel = (decision?: DecisionRecord): string => {
  if (!decision) return 'No decision recorded';
  switch (decision.type) {
    case 'approve':
      return 'Approved';
    case 'modify':
      return 'Modified';
    case 'defer':
      return 'Deferred';
    case 'dismiss':
      return 'Dismissed';
    case 'escalate':
      return 'Escalated';
    default:
      return decision.type;
  }
};

const decisionColor = (
  decision?: DecisionRecord
): 'success' | 'primary' | 'warning' | 'danger' | 'subdued' => {
  if (!decision) return 'subdued';
  switch (decision.type) {
    case 'approve':
      return 'success';
    case 'modify':
      return 'primary';
    case 'defer':
      return 'warning';
    case 'dismiss':
      return 'subdued';
    case 'escalate':
      return 'danger';
    default:
      return 'subdued';
  }
};

const EvidenceCard: React.FC<{ evidence: DaybreakEvidence }> = ({ evidence }) => (
  <EuiPanel
    className="daybreakEvidenceCard"
    data-test-subj={`daybreakInspectorEvidence-${evidence.id}`}
    paddingSize="m"
    hasShadow={false}
    hasBorder
  >
    <EuiFlexGroup
      alignItems="center"
      justifyContent="spaceBetween"
      responsive={false}
      gutterSize="s"
    >
      <EuiFlexItem>
        <EuiText size="xs" color="subdued">
          EVIDENCE / {evidence.provenance}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge
          data-test-subj={`daybreakInspectorEvidenceStance-${evidence.id}`}
          color={evidence.stance === 'for' ? 'success' : 'danger'}
        >
          {evidence.stance}
        </EuiBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="s" />
    <EuiText size="s" data-test-subj={`daybreakInspectorEvidenceSummary-${evidence.id}`}>
      {evidence.summary}
    </EuiText>
    <EuiSpacer size="s" />
    <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiBadge data-test-subj={`daybreakInspectorEvidenceKind-${evidence.id}`}>
          {evidence.kind}
        </EuiBadge>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge
          data-test-subj={`daybreakInspectorEvidenceProvenance-${evidence.id}`}
          color="hollow"
        >
          {evidence.provenance}
        </EuiBadge>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge
          data-test-subj={`daybreakInspectorEvidenceSensitivity-${evidence.id}`}
          color="hollow"
        >
          {evidence.sensitivityLabel}
        </EuiBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="s" />
    <EuiDescriptionList
      data-test-subj={`daybreakInspectorEvidenceDetails-${evidence.id}`}
      type="column"
      compressed
      listItems={[
        {
          title: (
            <FormattedMessage
              id="xpack.daybreak.inspector.evidence.confidence"
              defaultMessage="Confidence"
            />
          ),
          description: evidence.confidence,
        },
        ...(evidence.sourceRef
          ? [
              {
                title: (
                  <FormattedMessage
                    id="xpack.daybreak.inspector.evidence.sourceRef"
                    defaultMessage="Source"
                  />
                ),
                description: evidence.sourceRef,
              },
            ]
          : []),
        ...(evidence.limitations?.length
          ? [
              {
                title: (
                  <FormattedMessage
                    id="xpack.daybreak.inspector.evidence.limitations"
                    defaultMessage="Limitations"
                  />
                ),
                description: evidence.limitations.join(', '),
              },
            ]
          : []),
      ]}
    />
  </EuiPanel>
);

export const ProposalInspector: React.FC<{
  proposal: DaybreakProposal;
  evidence: DaybreakEvidence[];
}> = ({ proposal, evidence }) => {
  const statusMeta = PROPOSAL_STATUS_META[proposal.status];

  return (
    <div data-test-subj="daybreakProposalInspector">
      <EuiText size="xs" color="subdued">
        DECISION EVIDENCE
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiFlexGroup
        alignItems="center"
        justifyContent="spaceBetween"
        responsive={false}
        gutterSize="s"
      >
        <EuiFlexItem>
          <EuiTitle size="s">
            <h3>{proposal.title}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge
            data-test-subj={`daybreakProposalInspectorStatus-${proposal.status}`}
            color={statusMeta.color}
          >
            {statusMeta.label()}
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiText size="s" color="subdued">
        Evidence is shown with provenance, stance, sensitivity, and caveats so the approver can
        assess both the recommendation and its limits.
      </EuiText>
      <EuiSpacer size="m" />
      {evidence.length === 0 ? (
        <EuiPanel hasBorder paddingSize="m">
          <EuiText size="s" color="subdued" data-test-subj="daybreakProposalInspectorEmpty">
            <FormattedMessage
              id="xpack.daybreak.inspector.evidence.empty"
              defaultMessage="No evidence attached to this proposal yet."
            />
          </EuiText>
        </EuiPanel>
      ) : (
        <EuiFlexGroup direction="column" gutterSize="s">
          {evidence.map((item) => (
            <EuiFlexItem key={item.id}>
              <EvidenceCard evidence={item} />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      )}

      <EuiSpacer size="l" />
      <EuiText size="xs" color="subdued">
        RECORDED DECISION
      </EuiText>
      <EuiSpacer size="xs" />
      {proposal.decision ? (
        <EuiPanel
          className="daybreakReceiptDecision"
          data-test-subj="daybreakProposalInspectorDecision"
          paddingSize="m"
          hasBorder
          color={decisionColor(proposal.decision)}
        >
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon type="document" size="s" />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="s">
                <strong data-test-subj="daybreakProposalInspectorDecisionType">
                  {decisionLabel(proposal.decision)}
                </strong>
              </EuiText>
              {proposal.decision.actor && (
                <EuiText
                  size="xs"
                  color="subdued"
                  data-test-subj="daybreakProposalInspectorDecisionActor"
                >
                  {proposal.decision.actor}
                </EuiText>
              )}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {new Date(proposal.decision.timestamp).toLocaleString()}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          {proposal.decision.reason && (
            <>
              <EuiSpacer size="s" />
              <EuiText size="s" data-test-subj="daybreakProposalInspectorDecisionReason">
                {proposal.decision.reason}
              </EuiText>
            </>
          )}
        </EuiPanel>
      ) : (
        <EuiText size="s" color="subdued" data-test-subj="daybreakProposalInspectorDecisionEmpty">
          No terminal decision recorded yet.
        </EuiText>
      )}

      <EuiSpacer size="l" />
      <EuiText size="xs" color="subdued">
        DECISION HISTORY / RECEIPT
      </EuiText>
      <EuiSpacer size="xs" />
      {(proposal.decisionHistory?.length ?? 0) === 0 ? (
        <EuiText size="s" color="subdued" data-test-subj="daybreakProposalInspectorHistoryEmpty">
          No decisions recorded yet.
        </EuiText>
      ) : (
        <EuiFlexGroup
          direction="column"
          gutterSize="s"
          data-test-subj="daybreakProposalInspectorHistory"
        >
          {proposal.decisionHistory?.map((entry, index) => (
            <EuiFlexItem key={index} grow={false}>
              <EuiPanel
                className="daybreakReceiptTrail"
                paddingSize="s"
                hasBorder
                hasShadow={false}
              >
                <EuiFlexGroup
                  alignItems="center"
                  justifyContent="spaceBetween"
                  gutterSize="s"
                  responsive={false}
                >
                  <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiIcon type="arrowRight" size="s" color="subdued" />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiText size="s">
                        {entry.fromStatus} → {entry.toStatus}
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      {new Date(entry.timestamp).toLocaleString()}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
                {(entry.actor || entry.reason) && (
                  <>
                    <EuiSpacer size="xs" />
                    <EuiFlexGroup gutterSize="s" responsive={false}>
                      {entry.actor && (
                        <EuiFlexItem grow={false}>
                          <EuiBadge color="hollow" data-test-subj={`daybreakHistoryActor-${index}`}>
                            {entry.actor}
                          </EuiBadge>
                        </EuiFlexItem>
                      )}
                      {entry.reason && (
                        <EuiFlexItem>
                          <EuiText
                            size="xs"
                            color="subdued"
                            data-test-subj={`daybreakHistoryReason-${index}`}
                          >
                            {entry.reason}
                          </EuiText>
                        </EuiFlexItem>
                      )}
                    </EuiFlexGroup>
                  </>
                )}
              </EuiPanel>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      )}
    </div>
  );
};
