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
import { useInvestigations } from '../hooks/use_investigations';
import { useProposals } from '../hooks/use_proposals';
import type { DaybreakInvestigation } from '../../services/investigations_service';

const statusColor: Record<DaybreakInvestigation['status'], 'success' | 'warning' | 'danger'> = {
  open: 'warning',
  escalated: 'danger',
  closed: 'success',
};

export const InvestigationsConsole: React.FC = () => {
  const { investigations, isLoading, createFromProposal, enrich, runWorker, runForensic } = useInvestigations();
  const { proposals } = useProposals();
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const selected = investigations.find((i) => i.id === selectedId);
  const escalatedProposals = proposals.filter((p) => p.status === 'escalated');

  return (
    <div className="daybreakAppPage" data-test-subj="daybreakInvestigationsConsole">
      <EuiFlexGroup gutterSize="m" style={{ height: '100%' }}>
        <EuiFlexItem grow={1}>
          <EuiPanel>
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
              <EuiFlexItem>
                <EuiTitle size="s">
                  <h2>Investigations</h2>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                {escalatedProposals.length > 0 && (
                  <EuiButton
                    size="s"
                    onClick={() =>
                      createFromProposal.mutate(escalatedProposals[0].id, {
                        onSuccess: (investigation) => setSelectedId(investigation.id),
                      })
                    }
                    isLoading={createFromProposal.isLoading}
                    data-test-subj="daybreakCreateInvestigationButton"
                  >
                    Create from latest escalated proposal
                  </EuiButton>
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
            {isLoading ? (
              <EuiLoadingSpinner size="m" />
            ) : investigations.length === 0 ? (
              <EuiEmptyPrompt
                title={<h3>No investigations yet</h3>}
                body={<p>Escalate a proposal from the Brief tab to create an investigation.</p>}
              />
            ) : (
              <EuiFlexGroup direction="column" gutterSize="s">
                {investigations.map((investigation) => (
                  <EuiPanel
                    key={investigation.id}
                    hasShadow={false}
                    hasBorder
                    paddingSize="s"
                    onClick={() => setSelectedId(investigation.id)}
                    style={{ cursor: 'pointer' }}
                    className={selectedId === investigation.id ? 'euiPanel--selected' : ''}
                  >
                    <EuiText size="s">
                      <strong>{investigation.title}</strong>
                    </EuiText>
                    <EuiText size="xs" color="subdued">
                      {investigation.status} · {investigation.hypotheses.length} hypotheses ·{' '}
                      {investigation.entities.length} entities
                    </EuiText>
                  </EuiPanel>
                ))}
              </EuiFlexGroup>
            )}
          </EuiPanel>
        </EuiFlexItem>

        <EuiFlexItem grow={2}>
          {selected ? (
            <InvestigationDetail
              investigation={selected}
              onEnrich={() => enrich.mutate(selected.id)}
              onRunWorker={() => runWorker.mutate(selected.id)}
              onRunForensic={() => runForensic.mutate(selected.id)}
              isEnriching={enrich.isLoading}
              isRunningWorker={runWorker.isLoading}
              isRunningForensic={runForensic.isLoading}
            />
          ) : (
            <EuiPanel>
              <EuiEmptyPrompt
                title={<h3>Select an investigation</h3>}
                body={<p>View hypotheses, timeline, and entities here.</p>}
              />
            </EuiPanel>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

const InvestigationDetail: React.FC<{
  investigation: DaybreakInvestigation;
  onEnrich: () => void;
  onRunWorker: () => void;
  onRunForensic: () => void;
  isEnriching: boolean;
  isRunningWorker: boolean;
  isRunningForensic: boolean;
}> = ({
  investigation,
  onEnrich,
  onRunWorker,
  onRunForensic,
  isEnriching,
  isRunningWorker,
  isRunningForensic,
}) => (
  <EuiPanel>
    <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
      <EuiFlexItem>
        <EuiTitle size="s">
          <h2>{investigation.title}</h2>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="s" alignItems="center">
          <EuiText color={statusColor[investigation.status]}>
            <strong>{investigation.status.toUpperCase()}</strong>
          </EuiText>
          <EuiButton
            size="s"
            onClick={onEnrich}
            isLoading={isEnriching}
            data-test-subj="daybreakEnrichInvestigationButton"
          >
            Enrich
          </EuiButton>
          <EuiButton
            size="s"
            onClick={onRunWorker}
            isLoading={isRunningWorker}
            data-test-subj="daybreakRunInvestigationWorkerButton"
          >
            Run worker
          </EuiButton>
          {investigation.status === 'escalated' && (
            <EuiButton
              size="s"
              color="warning"
              onClick={onRunForensic}
              isLoading={isRunningForensic}
              data-test-subj="daybreakRunForensicButton"
            >
              Run forensic
            </EuiButton>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="m" />
    <EuiText size="s">
      <strong>Summary:</strong> {investigation.summary}
    </EuiText>
    <EuiSpacer size="m" />
    <EuiText size="s">
      <strong>Hypotheses</strong>
    </EuiText>
    <EuiSpacer size="xs" />
    {investigation.hypotheses.map((h) => (
      <EuiPanel key={h.id} hasShadow={false} hasBorder paddingSize="s">
        <EuiText size="s">{h.statement}</EuiText>
        <EuiText size="xs" color="subdued">
          confidence: {Math.round(h.confidence * 100)}% · status: {h.status}
        </EuiText>
      </EuiPanel>
    ))}
    <EuiSpacer size="m" />
    <EuiText size="s">
      <strong>Timeline</strong>
    </EuiText>
    <EuiSpacer size="xs" />
    {investigation.timeline.map((entry, idx) => (
      <EuiText key={idx} size="s">
        {entry.timestamp}: {entry.description}
      </EuiText>
    ))}
    <EuiSpacer size="m" />
    <EuiText size="s">
      <strong>Entities</strong>
    </EuiText>
    <EuiSpacer size="xs" />
    {investigation.entities.map((entity) => (
      <EuiText key={entity.id} size="s">
        {entity.name} ({entity.type}) — {entity.relevance}
      </EuiText>
    ))}
    <EuiSpacer size="m" />
    <EuiText size="s">
      <strong>Open questions</strong>
    </EuiText>
    <EuiSpacer size="xs" />
    {investigation.openQuestions.map((question, idx) => (
      <EuiText key={idx} size="s">
        - {question}
      </EuiText>
    ))}
    <EuiSpacer size="m" />
    <EuiText size="xs" color="subdued">
      Source proposal: {investigation.sourceProposalId}
    </EuiText>
  </EuiPanel>
);
