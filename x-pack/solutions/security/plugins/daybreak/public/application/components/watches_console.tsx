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
  EuiDescriptionList,
  EuiEmptyPrompt,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLoadingSpinner,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { useQueryClient } from '@kbn/react-query';
import type { DaybreakProposal } from '../../services/proposals_service';
import type { DaybreakWatch } from '../../services/watches_service';
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

interface AutonomyLabels {
  throughline: string;
  catalog: string;
  operatingModel: string;
}

const AUTONOMY_LABELS: Record<DaybreakWatch['autonomyTier'], AutonomyLabels> = {
  'proposed-diff': {
    throughline: 'Suggest only / Reads auto',
    catalog: 'Suggest only / Monitor-only',
    operatingModel: 'Observe / Propose',
  },
  'auto-run': {
    throughline: 'Drafts auto',
    catalog: 'Human-on-the-loop / Supervised auto',
    operatingModel: 'Prepare',
  },
  'approval-required': {
    throughline: 'Acts · gated / Acts · trusted',
    catalog: 'Human-in-the-loop',
    operatingModel: 'Execute low-risk / Execute consequential',
  },
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

const LinkedWorkflows: React.FC<{ watchId: string }> = ({ watchId }) => {
  const { workflows } = useWorkflows();
  const linked = workflows.filter((workflow) => workflow.watchIds.includes(watchId));

  return (
    <>
      <EuiText size="s">
        <strong>Linked workflows</strong>
      </EuiText>
      <EuiSpacer size="s" />
      {linked.length === 0 ? (
        <EuiText size="xs" color="subdued">
          No workflows are linked to this Watch.
        </EuiText>
      ) : (
        linked.map((workflow) => (
          <EuiPanel key={workflow.id} hasBorder paddingSize="s">
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem>
                <EuiText size="s">
                  <strong>{workflow.name}</strong>
                </EuiText>
                <EuiText size="xs" color="subdued">
                  {workflow.trigger} · {workflow.enabled ? 'enabled' : 'disabled'}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color={workflow.enabled ? 'success' : 'hollow'}>
                  {workflow.enabled ? 'on' : 'off'}
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        ))
      )}
    </>
  );
};

interface WatchFormData {
  id: string;
  name: string;
  description: string;
  surface: string;
  status: DaybreakWatch['status'];
  autonomyTier: DaybreakWatch['autonomyTier'];
  skillIds: string;
  updatedAt?: string;
}

const emptyForm: WatchFormData = {
  id: '',
  name: '',
  description: '',
  surface: '',
  status: 'draft',
  autonomyTier: 'approval-required',
  skillIds: '',
};

const watchToForm = (watch: DaybreakWatch): WatchFormData => ({
  id: watch.id,
  name: watch.name,
  description: watch.description,
  surface: watch.surface,
  status: watch.status,
  autonomyTier: watch.autonomyTier,
  skillIds: watch.skillIds.join(', '),
  updatedAt: watch.updatedAt,
});

const formToWatch = (form: WatchFormData): Omit<DaybreakWatch, 'createdAt' | 'updatedAt'> => ({
  id: form.id.trim(),
  name: form.name.trim(),
  description: form.description.trim(),
  surface: form.surface.trim(),
  status: form.status,
  autonomyTier: form.autonomyTier,
  skillIds: form.skillIds
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
});

export const WatchesConsole: React.FC = () => {
  const queryClient = useQueryClient();
  const { watches, isLoading } = useWatches();
  const [selectedWatchId, setSelectedWatchId] = React.useState<string>();
  const [updatingWatchId, setUpdatingWatchId] = React.useState<string>();
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState<WatchFormData>(emptyForm);
  const [editForm, setEditForm] = React.useState<WatchFormData | null>(null);
  const [lastSavedForm, setLastSavedForm] = React.useState<WatchFormData | null>(null);
  const {
    services: { watchesService },
  } = useKibana();

  const selected = watches.find((watch) => watch.id === selectedWatchId);

  React.useEffect(() => {
    if (!selected) {
      setEditForm(null);
      setLastSavedForm(null);
      return;
    }
    if (selected.id !== editForm?.id || selected.updatedAt !== lastSavedForm?.updatedAt) {
      const form = watchToForm(selected);
      setEditForm(form);
      setLastSavedForm(form);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.updatedAt]);

  const invalidate = async () =>
    queryClient.invalidateQueries({ queryKey: ['daybreak', 'watches'] });

  if (isLoading) return <EuiLoadingSpinner size="m" />;

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

  const saveEdits = async () => {
    if (!selected || !editForm) return;
    setUpdatingWatchId(selected.id);
    try {
      const { id, ...updates } = formToWatch(editForm);
      const updated = await watchesService.update(selected.id, updates);
      const updatedForm = watchToForm(updated);
      setEditForm(updatedForm);
      setLastSavedForm(updatedForm);
      await invalidate();
    } finally {
      setUpdatingWatchId(undefined);
    }
  };

  const createWatch = async () => {
    const watch = formToWatch(createForm);
    if (!watch.id || !watch.name || !watch.surface) return;
    await watchesService.create(watch);
    await invalidate();
    setCreateForm(emptyForm);
    setIsCreateModalOpen(false);
  };

  const deleteWatch = async () => {
    if (!selected) return;
    await watchesService.delete(selected.id);
    await invalidate();
    setSelectedWatchId(undefined);
    setIsDeleteModalOpen(false);
  };

  const isFormDirty =
    lastSavedForm && editForm && JSON.stringify(lastSavedForm) !== JSON.stringify(editForm);

  const createModalId = useGeneratedHtmlId({ prefix: 'createWatchModal' });
  const deleteModalId = useGeneratedHtmlId({ prefix: 'deleteWatchModal' });

  return (
    <section data-test-subj="daybreakWatchesConsole">
      <EuiText className="daybreakEyebrow" size="xs">
        AUTOMATION WATCHES
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem>
          <EuiTitle size="s">
            <h2>Watches</h2>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            size="s"
            onClick={() => setIsCreateModalOpen(true)}
            data-test-subj="daybreakCreateWatchButton"
          >
            Create watch
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {!watches.length ? (
        <EuiEmptyPrompt
          title={<h3>No watches configured</h3>}
          body={<p>Create a Watch to begin monitoring and producing proposals.</p>}
          actions={
            <EuiButton fill onClick={() => setIsCreateModalOpen(true)}>
              Create watch
            </EuiButton>
          }
        />
      ) : (
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
            {!selected || !editForm ? (
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
                    { title: 'ID', description: selected.id },
                    { title: 'Surface', description: selected.surface },
                    {
                      title: 'Skills',
                      description: selected.skillIds.join(', ') || 'None configured',
                    },
                    {
                      title: 'Created',
                      description: new Date(selected.createdAt).toLocaleString(),
                    },
                    {
                      title: 'Updated',
                      description: new Date(selected.updatedAt).toLocaleString(),
                    },
                  ]}
                />
                <EuiSpacer size="m" />
                <EuiText size="s">
                  <strong>Edit details</strong>
                </EuiText>
                <EuiSpacer size="s" />
                <EuiFieldText
                  fullWidth
                  placeholder="Name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  data-test-subj="daybreakWatchNameInput"
                />
                <EuiSpacer size="s" />
                <EuiTextArea
                  fullWidth
                  placeholder="Description"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  data-test-subj="daybreakWatchDescriptionInput"
                />
                <EuiSpacer size="s" />
                <EuiFieldText
                  fullWidth
                  placeholder="Surface"
                  value={editForm.surface}
                  onChange={(e) => setEditForm({ ...editForm, surface: e.target.value })}
                  data-test-subj="daybreakWatchSurfaceInput"
                />
                <EuiSpacer size="s" />
                <EuiFieldText
                  fullWidth
                  placeholder="Skills (comma separated)"
                  value={editForm.skillIds}
                  onChange={(e) => setEditForm({ ...editForm, skillIds: e.target.value })}
                  data-test-subj="daybreakWatchSkillsInput"
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
                    <EuiText size="xs" color="subdued">
                      Throughline: {AUTONOMY_LABELS[selected.autonomyTier].throughline}
                      <br />
                      Catalog: {AUTONOMY_LABELS[selected.autonomyTier].catalog}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      onClick={() => toggleWatch(selected)}
                      disabled={updatingWatchId === selected.id}
                    >
                      {selected.status === 'active' ? 'Pause Watch' : 'Activate Watch'}
                    </EuiButton>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      fill
                      onClick={saveEdits}
                      isLoading={updatingWatchId === selected.id}
                      disabled={!isFormDirty || updatingWatchId === selected.id}
                      data-test-subj="daybreakWatchSaveButton"
                    >
                      Save changes
                    </EuiButton>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      color="danger"
                      onClick={() => setIsDeleteModalOpen(true)}
                      disabled={updatingWatchId === selected.id}
                      data-test-subj="daybreakWatchDeleteButton"
                    >
                      Delete
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiSpacer size="l" />
                <LinkedWorkflows watchId={selected.id} />
                <EuiSpacer size="l" />
                <LinkedProposals watchId={selected.id} />
              </EuiPanel>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      )}

      {isCreateModalOpen && (
        <EuiModal onClose={() => setIsCreateModalOpen(false)} id={createModalId}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Create watch</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiFieldText
              fullWidth
              placeholder="ID"
              value={createForm.id}
              onChange={(e) => setCreateForm({ ...createForm, id: e.target.value })}
              data-test-subj="daybreakCreateWatchIdInput"
            />
            <EuiSpacer size="s" />
            <EuiFieldText
              fullWidth
              placeholder="Name"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              data-test-subj="daybreakCreateWatchNameInput"
            />
            <EuiSpacer size="s" />
            <EuiTextArea
              fullWidth
              placeholder="Description"
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              data-test-subj="daybreakCreateWatchDescriptionInput"
            />
            <EuiSpacer size="s" />
            <EuiFieldText
              fullWidth
              placeholder="Surface"
              value={createForm.surface}
              onChange={(e) => setCreateForm({ ...createForm, surface: e.target.value })}
              data-test-subj="daybreakCreateWatchSurfaceInput"
            />
            <EuiSpacer size="s" />
            <EuiSelect
              fullWidth
              value={createForm.status}
              onChange={(e) =>
                setCreateForm({ ...createForm, status: e.target.value as DaybreakWatch['status'] })
              }
              options={[
                { value: 'draft', text: 'Draft' },
                { value: 'active', text: 'Active' },
                { value: 'paused', text: 'Paused' },
              ]}
              data-test-subj="daybreakCreateWatchStatusInput"
            />
            <EuiSpacer size="s" />
            <EuiSelect
              fullWidth
              value={createForm.autonomyTier}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  autonomyTier: e.target.value as DaybreakWatch['autonomyTier'],
                })
              }
              options={[
                { value: 'approval-required', text: 'Approval required (Human-in-the-loop)' },
                { value: 'proposed-diff', text: 'Proposed diff (Suggest / Monitor)' },
                { value: 'auto-run', text: 'Auto-run (Draft / Supervised)' },
              ]}
              data-test-subj="daybreakCreateWatchAutonomyInput"
            />
            <EuiSpacer size="s" />
            <EuiFieldText
              fullWidth
              placeholder="Skills (comma separated)"
              value={createForm.skillIds}
              onChange={(e) => setCreateForm({ ...createForm, skillIds: e.target.value })}
              data-test-subj="daybreakCreateWatchSkillsInput"
            />
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => setIsCreateModalOpen(false)}>Cancel</EuiButtonEmpty>
            <EuiButton
              fill
              onClick={createWatch}
              disabled={!createForm.id.trim() || !createForm.name.trim() || !createForm.surface.trim()}
              data-test-subj="daybreakCreateWatchSubmitButton"
            >
              Create
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}

      {isDeleteModalOpen && selected && (
        <EuiModal onClose={() => setIsDeleteModalOpen(false)} id={deleteModalId}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Delete watch?</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiText>
              Are you sure you want to delete <strong>{selected.name}</strong> ({selected.id})?
              This cannot be undone.
            </EuiText>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => setIsDeleteModalOpen(false)}>Cancel</EuiButtonEmpty>
            <EuiButton
              color="danger"
              fill
              onClick={deleteWatch}
              data-test-subj="daybreakConfirmDeleteWatchButton"
            >
              Delete
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}
    </section>
  );
};
