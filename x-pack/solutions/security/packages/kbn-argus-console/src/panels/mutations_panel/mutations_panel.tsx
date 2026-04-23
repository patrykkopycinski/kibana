/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  type EuiBasicTableColumn,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiCallOut,
  EuiConfirmModal,
  EuiEmptyPrompt,
  EuiFieldText,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';

import type {
  ArgusMutationFilter,
  ArgusMutationRow,
  ArgusMutationVerdictAction,
  ArgusMutationWindow,
} from '@kbn/argus-console-common';

import { useMutationApproval, useMutations, type ArgusHttp } from '../../hooks';
import { MutationDetailFlyout } from './mutation_detail_flyout';

export interface MutationsPanelProps {
  /**
   * Core HTTP client. When omitted the panel renders the same empty-state it
   * shows when the live fetch returns zero rows, so the console remains
   * demo-safe when wired into Storybook or an offline snapshot.
   */
  readonly http?: ArgusHttp;
  /**
   * Initial filter — defaults to `'all'`. Exposed so deep-links (e.g. from
   * the Pulse "× blocked" tile) can pre-select a pill.
   */
  readonly initialFilter?: ArgusMutationFilter;
  /**
   * Initial window — defaults to `'24h'`. Exposed for the same deep-link
   * reason as `initialFilter`.
   */
  readonly initialWindow?: ArgusMutationWindow;
  /**
   * Whether the signed-in user has the argus_write capability. When false,
   * Approve/Reject row actions are hidden. The backend is the source of
   * truth — this flag just avoids rendering dead affordances.
   */
  readonly canApproveMutations?: boolean;
  /** Optional toast surface so we can report failures without swallowing them. */
  readonly onApprovalError?: (error: Error) => void;
}

interface VerdictModalState {
  readonly row: ArgusMutationRow;
  readonly action: ArgusMutationVerdictAction;
}

interface FilterOption {
  readonly id: ArgusMutationFilter;
  readonly label: string;
}

const FILTER_OPTIONS: readonly FilterOption[] = [
  { id: 'all', label: 'All' },
  { id: 'applied', label: 'Applied' },
  { id: 'rolled_back', label: 'Rolled back' },
  { id: 'blocked', label: 'Blocked' },
];

interface WindowOption {
  readonly id: ArgusMutationWindow;
  readonly label: string;
}

const WINDOW_OPTIONS: readonly WindowOption[] = [
  { id: '24h', label: 'Last 24h' },
  { id: '7d', label: 'Last 7d' },
];

const verdictBadge = (verdict: ArgusMutationRow['verdict']): JSX.Element => {
  switch (verdict) {
    case 'applied':
      return <EuiBadge color="success">{'Applied'}</EuiBadge>;
    case 'rolled_back':
      return <EuiBadge color="warning">{'Rolled back'}</EuiBadge>;
    case 'blocked':
      return <EuiBadge color="danger">{'Blocked'}</EuiBadge>;
  }
};

const formatDurationMs = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(m < 10 ? 2 : 1)} min`;
  const h = m / 60;
  return `${h.toFixed(h < 10 ? 2 : 1)} h`;
};

const formatTimestamp = (iso: string): string => {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleString();
};

/**
 * Which reason line (if any) we should render under a row's title. We render
 * the explicit server-provided reason and never synthesise one on the client
 * — if the backend has nothing to say, the row stays silent.
 */
const reasonForRow = (row: ArgusMutationRow): string | null => {
  if (row.verdict === 'rolled_back') return row.rollback_reason ?? null;
  if (row.verdict === 'blocked') return row.gate_reason ?? null;
  return null;
};

export const MutationsPanel: React.FC<MutationsPanelProps> = ({
  http,
  initialFilter = 'all',
  initialWindow = '24h',
  canApproveMutations = false,
  onApprovalError,
}) => {
  const [filter, setFilter] = useState<ArgusMutationFilter>(initialFilter);
  const [window, setWindow] = useState<ArgusMutationWindow>(initialWindow);
  const [modal, setModal] = useState<VerdictModalState | undefined>(undefined);
  const [reason, setReason] = useState('');
  // Currently-open mutation detail flyout. Stores the row so the flyout
  // can render header context (verdict badge, subtitle) before the fetch
  // resolves — avoids a flash of "Loading" header when we already know
  // which mutation the user clicked.
  const [detailRow, setDetailRow] = useState<ArgusMutationRow | undefined>(undefined);
  // Keeps an in-flight verdict request keyed by mutation_intent_id so the row
  // can disable its actions and show a "decided optimistically" badge without
  // having to re-fetch the table.
  const [pendingVerdicts, setPendingVerdicts] = useState<
    Record<string, ArgusMutationVerdictAction>
  >({});
  const modalTitleId = useGeneratedHtmlId();

  const approval = useMutationApproval({ http: http as ArgusHttp });

  const state = useMutations({
    http: http as ArgusHttp,
    filter,
    window,
    enabled: Boolean(http),
    // Same demo cadence as the pulse panel — refreshes silently so the
    // table doesn't flash between ticker emits.
    refreshIntervalMs: 10_000,
  });

  const payload = state.status === 'success' ? state.data : null;
  const isLoading = Boolean(http) && state.status === 'loading';
  const hasLiveData = state.status === 'success';

  const rows = payload?.rows ?? [];
  const counts = payload?.counts ?? { applied: 0, rolled_back: 0, blocked: 0 };

  const onConfirmVerdict = useCallback(async () => {
    if (!modal || !http) return;
    const { row, action } = modal;
    const mutationIntentId = row.mutation_intent_id;
    if (!mutationIntentId) return;
    const trimmedReason = reason.trim();
    if (action === 'reject' && trimmedReason.length === 0) {
      // Reject requires a reason — the backend enforces this but we guard
      // here so the confirm button stays disabled until the user types.
      return;
    }
    // Optimistic bookkeeping: mark the row as decided even before the
    // round-trip completes so the Approve/Reject buttons don't re-fire.
    setPendingVerdicts((prev) => ({ ...prev, [mutationIntentId]: action }));
    try {
      await approval.submit(action, {
        mutationIntentId,
        reason: trimmedReason || undefined,
      });
      setModal(undefined);
      setReason('');
    } catch (err) {
      // Roll back the optimistic decision on failure and surface the error
      // via the host's toast adapter (if any).
      setPendingVerdicts((prev) => {
        const { [mutationIntentId]: _dropped, ...rest } = prev;
        return rest;
      });
      const error = err instanceof Error ? err : new Error(String(err));
      if (onApprovalError) onApprovalError(error);
    }
  }, [approval, http, modal, onApprovalError, reason]);

  const columns = useMemo<Array<EuiBasicTableColumn<ArgusMutationRow>>>(
    () => [
      {
        field: 'timestamp',
        name: 'When',
        width: '180px',
        render: (value: string) => <span title={value}>{formatTimestamp(value)}</span>,
      },
      {
        field: 'verdict',
        name: 'Verdict',
        width: '130px',
        render: (value: ArgusMutationRow['verdict']) => verdictBadge(value),
      },
      {
        field: 'title',
        name: 'Mutation',
        render: (_value: string | null, row: ArgusMutationRow) => {
          const primary = row.title ?? row.label ?? row.rule_id ?? row.mutation_intent_id ?? '—';
          // "Why" line — shown for rolled-back rows (rollback_reason) and for
          // blocked rows (gate_reason). We elide it for applied rows because
          // there's no "why" to explain on the happy path.
          const rowReason = reasonForRow(row);
          return (
            <div>
              <EuiText size="s">
                <strong>{primary}</strong>
              </EuiText>
              {row.subtitle ? (
                <EuiText size="xs" color="subdued">
                  {row.subtitle}
                </EuiText>
              ) : null}
              {rowReason ? (
                <EuiFlexGroup
                  gutterSize="xs"
                  alignItems="flexStart"
                  responsive={false}
                  css={{ marginTop: 2 }}
                  data-test-subj={`argusMutationsReason-${row.mutation_intent_id ?? 'unknown'}`}
                >
                  <EuiFlexItem grow={false}>
                    <EuiIcon
                      type={row.verdict === 'blocked' ? 'lock' : 'alert'}
                      size="s"
                      color={row.verdict === 'blocked' ? 'danger' : 'warning'}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="xs">
                      <strong>
                        {row.verdict === 'blocked' ? 'Gate reason: ' : 'Rollback reason: '}
                      </strong>
                      {rowReason}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              ) : null}
              {row.mutation_intent_id ? (
                <EuiText size="xs" color="subdued">
                  <code>{row.mutation_intent_id}</code>
                </EuiText>
              ) : null}
            </div>
          );
        },
      },
      {
        field: 'actor_id',
        name: 'Actor',
        width: '220px',
        render: (_value: string | null, row: ArgusMutationRow) => (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiText size="s">{row.actor_id ?? '—'}</EuiText>
            </EuiFlexItem>
            {row.actor_trust_tier ? (
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">{row.actor_trust_tier}</EuiBadge>
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        ),
      },
      {
        field: 'rollback_mttr_ms',
        name: 'Rollback MTTR',
        width: '140px',
        render: (_value: number | null, row: ArgusMutationRow) => {
          if (row.verdict !== 'rolled_back') return '—';
          return (
            <EuiToolTip
              position="top"
              content="Time between apply and rollback for this mutation (soc-recovery.yaml)."
            >
              <span>{formatDurationMs(row.rollback_mttr_ms)}</span>
            </EuiToolTip>
          );
        },
      },
      {
        field: 'gate_status',
        name: 'Gate',
        width: '120px',
        render: (value: string | null, row: ArgusMutationRow) =>
          row.verdict === 'blocked' ? (
            <EuiBadge color="danger">{value ?? 'blocked'}</EuiBadge>
          ) : (
            <span>{'—'}</span>
          ),
      },
      {
        name: 'Details',
        width: '110px',
        render: (row: ArgusMutationRow) => {
          if (!row.mutation_intent_id) return <span>{'—'}</span>;
          return (
            <EuiButtonEmpty
              size="xs"
              iconType="inspect"
              onClick={() => setDetailRow(row)}
              data-test-subj={`argusMutationDetails-${row.mutation_intent_id}`}
            >
              {'Details'}
            </EuiButtonEmpty>
          );
        },
      } as EuiBasicTableColumn<ArgusMutationRow>,
      ...(canApproveMutations
        ? [
            {
              name: 'Human review',
              width: '200px',
              render: (row: ArgusMutationRow) => {
                // Only blocked rows can be approved/rejected — they're the
                // ones still waiting on a human decision.
                if (row.verdict !== 'blocked' || !row.mutation_intent_id) {
                  return <span>{'—'}</span>;
                }
                const decided = pendingVerdicts[row.mutation_intent_id];
                if (decided) {
                  return (
                    <EuiBadge color={decided === 'approve' ? 'success' : 'danger'}>
                      {decided === 'approve' ? 'Approved' : 'Rejected'}
                    </EuiBadge>
                  );
                }
                return (
                  <EuiFlexGroup gutterSize="xs" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        size="xs"
                        color="success"
                        onClick={() => {
                          setReason('');
                          setModal({ row, action: 'approve' });
                        }}
                        data-test-subj={`argusMutationApprove-${row.mutation_intent_id}`}
                      >
                        {'Approve'}
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        size="xs"
                        color="danger"
                        onClick={() => {
                          setReason('');
                          setModal({ row, action: 'reject' });
                        }}
                        data-test-subj={`argusMutationReject-${row.mutation_intent_id}`}
                      >
                        {'Reject'}
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                );
              },
            } as EuiBasicTableColumn<ArgusMutationRow>,
          ]
        : []),
    ],
    [canApproveMutations, pendingVerdicts]
  );

  const tableItems = rows;

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="argusConsoleMutationsPanel">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{'Mutations'}</h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {'Per-mutation ledger. Joins '}
            <code>{'.soc-outcomes'}</code>
            {' and '}
            <code>{'.soc-mutation-intents'}</code>
            {' by '}
            <code>{'mutation_intent_id'}</code>
            {'. Window: '}
            <code>
              {payload?.window_start ?? 'now-24h'}
              {' → '}
              {payload?.window_end ?? 'now'}
            </code>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={hasLiveData ? 'success' : 'hollow'}>
            {hasLiveData ? 'live' : 'demo-grade'}
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiFilterGroup data-test-subj="argusMutationsFilterGroup">
            {FILTER_OPTIONS.map(({ id, label }) => {
              const count =
                id === 'all'
                  ? counts.applied + counts.rolled_back + counts.blocked
                  : counts[id as 'applied' | 'rolled_back' | 'blocked'];
              return (
                <EuiFilterButton
                  key={id}
                  data-test-subj={`argusMutationsFilter-${id}`}
                  hasActiveFilters={filter === id}
                  numFilters={count}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </EuiFilterButton>
              );
            })}
          </EuiFilterGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend="Time window"
            idSelected={window}
            onChange={(id) => setWindow(id as ArgusMutationWindow)}
            options={WINDOW_OPTIONS.map(({ id, label }) => ({ id, label }))}
            buttonSize="s"
            data-test-subj="argusMutationsWindowToggle"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      {isLoading ? (
        <>
          <EuiSpacer size="m" />
          <EuiProgress size="xs" color="primary" />
        </>
      ) : null}

      <EuiSpacer size="m" />

      {state.status === 'error' ? (
        <EuiCallOut
          color="danger"
          iconType="alert"
          title="Couldn't load mutations"
          data-test-subj="argusMutationsError"
        >
          {state.error.message}
        </EuiCallOut>
      ) : tableItems.length === 0 ? (
        <EuiEmptyPrompt
          iconType="dot"
          title={<h4>{'No mutations in this window'}</h4>}
          body={
            <EuiText size="s">
              {'Nothing matched '}
              <strong>{FILTER_OPTIONS.find((f) => f.id === filter)?.label ?? filter}</strong>
              {' over the '}
              <strong>{window === '24h' ? 'last 24 hours' : 'last 7 days'}</strong>
              {'. If this is unexpected, check that Argus agents are writing to '}
              <code>{'.soc-outcomes'}</code>
              {' and '}
              <code>{'.soc-mutation-intents'}</code>
              {'.'}
            </EuiText>
          }
          data-test-subj="argusMutationsEmpty"
        />
      ) : (
        <>
          <EuiBasicTable<ArgusMutationRow>
            items={[...tableItems]}
            columns={columns}
            tableLayout="auto"
            data-test-subj="argusMutationsTable"
          />
          {payload?.truncated ? (
            <>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="subdued">
                {'Showing '}
                <strong>{tableItems.length}</strong>
                {
                  ' rows. More mutations matched this window — narrow the filter or window toggle to drill in.'
                }
              </EuiText>
            </>
          ) : null}
        </>
      )}

      {detailRow && http && detailRow.mutation_intent_id ? (
        <MutationDetailFlyout
          http={http}
          mutationIntentId={detailRow.mutation_intent_id}
          onClose={() => setDetailRow(undefined)}
          canApproveMutations={canApproveMutations}
          decidedAction={pendingVerdicts[detailRow.mutation_intent_id] ?? null}
          onApprove={() => {
            // Open the shared approve/reject modal so we reuse its
            // reason-capture + optimistic bookkeeping. The flyout stays
            // mounted behind the modal so the reviewer keeps context.
            setReason('');
            setModal({ row: detailRow, action: 'approve' });
          }}
          onReject={() => {
            setReason('');
            setModal({ row: detailRow, action: 'reject' });
          }}
        />
      ) : null}

      {modal ? (
        <EuiConfirmModal
          aria-labelledby={modalTitleId}
          titleProps={{ id: modalTitleId }}
          title={modal.action === 'approve' ? 'Approve this mutation?' : 'Reject this mutation?'}
          onCancel={() => {
            setModal(undefined);
            setReason('');
          }}
          onConfirm={onConfirmVerdict}
          cancelButtonText="Cancel"
          confirmButtonText={modal.action === 'approve' ? 'Approve' : 'Reject'}
          buttonColor={modal.action === 'approve' ? 'primary' : 'danger'}
          isLoading={approval.submitting}
          confirmButtonDisabled={
            approval.submitting || (modal.action === 'reject' && reason.trim().length === 0)
          }
          defaultFocusedButton="confirm"
          data-test-subj="argusMutationVerdictModal"
        >
          <EuiText size="s">
            {modal.action === 'approve'
              ? 'Approving will mark this mutation intent as '
              : 'Rejecting will mark this mutation intent as '}
            <code>{modal.action === 'approve' ? 'approved_by_human' : 'rejected_by_human'}</code>
            {' in '}
            <code>{'.soc-recommendations'}</code>
            {' and record an audit entry. The decision is final for this intent.'}
          </EuiText>
          <EuiSpacer size="s" />
          <EuiText size="xs" color="subdued">
            <strong>{'Mutation: '}</strong>
            {modal.row.title ??
              modal.row.label ??
              modal.row.rule_id ??
              modal.row.mutation_intent_id}
          </EuiText>
          <EuiFormRow
            label={
              modal.action === 'reject'
                ? 'Reason (required — recorded in the audit trail)'
                : 'Reason (optional — recorded in the audit trail)'
            }
          >
            <EuiFieldText
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                modal.action === 'approve'
                  ? 'e.g. confirmed with SOC lead in Slack'
                  : 'e.g. false positive, rule too broad'
              }
              data-test-subj="argusMutationVerdictReason"
              isInvalid={modal.action === 'reject' && reason.trim().length === 0}
            />
          </EuiFormRow>
        </EuiConfirmModal>
      ) : null}
    </EuiPanel>
  );
};
