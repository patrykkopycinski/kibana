/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useSse } from '../hooks/use_sse';
import { useInvestigations } from '../hooks/use_investigations';
import { useProposals } from '../hooks/use_proposals';
import type { DaybreakSse } from '../../services/sse_service';

const statusColor: Record<DaybreakSse['status'], 'success' | 'warning' | 'danger' | 'default'> = {
  open: 'warning',
  acknowledged: 'success',
  closed: 'success',
  escalated: 'danger',
};

export const SseConsole: React.FC = () => {
  const { sseEvents, isLoading, createFromProposal, createFromInvestigation } = useSse();
  const { investigations } = useInvestigations();
  const { proposals } = useProposals();
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const selected = sseEvents.find((s) => s.id === selectedId);
  const escalatedInvestigations = investigations.filter((i) => i.status === 'escalated');
  const escalatedProposals = proposals.filter((p) => p.status === 'escalated');

  return (
    <div className="daybreakAppPage" data-test-subj="daybreakSseConsole">
      <EuiFlexGroup gutterSize="m" style={{ height: '100%' }}>
        <EuiFlexItem grow={1}>
          <EuiPanel>
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
              <EuiFlexItem>
                <EuiTitle size="s">
                  <h2>Significant Security Events</h2>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup gutterSize="s">
                  {escalatedInvestigations.length > 0 && (
                    <EuiButton
                      size="s"
                      onClick={() =>
                        createFromInvestigation.mutate(escalatedInvestigations[0].id, {
                          onSuccess: (sse) => setSelectedId(sse.id),
                        })
                      }
                      isLoading={createFromInvestigation.isLoading}
                      data-test-subj="daybreakCreateSseFromInvestigationButton"
                    >
                      Emit from investigation
                    </EuiButton>
                  )}
                  {escalatedProposals.length > 0 && (
                    <EuiButton
                      size="s"
                      onClick={() =>
                        createFromProposal.mutate(escalatedProposals[0].id, {
                          onSuccess: (sse) => setSelectedId(sse.id),
                        })
                      }
                      isLoading={createFromProposal.isLoading}
                      data-test-subj="daybreakCreateSseFromProposalButton"
                    >
                      Emit from proposal
                    </EuiButton>
                  )}
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
            {isLoading ? (
              <EuiLoadingSpinner size="m" />
            ) : sseEvents.length === 0 ? (
              <EuiEmptyPrompt
                title={<h3>No SSEs yet</h3>}
                body={<p>Create an SSE from an escalated investigation or proposal.</p>}
              />
            ) : (
              <EuiFlexGroup direction="column" gutterSize="s">
                {sseEvents.map((sse) => (
                  <EuiPanel
                    key={sse.id}
                    hasShadow={false}
                    hasBorder
                    paddingSize="s"
                    onClick={() => setSelectedId(sse.id)}
                    style={{ cursor: 'pointer' }}
                    className={selectedId === sse.id ? 'euiPanel--selected' : ''}
                  >
                    <EuiText size="s">
                      <strong>{sse.title}</strong>
                    </EuiText>
                    <EuiText size="xs" color="subdued">
                      {sse.status} · {sse.findingType} · {sse.severity} ·{' '}
                      {Math.round(sse.confidence * 100)}% confidence
                    </EuiText>
                  </EuiPanel>
                ))}
              </EuiFlexGroup>
            )}
          </EuiPanel>
        </EuiFlexItem>

        <EuiFlexItem grow={2}>
          {selected ? (
            <SseDetail sse={selected} />
          ) : (
            <EuiPanel>
              <EuiEmptyPrompt
                title={<h3>Select an SSE</h3>}
                body={<p>View the description, recommended actions, and destinations here.</p>}
              />
            </EuiPanel>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

const SseDetail: React.FC<{ sse: DaybreakSse }> = ({ sse }) => (
  <EuiPanel>
    <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
      <EuiFlexItem>
        <EuiTitle size="s">
          <h2>{sse.title}</h2>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText color={statusColor[sse.status]}>
          <strong>{sse.status.toUpperCase()}</strong>
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="m" />
    <EuiText size="s">
      <strong>Description:</strong> {sse.description}
    </EuiText>
    <EuiSpacer size="m" />
    <EuiText size="s">
      <strong>Finding type:</strong> {sse.findingType} · <strong>Severity:</strong>{' '}
      <span style={{ color: 'inherit' }}>{sse.severity}</span> · <strong>Confidence:</strong>{' '}
      {Math.round(sse.confidence * 100)}%
    </EuiText>
    <EuiSpacer size="m" />
    <EuiText size="s">
      <strong>Recommended actions</strong>
    </EuiText>
    <EuiSpacer size="xs" />
    {sse.recommendedActions.map((action) => (
      <EuiPanel key={action.id} hasShadow={false} hasBorder paddingSize="s">
        <EuiText size="s">{action.description}</EuiText>
        <EuiText size="xs" color="subdued">
          autonomy: {action.autonomyRequired}
        </EuiText>
      </EuiPanel>
    ))}
    <EuiSpacer size="m" />
    <EuiText size="s">
      <strong>Entities</strong>
    </EuiText>
    <EuiSpacer size="xs" />
    {sse.entities.length === 0 ? (
      <EuiText size="s" color="subdued">
        No entities.
      </EuiText>
    ) : (
      sse.entities.map((entity, idx) => (
        <EuiText key={idx} size="s">
          - {entity}
        </EuiText>
      ))
    )}
    <EuiSpacer size="m" />
    <EuiText size="s">
      <strong>Destinations</strong>
    </EuiText>
    <EuiSpacer size="xs" />
    {sse.destinations.length === 0 ? (
      <EuiText size="s" color="subdued">
        No destinations configured.
      </EuiText>
    ) : (
      sse.destinations.map((destination) => (
        <EuiText key={destination.id} size="s">
          - {destination.kind} {destination.reference ? `(${destination.reference})` : ''}
        </EuiText>
      ))
    )}
    <EuiSpacer size="m" />
    <EuiText size="xs" color="subdued">
      Source investigation: {sse.sourceInvestigationId ?? 'none'} · Source proposal:{' '}
      {sse.sourceProposalId ?? 'none'}
    </EuiText>
  </EuiPanel>
);
