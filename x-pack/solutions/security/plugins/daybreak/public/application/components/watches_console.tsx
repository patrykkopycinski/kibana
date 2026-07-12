/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiDescriptionList,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useQueryClient } from '@kbn/react-query';
import type { DaybreakProposal } from '../../services/proposals_service';
import type { DaybreakWatch } from '../../services/watches_service';
import { useKibana } from '../hooks/use_kibana';
import { useProposals } from '../hooks/use_proposals';
import { useWatches } from '../hooks/use_watches';

const proposalColor: Record<DaybreakProposal['severity'], 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

const LinkedProposals: React.FC<{ watchId: string }> = ({ watchId }) => {
  const { proposals } = useProposals();
  const linked = proposals.filter((proposal) => proposal.sourceWatch === watchId);

  return (
    <>
      <EuiText size="s">
        <strong>Proposal activity</strong>
      </EuiText>
      <EuiSpacer size="s" />
      {linked.length === 0 ? (
        <EuiText size="xs" color="subdued">
          No proposals have been produced by this Watch yet.
        </EuiText>
      ) : (
        linked.map((proposal) => (
          <EuiPanel key={proposal.id} hasBorder paddingSize="s">
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem>
                <EuiText size="s">
                  <strong>{proposal.title}</strong>
                </EuiText>
                <EuiText size="xs" color="subdued">
                  {proposal.status} · {Math.round(proposal.confidence * 100)}% confidence
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiHealth color={proposalColor[proposal.severity]}>{proposal.severity}</EuiHealth>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        ))
      )}
    </>
  );
};

export const WatchesConsole: React.FC = () => {
  const queryClient = useQueryClient();
  const { watches, isLoading } = useWatches();
  const [selectedWatchId, setSelectedWatchId] = React.useState<string>();
  const [updatingWatchId, setUpdatingWatchId] = React.useState<string>();
  const {
    services: { watchesService },
  } = useKibana();

  const selected = watches.find((watch) => watch.id === selectedWatchId);

  const invalidate = async () =>
    queryClient.invalidateQueries({ queryKey: ['daybreak', 'watches'] });

  if (isLoading) return <EuiLoadingSpinner size="m" />;
  if (!watches.length) {
    return (
      <EuiEmptyPrompt
        title={<h3>No watches configured</h3>}
        body={<p>Create a Watch to begin monitoring and producing proposals.</p>}
      />
    );
  }

  const toggleWatch = async (watch: DaybreakWatch) => {
    await watchesService.update(watch.id, {
      status: watch.status === 'active' ? 'paused' : 'active',
    });
    await invalidate();
  };
  const updateAutonomy = async (
    watch: DaybreakWatch,
    autonomyTier: DaybreakWatch['autonomyTier']
  ) => {
    setUpdatingWatchId(watch.id);
    try {
      await watchesService.update(watch.id, { autonomyTier });
      await invalidate();
    } finally {
      setUpdatingWatchId(undefined);
    }
  };

  return (
    <section data-test-subj="daybreakWatchesConsole">
      <EuiText className="daybreakEyebrow" size="xs">
        AUTOMATION WATCHES
      </EuiText>
      <EuiSpacer size="s" />
      <EuiTitle size="s">
        <h2>Watches</h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="m" responsive>
        <EuiFlexItem grow={false} style={{ minWidth: 300 }}>
          <EuiFlexGroup direction="column" gutterSize="s">
            {watches.map((watch) => (
              <EuiFlexItem grow={false} key={watch.id}>
                <EuiPanel
                  hasBorder
                  paddingSize="s"
                  color={selectedWatchId === watch.id ? 'subdued' : 'plain'}
                  onClick={() => setSelectedWatchId(watch.id)}
                  data-test-subj={`daybreakWatch-${watch.id}`}
                >
                  <EuiFlexGroup
                    alignItems="center"
                    justifyContent="spaceBetween"
                    responsive={false}
                  >
                    <EuiFlexItem>
                      <EuiText size="s">
                        <strong>{watch.name}</strong>
                      </EuiText>
                      <EuiText size="xs" color="subdued">
                        {watch.surface}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge color={watch.status === 'active' ? 'success' : 'hollow'}>
                        {watch.status}
                      </EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          {!selected ? (
            <EuiEmptyPrompt
              title={<h3>Select a Watch</h3>}
              body={<p>Inspect configuration, linked activity, and safe lifecycle controls.</p>}
            />
          ) : (
            <EuiPanel hasBorder paddingSize="l" data-test-subj="daybreakWatchDetail">
              <EuiTitle size="s">
                <h3>{selected.name}</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiDescriptionList
                type="responsiveColumn"
                listItems={[
                  { title: 'Surface', description: selected.surface },
                  {
                    title: 'Skills',
                    description: selected.skillIds.join(', ') || 'None configured',
                  },
                ]}
              />
              <EuiSpacer size="m" />
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiSelect
                    compressed
                    value={selected.autonomyTier}
                    onChange={(event) =>
                      updateAutonomy(selected, event.target.value as DaybreakWatch['autonomyTier'])
                    }
                    isLoading={updatingWatchId === selected.id}
                    disabled={updatingWatchId === selected.id}
                    data-test-subj="daybreakWatchAutonomySelect"
                    options={[
                      { value: 'auto-run', text: 'Auto-run' },
                      { value: 'proposed-diff', text: 'Proposed diff' },
                      { value: 'approval-required', text: 'Approval required' },
                    ]}
                    aria-label="Watch autonomy tier"
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton onClick={() => toggleWatch(selected)}>
                    {selected.status === 'active' ? 'Pause Watch' : 'Activate Watch'}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="l" />
              <LinkedProposals watchId={selected.id} />
            </EuiPanel>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </section>
  );
};
