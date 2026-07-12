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
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useQueryClient } from '@kbn/react-query';
import type { DaybreakWorkflow } from '../../services/workflows_service';
import { useKibana } from '../hooks/use_kibana';
import { useWorkflows } from '../hooks/use_workflows';
import { useWorkflowExecutionStatus } from '../hooks/use_workflow_execution_status';

const WorkflowExecutionStatusBadge: React.FC<{ workflowId: string }> = ({ workflowId }) => {
  const { status, isLoading } = useWorkflowExecutionStatus(workflowId);
  if (isLoading) return <EuiLoadingSpinner size="s" />;
  if (!status || status.status === 'idle') return null;
  const color =
    status.status === 'completed' ? 'success' : status.status === 'failed' ? 'danger' : 'primary';
  const icon =
    status.status === 'in-motion' ? 'play' : status.status === 'completed' ? 'check' : 'alert';
  return (
    <EuiBadge
      color={color}
      iconType={icon}
      data-test-subj={`daybreakWorkflowExecutionStatus-${status.status}`}
    >
      {status.status.replace('-', ' ')}
    </EuiBadge>
  );
};

export const WorkflowsConsole: React.FC = () => {
  const queryClient = useQueryClient();
  const { workflows, isLoading } = useWorkflows();
  const [selectedWorkflowId, setSelectedWorkflowId] = React.useState<string>();
  const [deleteWorkflow, setDeleteWorkflow] = React.useState<DaybreakWorkflow>();
  const [isExecuting, setIsExecuting] = React.useState(false);
  const {
    services: { workflowsService },
  } = useKibana();

  const selected = workflows.find((workflow) => workflow.id === selectedWorkflowId);

  const invalidate = async () =>
    queryClient.invalidateQueries({ queryKey: ['daybreak', 'workflows'] });

  if (isLoading) return <EuiLoadingSpinner size="m" />;
  if (!workflows.length) {
    return (
      <EuiEmptyPrompt
        title={<h3>No workflows configured</h3>}
        body={<p>Create a Workflow and attach it to a Watch to begin executing.</p>}
      />
    );
  }

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
    setSelectedWorkflowId(undefined);
    await invalidate();
  };

  return (
    <section data-test-subj="daybreakWorkflowsConsole">
      <EuiText className="daybreakEyebrow" size="xs">
        AUTOMATION WORKFLOWS
      </EuiText>
      <EuiSpacer size="s" />
      <EuiTitle size="s">
        <h2>Workflows</h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="m" responsive>
        <EuiFlexItem grow={false} style={{ minWidth: 300 }}>
          <EuiFlexGroup direction="column" gutterSize="s">
            {workflows.map((workflow) => (
              <EuiFlexItem grow={false} key={workflow.id}>
                <EuiPanel
                  hasBorder
                  paddingSize="s"
                  color={selectedWorkflowId === workflow.id ? 'subdued' : 'plain'}
                  onClick={() => setSelectedWorkflowId(workflow.id)}
                  data-test-subj={`daybreakWorkflow-${workflow.id}`}
                >
                  <EuiFlexGroup
                    alignItems="center"
                    justifyContent="spaceBetween"
                    responsive={false}
                  >
                    <EuiFlexItem>
                      <EuiText size="s">
                        <strong>{workflow.name}</strong>
                      </EuiText>
                      <EuiText size="xs" color="subdued">
                        {workflow.watchIds.length} linked watches · priority {workflow.priority}
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                        {workflow.activeExecutionId && (
                          <EuiFlexItem grow={false}>
                            <EuiBadge color="primary" iconType="play">
                              In motion
                            </EuiBadge>
                          </EuiFlexItem>
                        )}
                        <EuiFlexItem grow={false}>
                          <EuiBadge color={workflow.enabled ? 'success' : 'hollow'}>
                            {workflow.enabled ? 'enabled' : 'paused'}
                          </EuiBadge>
                        </EuiFlexItem>
                      </EuiFlexGroup>
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
              title={<h3>Select a Workflow</h3>}
              body={<p>Inspect configuration, execution history, and lifecycle controls.</p>}
            />
          ) : (
            <EuiPanel hasBorder paddingSize="l" data-test-subj="daybreakWorkflowDetail">
              <EuiTitle size="s">
                <h3>{selected.name}</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiDescriptionList
                type="responsiveColumn"
                listItems={[
                  { title: 'Trigger', description: selected.trigger },
                  { title: 'Outcome', description: selected.outcome },
                  {
                    title: 'Linked Watches',
                    description: selected.watchIds.join(', ') || 'None configured',
                  },
                  { title: 'Last run', description: selected.lastRunAt ?? 'Not yet run' },
                  {
                    title: 'Active execution',
                    description: selected.activeExecutionId ? (
                      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <EuiText size="s">{selected.activeExecutionId}</EuiText>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <WorkflowExecutionStatusBadge workflowId={selected.id} />
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    ) : (
                      'Idle'
                    ),
                  },
                ]}
              />
              <EuiSpacer size="m" />
              <EuiFlexGroup gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiButton onClick={() => toggleWorkflow(selected)}>
                    {selected.enabled ? 'Pause Workflow' : 'Enable Workflow'}
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    isLoading={isExecuting}
                    disabled={!selected.enabled || Boolean(selected.activeExecutionId)}
                    onClick={() => executeWorkflow(selected)}
                  >
                    Run now
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty color="danger" onClick={() => setDeleteWorkflow(selected)}>
                    Delete
                  </EuiButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="l" />
              <EuiText size="s">
                <strong>Execution history</strong>
              </EuiText>
              <EuiSpacer size="s" />
              {(selected.auditTrail?.length ?? 0) === 0 ? (
                <EuiText size="xs" color="subdued">
                  No recorded executions yet.
                </EuiText>
              ) : (
                <EuiFlexGroup direction="column" gutterSize="s">
                  {selected.auditTrail?.map((event, index) => (
                    <EuiFlexItem key={index} grow={false}>
                      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <EuiIcon
                            type={event.action === 'executed' ? 'play' : 'pencil'}
                            size="s"
                          />
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="s" style={{ textTransform: 'capitalize' }}>
                            {event.action}
                          </EuiText>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiText size="xs" color="subdued">
                            {new Date(event.timestamp).toLocaleString()}
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              )}
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
