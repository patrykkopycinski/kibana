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
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DaybreakProposal } from '../../../services/proposals_service';
import type { DaybreakEvidence } from '../../../services/evidence_service';
import { PROPOSAL_STATUS_META } from './proposal_status';

/**
 * Detail panel for a single {@link DaybreakEvidence} entry (FR-012, FR-022).
 * Renders every {@link DaybreakEvidence} field the prototype's inspector
 * surface distinguishes evidence by (`kind`, `provenance`, `stance`,
 * `sensitivityLabel` — the four fields this component's spec traces
 * explicitly — plus `summary`, `confidence`, `sourceRef`, and `limitations`
 * so no evidence data is silently dropped from the inspector view).
 */
const EvidenceCard: React.FC<{ evidence: DaybreakEvidence }> = ({ evidence }) => (
  <EuiPanel
    data-test-subj={`daybreakInspectorEvidence-${evidence.id}`}
    paddingSize="s"
    hasShadow={false}
    hasBorder
  >
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
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
          data-test-subj={`daybreakInspectorEvidenceStance-${evidence.id}`}
          color={evidence.stance === 'for' ? 'success' : 'danger'}
        >
          {evidence.stance}
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
    <EuiText size="s" data-test-subj={`daybreakInspectorEvidenceSummary-${evidence.id}`}>
      {evidence.summary}
    </EuiText>
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
        ...(evidence.limitations && evidence.limitations.length > 0
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

/**
 * Renders the readiness-gate/evidence inspector for a single Proposal
 * (FR-012, FR-016). Surfaces the Proposal's current {@link
 * PROPOSAL_STATUS_META} state (one of the 7-value `ProposalStatus` union,
 * FR-019) alongside the full {@link DaybreakEvidence} detail for every
 * evidence document the caller resolved via `evidenceRefs` (FR-022) — the
 * prototype's `renderInspector` surface (`.ao/recon.md`'s thread →
 * stream/msg/spine/inspector decomposition), rebuilt here design-neutrally
 * ahead of the still-blocked prototype port (see `shell.tsx`'s header
 * comment, FR-001).
 *
 * Evidence resolution (matching `evidenceRefs` against the Evidence store)
 * is the caller's responsibility — this component is presentation-only so
 * it stays trivially testable against a fixture, mirroring `shell.tsx`'s
 * `DaybreakProposalDetail`.
 */
export const ProposalInspector: React.FC<{
  proposal: DaybreakProposal;
  evidence: DaybreakEvidence[];
}> = ({ proposal, evidence }) => {
  const statusMeta = PROPOSAL_STATUS_META[proposal.status];

  return (
    <div data-test-subj="daybreakProposalInspector">
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h4>{proposal.title}</h4>
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

      <EuiTitle size="xxxs">
        <h5>
          <FormattedMessage
            id="xpack.daybreak.inspector.evidence.heading"
            defaultMessage="Evidence ({count})"
            values={{ count: evidence.length }}
          />
        </h5>
      </EuiTitle>
      <EuiSpacer size="s" />

      {evidence.length === 0 ? (
        <EuiText size="s" color="subdued" data-test-subj="daybreakProposalInspectorEmpty">
          <FormattedMessage
            id="xpack.daybreak.inspector.evidence.empty"
            defaultMessage="No evidence attached to this proposal yet."
          />
        </EuiText>
      ) : (
        <EuiFlexGroup direction="column" gutterSize="s">
          {evidence.map((item) => (
            <EuiFlexItem key={item.id}>
              <EvidenceCard evidence={item} />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      )}
    </div>
  );
};
