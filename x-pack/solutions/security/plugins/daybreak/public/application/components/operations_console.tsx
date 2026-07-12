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
  EuiButtonEmpty,
  EuiConfirmModal,
  EuiDescriptionList,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useQueryClient } from '@kbn/react-query';
import type { DaybreakProposal } from '../../services/proposals_service';
import type { DaybreakWatch } from '../../services/watches_service';
import type { DaybreakWorkflow } from '../../services/workflows_service';
import { useKibana } from '../hooks/use_kibana';
import { useProposals } from '../hooks/use_proposals';
import { useWatches } from '../hooks/use_watches';
import { useWorkflows } from '../hooks/use_workflows';

const proposalColor: Record<DaybreakProposal['severity'], 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

type Selection =
  | { kind: 'watch'; value: DaybreakWatch }
  | { kind: 'workflow'; value: DaybreakWorkflow };

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

const AutomationList: React.FC<{
  watches: DaybreakWatch[];
  workflows: DaybreakWorkflow[];
  selected?: Selection;
  onSelect: (selection: Selection) => void;
}> = ({ watches, workflows, selected, onSelect }) => (
  <EuiFlexGroup direction="column" gutterSize="s">
    <EuiFlexItem grow={false}>
      <EuiText size="s">
        <strong>Watches</strong>
      </EuiText>
    </EuiFlexItem>
    {watches.map((watch) => (
      <EuiFlexItem grow={false} key={watch.id}>
        <EuiPanel
          hasBorder
          paddingSize="s"
          color={selected?.kind === 'watch' && selected.value.id === watch.id ? 'subdued' : 'plain'}
          onClick={() => onSelect({ kind: 'watch', value: watch })}
          data-test-subj={`daybreakWatch-${watch.id}`}
        >
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
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
    <EuiSpacer size="s" />
    <EuiFlexItem grow={false}>
      <EuiText size="s">
        <strong>Workflows</strong>
      </EuiText>
    </EuiFlexItem>
    {workflows.map((workflow) => (
      <EuiFlexItem grow={false} key={workflow.id}>
        <EuiPanel
          hasBorder
          paddingSize="s"
          color={
            selected?.kind === 'workflow' && selected.value.id === workflow.id ? 'subdued' : 'plain'
          }
          onClick={() => onSelect({ kind: 'workflow', value: workflow })}
          data-test-subj={`daybreakWorkflow-${workflow.id}`}
        >
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem>
              <EuiText size="s">
                <strong>{workflow.name}</strong>
              </EuiText>
              <EuiText size="xs" color="subdued">
                {workflow.watchIds.length} linked watches · priority {workflow.priority}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color={workflow.enabled ? 'success' : 'hollow'}>
                {workflow.enabled ? 'enabled' : 'paused'}
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);

export const OperationsConsole: React.FC = () => {
  const queryClient = useQueryClient();
  const { watches, isLoading: watchesLoading } = useWatches();
  const { workflows, isLoading: workflowsLoading } = useWorkflows();
  const [selected, setSelected] = React.useState<Selection>();
  const [deleteWorkflow, setDeleteWorkflow] = React.useState<DaybreakWorkflow>();
  const [isExecuting, setIsExecuting] = React.useState(false);
  const {
    services: { watchesService, workflowsService },
  } = useKibana();

  const invalidate = async () =>
    queryClient
      .invalidateQueries({ queryKey: ['daybreak', 'watches'] })
      .then(() => queryClient.invalidateQueries({ queryKey: ['daybreak', 'workflows'] }));
  const isLoading = watchesLoading || workflowsLoading;

  if (isLoading) return <EuiLoadingSpinner size="m" />;
  if (!watches.length && !workflows.length) {
    return (
      <EuiEmptyPrompt
        title={<h3>No automations configured</h3>}
        body={<p>Create a Watch and attach a Workflow to begin monitoring.</p>}
      />
    );
  }

  const toggleWatch = async (watch: DaybreakWatch) => {
    await watchesService.update(watch.id, {
      status: watch.status === 'active' ? 'paused' : 'active',
    });
    await invalidate();
  };
  const toggleWorkflow = async (workflow: DaybreakWorkflow) => {
    await workflowsService.update(workflow.id, { enabled: !workflow.enabled });
    await invalidate();
  };
  const executeWorkflow = async (workflow: DaybreakWorkflow) => {
    setIsExecuting(true);
    try {
      await workflowsService.execute(workflow.id);
      await invalidate();
    } finally {
      setIsExecuting(false);
    }
  };
  const confirmDelete = async () => {
    if (!deleteWorkflow) return;
    await workflowsService.delete(deleteWorkflow.id);
    setDeleteWorkflow(undefined);
    setSelected(undefined);
    await invalidate();
  };

  return (
    <section data-test-subj="daybreakOperationsConsole">
      <EuiText className="daybreakEyebrow" size="xs">
        AUTOMATION CONTROL PLANE
      </EuiText>
      <EuiSpacer size="s" />
      <EuiTitle size="s">
        <h2>Watches and workflows</h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="m" responsive>
        <EuiFlexItem grow={false} style={{ minWidth: 300 }}>
          <AutomationList
            watches={watches}
            workflows={workflows}
            selected={selected}
            onSelect={setSelected}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          {!selected ? (
            <EuiEmptyPrompt
              title={<h3>Select a Watch or Workflow</h3>}
              body={<p>Inspect configuration, linked activity, and safe lifecycle controls.</p>}
            />
          ) : selected.kind === 'watch' ? (
            <EuiPanel hasBorder paddingSize="l" data-test-subj="daybreakWatchDetail">
              <EuiTitle size="s">
                <h3>{selected.value.name}</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiDescriptionList
                type="responsiveColumn"
                listItems={[
                  { title: 'Surface', description: selected.value.surface },
                  { title: 'Autonomy', description: selected.value.autonomyTier },
                  {
                    title: 'Skills',
                    description: selected.value.skillIds.join(', ') || 'None configured',
                  },
                ]}
              />
              <EuiSpacer size="m" />
              <EuiButton onClick={() => toggleWatch(selected.value)}>
                {selected.value.status === 'active' ? 'Pause Watch' : 'Activate Watch'}
              </EuiButton>
              <EuiSpacer size="l" />
              <LinkedProposals watchId={selected.value.id} />
            </EuiPanel>
          ) : (
            <EuiPanel hasBorder paddingSize="l" data-test-subj="daybreakWorkflowDetail">
              <EuiTitle size="s">
                <h3>{selected.value.name}</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiDescriptionList
                type="responsiveColumn"
                listItems={[
                  { title: 'Trigger', description: selected.value.trigger },
                  { title: 'Outcome', description: selected.value.outcome },
                  {
                    title: 'Linked Watches',
                    description: selected.value.watchIds.join(', ') || 'None configured',
                  },
                  { title: 'Last run', description: selected.value.lastRunAt ?? 'Not yet run' },
                ]}
              />
              <EuiSpacer size="m" />
              <EuiFlexGroup gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiButton onClick={() => toggleWorkflow(selected.value)}>
                    {selected.value.enabled ? 'Pause Workflow' : 'Enable Workflow'}
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    isLoading={isExecuting}
                    disabled={!selected.value.enabled}
                    onClick={() => executeWorkflow(selected.value)}
                  >
                    Run now
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty color="danger" onClick={() => setDeleteWorkflow(selected.value)}>
                    Delete
                  </EuiButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
      {deleteWorkflow && (
        <EuiConfirmModal
          title="Delete workflow?"
          onCancel={() => setDeleteWorkflow(undefined)}
          onConfirm={confirmDelete}
          cancelButtonText="Keep workflow"
          confirmButtonText="Delete workflow"
          buttonColor="danger"
          defaultFocusedButton="confirm"
        >
          <p>This preserves its audit history but removes it from the active control plane.</p>
        </EuiConfirmModal>
      )}
    </section>
  );
};
