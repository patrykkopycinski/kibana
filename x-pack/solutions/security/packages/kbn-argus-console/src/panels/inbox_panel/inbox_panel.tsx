/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';

import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiConfirmModal,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiInMemoryTable,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
  type EuiBasicTableColumn,
  type EuiTableSelectionType,
} from '@elastic/eui';

import type {
  ArgusAutonomyDecision,
  ArgusMutationRow,
  ArgusMutationVerdictAction,
} from '@kbn/argus-console-common';

import {
  useAutonomyDecisions,
  useMutationApproval,
  useMutations,
  type ArgusHttp,
} from '../../hooks';

/**
 * Unified inbox of items waiting on an analyst's decision. Sources today:
 *
 *   1. **Blocked mutations** — `.soc-mutation-intents` rows whose
 *      `governance_gate.status === "blocked"`. The analyst can override
 *      the gate verdict by writing `approve` or `reject` (with reason)
 *      via `useMutationApproval`.
 *   2. **Autonomy decisions flagged "required_human"** — rows from the
 *      governance feed where the autonomous applier deferred to a human.
 *      These are read-only here: clicking *Open* pivots the user into the
 *      Governance tab for the full decision context (gates evaluated,
 *      backtest verdict, trust tier).
 *
 * Why a separate tab and not just "filter the Mutations / Governance tab
 * to pending"?  Two reasons:
 *
 *   - **Single landing surface.** An on-shift analyst opens the console
 *     wanting to know "what owes me a decision?" — not "let me visit each
 *     tab and re-derive the pending subset". The inbox aggregates that
 *     subset across the existing data sources.
 *   - **Action density.** The mutation row's verdict UI lives inline next
 *     to its sibling tab (the Mutations tab in `detection_pipeline`); the
 *     autonomy decision's pivot lives on the Governance tab. Putting both
 *     here gives one place where Approve, Reject, and Open are the only
 *     affordances.
 *
 * What the inbox does NOT include:
 *
 *   - Synthesis proposals (`chosen` / `frontier` / `dominated`). These are
 *     informational — the Pareto picker has already selected one — so
 *     they're not "pending decision" surfaces. They live on the Detection
 *     Pipeline → Proposals sub-view for drill-in.
 *   - Caldera attack queue. These are produced/consumed by the simulation
 *     loop, not an analyst.
 *
 * If the backend later grows a verdict surface for autonomy decisions
 * we'll add it here in the same row-action column without changing the
 * panel's shape.
 */

export interface InboxPanelProps {
  readonly http: ArgusHttp;
  /**
   * Whether the signed-in operator can write verdicts. Mirrors the
   * `canApproveMutations` flag the Mutations tab uses — when false, the
   * row-action column collapses to a read-only "Decision needed" badge.
   * The backend is the source of truth; this only avoids rendering dead
   * affordances.
   */
  readonly canApproveMutations?: boolean;
  /**
   * Surfaces verdict-submission errors back to the host (which wires them
   * to Kibana's `notifications.toasts` adapter). Approval errors here
   * should never silently swallow.
   */
  readonly onApprovalError?: (error: Error) => void;
  /**
   * Pivot back to the Governance tab when an analyst clicks *Open* on an
   * autonomy-decision row. The host is responsible for switching the
   * active tab and (optionally) seeding any subject state on it.
   */
  readonly onOpenAutonomyDecision?: (decision: ArgusAutonomyDecision) => void;
  /**
   * Pivot to the Detection Pipeline → Mutations sub-view when an analyst
   * wants the full mutation context (lineage, evidence) before deciding.
   * Optional — when omitted, the row's *Open* shortcut is hidden but the
   * inline approve/reject still work.
   */
  readonly onOpenMutationDetail?: (row: ArgusMutationRow) => void;
}

/**
 * Internal row type. Discriminated union so the table columns can branch on
 * `kind` without the per-row narrowing dance every column would otherwise
 * have to do.
 */
type InboxRow =
  | {
      readonly kind: 'mutation';
      readonly id: string;
      readonly timestamp: string;
      readonly mutation: ArgusMutationRow;
    }
  | {
      readonly kind: 'autonomy';
      readonly id: string;
      readonly timestamp: string;
      readonly decision: ArgusAutonomyDecision;
    };

interface VerdictModalState {
  readonly row: ArgusMutationRow;
  readonly action: ArgusMutationVerdictAction;
}

/**
 * Format an ISO timestamp as a relative-age string ("5m", "2h", "3d").
 * Kept naive on purpose — the inbox is a "what's on my plate today" view,
 * so locale-aware formatting and second-level precision aren't worth the
 * bundle weight from `@kbn/i18n` here.
 */
const formatAge = (iso: string): string => {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '—';
  const deltaMs = Date.now() - ts;
  if (deltaMs < 0) return 'now';
  const seconds = Math.floor(deltaMs / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const KIND_LABEL: Record<InboxRow['kind'], string> = {
  mutation: 'Mutation override',
  autonomy: 'Autonomy decision',
};

const KIND_COLOR: Record<InboxRow['kind'], 'danger' | 'warning'> = {
  mutation: 'danger',
  autonomy: 'warning',
};

const KIND_ICON: Record<InboxRow['kind'], string> = {
  mutation: 'lock',
  autonomy: 'inspect',
};

export const InboxPanel: React.FC<InboxPanelProps> = ({
  http,
  canApproveMutations = false,
  onApprovalError,
  onOpenAutonomyDecision,
  onOpenMutationDetail,
}) => {
  const [modal, setModal] = useState<VerdictModalState | undefined>(undefined);
  const [reason, setReason] = useState('');
  // Optimistically-decided mutation_intent_ids → action. Lets the row
  // collapse its buttons into a "Approved"/"Rejected" badge before the
  // server round-trip resolves and the next refresh removes the row.
  const [pendingVerdicts, setPendingVerdicts] = useState<
    Record<string, ArgusMutationVerdictAction>
  >({});
  const modalTitleId = useGeneratedHtmlId();

  const approval = useMutationApproval({ http });

  // Pull the two source feeds. Both refresh silently on a 10s tick so the
  // inbox stays current during a demo without flashing the table on every
  // poll. Window is 7d so older "still waiting" items don't fall off the
  // queue — by definition these rows haven't been resolved yet.
  const mutations = useMutations({
    http,
    filter: 'blocked',
    window: '7d',
    enabled: Boolean(http),
    refreshIntervalMs: 10_000,
  });

  const autonomy = useAutonomyDecisions({
    http,
    window: '7d',
    enabled: Boolean(http),
    refreshIntervalMs: 10_000,
  });

  const isLoading =
    Boolean(http) && (mutations.status === 'loading' || autonomy.status === 'loading');

  const error =
    mutations.status === 'error'
      ? mutations.error
      : autonomy.status === 'error'
      ? autonomy.error
      : null;

  // Compose the unified row list. Mutation rows we filter by "still
  // blocked AND not optimistically decided here yet" — once the verdict
  // round-trip resolves, the next refresh will remove the row from the
  // upstream feed anyway, but this keeps the local view consistent in the
  // ~10s gap. Autonomy rows we filter strictly to `required_human` since
  // that's the disposition that really blocks an analyst.
  const rows: readonly InboxRow[] = useMemo(() => {
    const mutationRows: InboxRow[] =
      mutations.status === 'success'
        ? mutations.data.rows
            .filter((r) => r.mutation_intent_id != null)
            .filter((r) => !pendingVerdicts[r.mutation_intent_id as string])
            .map((r) => ({
              kind: 'mutation' as const,
              id: `mutation:${r.mutation_intent_id}`,
              timestamp: r.timestamp,
              mutation: r,
            }))
        : [];

    const autonomyRows: InboxRow[] =
      autonomy.status === 'success'
        ? autonomy.data.decisions
            .filter((d) => d.final_status === 'required_human')
            .map((d) => ({
              kind: 'autonomy' as const,
              id: `autonomy:${d.id}`,
              timestamp: d.timestamp,
              decision: d,
            }))
        : [];

    // Sort newest-first across kinds so a fresh blocked mutation lands at
    // the top of the queue regardless of which feed it came from.
    return [...mutationRows, ...autonomyRows].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );
  }, [autonomy, mutations, pendingVerdicts]);

  const counts = useMemo(() => {
    const c = { mutation: 0, autonomy: 0 };
    for (const r of rows) c[r.kind]++;
    return c;
  }, [rows]);

  const onConfirmVerdict = useCallback(async () => {
    if (!modal) return;
    const { row, action } = modal;
    const mutationIntentId = row.mutation_intent_id;
    if (!mutationIntentId) return;
    const trimmedReason = reason.trim();
    // The backend enforces "reason required for reject"; we mirror it on
    // the client so the confirm button stays inert until the analyst
    // actually types something.
    if (action === 'reject' && trimmedReason.length === 0) return;

    setPendingVerdicts((prev) => ({ ...prev, [mutationIntentId]: action }));
    try {
      await approval.submit(action, {
        mutationIntentId,
        reason: trimmedReason || undefined,
      });
      setModal(undefined);
      setReason('');
    } catch (err) {
      // Roll back the optimistic decision on failure and surface the
      // error via the host's toast adapter (if any).
      setPendingVerdicts((prev) => {
        const { [mutationIntentId]: _dropped, ...rest } = prev;
        return rest;
      });
      const wrappedError = err instanceof Error ? err : new Error(String(err));
      if (onApprovalError) onApprovalError(wrappedError);
    }
  }, [approval, modal, onApprovalError, reason]);

  const columns = useMemo<Array<EuiBasicTableColumn<InboxRow>>>(
    () => [
      {
        field: 'kind',
        name: 'Kind',
        width: '180px',
        sortable: true,
        render: (_kind: InboxRow['kind'], row: InboxRow) => (
          <EuiBadge color={KIND_COLOR[row.kind]} iconType={KIND_ICON[row.kind]}>
            {KIND_LABEL[row.kind]}
          </EuiBadge>
        ),
      },
      {
        field: 'timestamp',
        name: 'Age',
        width: '70px',
        sortable: true,
        render: (ts: string) => (
          <EuiToolTip content={ts} position="top">
            <EuiText size="s">{formatAge(ts)}</EuiText>
          </EuiToolTip>
        ),
      },
      {
        field: 'id',
        name: 'Subject',
        render: (_id: string, row: InboxRow) => {
          if (row.kind === 'mutation') {
            const m = row.mutation;
            return (
              <EuiText size="s">
                <strong>{m.label ?? m.title ?? m.mutation_intent_id ?? 'Mutation'}</strong>
                {m.subtitle ? (
                  <>
                    <br />
                    <span style={{ color: 'var(--euiColorDarkShade)' }}>{m.subtitle}</span>
                  </>
                ) : null}
              </EuiText>
            );
          }
          const d = row.decision;
          return (
            <EuiText size="s">
              <strong>{d.kibana_rule_name ?? d.artifact_id ?? 'Autonomy decision'}</strong>
              {d.action ? (
                <>
                  <br />
                  <span style={{ color: 'var(--euiColorDarkShade)' }}>{d.action}</span>
                </>
              ) : null}
            </EuiText>
          );
        },
      },
      {
        field: 'id',
        name: 'Why it needs you',
        render: (_id: string, row: InboxRow) => {
          if (row.kind === 'mutation') {
            return (
              <EuiText size="s">
                {row.mutation.gate_reason ?? 'Governance gate blocked — review required.'}
              </EuiText>
            );
          }
          return (
            <EuiText size="s">
              {row.decision.review_reason ??
                row.decision.first_failing_gate ??
                'Autonomous applier deferred to human.'}
            </EuiText>
          );
        },
      },
      {
        name: 'Actions',
        width: '260px',
        render: (row: InboxRow) => {
          if (row.kind === 'mutation') {
            const m = row.mutation;
            const intentId = m.mutation_intent_id;
            if (!intentId) return null;
            const decided = pendingVerdicts[intentId];
            if (decided) {
              return (
                <EuiBadge color={decided === 'approve' ? 'success' : 'danger'}>
                  {decided === 'approve' ? 'Approved' : 'Rejected'}
                </EuiBadge>
              );
            }
            if (!canApproveMutations) {
              return <EuiBadge color="warning">{'Decision needed'}</EuiBadge>;
            }
            return (
              <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiButton
                    size="s"
                    color="primary"
                    onClick={() => setModal({ row: m, action: 'approve' })}
                    data-test-subj={`argusInboxApprove-${intentId}`}
                  >
                    {'Approve'}
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    size="s"
                    color="danger"
                    onClick={() => setModal({ row: m, action: 'reject' })}
                    data-test-subj={`argusInboxReject-${intentId}`}
                  >
                    {'Reject'}
                  </EuiButton>
                </EuiFlexItem>
                {onOpenMutationDetail ? (
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      size="s"
                      onClick={() => onOpenMutationDetail(m)}
                      data-test-subj={`argusInboxOpenMutation-${intentId}`}
                    >
                      {'Open'}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                ) : null}
              </EuiFlexGroup>
            );
          }
          return (
            <EuiButton
              size="s"
              color="text"
              iconType="popout"
              onClick={() => onOpenAutonomyDecision?.(row.decision)}
              isDisabled={!onOpenAutonomyDecision}
              data-test-subj={`argusInboxOpenAutonomy-${row.decision.id}`}
            >
              {'Open in Governance'}
            </EuiButton>
          );
        },
      },
    ],
    [canApproveMutations, onOpenAutonomyDecision, onOpenMutationDetail, pendingVerdicts]
  );

  const selection: EuiTableSelectionType<InboxRow> = useMemo(
    () => ({
      // Disabled placeholder: bulk approve/reject is a future-friendly
      // shape but we render no checkboxes today (`selectable: () => false`)
      // because the backend has no batch verdict endpoint and we'd rather
      // not paper over that with a per-row loop that's hard to recover
      // from on partial failure.
      selectable: () => false,
    }),
    []
  );

  return (
    <EuiPanel paddingSize="l" hasBorder={true} hasShadow={false} data-test-subj="argusInboxPanel">
      <EuiFlexGroup alignItems="center" gutterSize="m">
        <EuiFlexItem grow={false}>
          <EuiIcon type="email" size="l" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="s">
            <h2>{'Inbox'}</h2>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            {
              'Items waiting on you — blocked mutations the governance gate paused, and autonomy decisions the autonomous applier explicitly handed off.'
            }
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>{isLoading ? <EuiLoadingSpinner size="m" /> : null}</EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow" data-test-subj="argusInboxBadgeMutation">
            {`${counts.mutation} mutation${counts.mutation === 1 ? '' : 's'}`}
          </EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow" data-test-subj="argusInboxBadgeAutonomy">
            {`${counts.autonomy} autonomy`}
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {error ? (
        <>
          <EuiCallOut
            color="warning"
            iconType="warning"
            title={'Failed to load inbox feed'}
            data-test-subj="argusInboxErrorCallout"
          >
            <EuiText size="s">{error.message}</EuiText>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      ) : null}

      {rows.length === 0 && !isLoading && !error ? (
        <EuiEmptyPrompt
          iconType="checkInCircleFilled"
          color="success"
          title={<h3>{'Nothing waiting on you'}</h3>}
          body={
            <EuiText size="s">
              {
                "Blocked mutations and human-flagged autonomy decisions show up here. The queue's empty — ARGUS hasn't paused on anything in the last 7 days."
              }
            </EuiText>
          }
          data-test-subj="argusInboxEmpty"
        />
      ) : (
        <EuiInMemoryTable
          items={[...rows]}
          columns={columns}
          itemId="id"
          pagination={{ initialPageSize: 25, pageSizeOptions: [25, 50, 100] }}
          sorting={{ sort: { field: 'timestamp', direction: 'desc' } }}
          selection={selection}
          loading={isLoading}
          tableLayout="auto"
          data-test-subj="argusInboxTable"
        />
      )}

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
          cancelButtonText={'Cancel'}
          confirmButtonText={modal.action === 'approve' ? 'Approve' : 'Reject'}
          buttonColor={modal.action === 'approve' ? 'primary' : 'danger'}
          isLoading={approval.submitting}
          confirmButtonDisabled={
            approval.submitting || (modal.action === 'reject' && reason.trim().length === 0)
          }
          data-test-subj="argusInboxVerdictModal"
        >
          <EuiText size="s">
            {modal.action === 'approve'
              ? 'Override the governance gate and let this mutation reach production. The decision and reason will be recorded on the audit trail.'
              : 'Reject this mutation outright. The reason is required and will be recorded on the audit trail.'}
          </EuiText>
          <EuiSpacer size="s" />
          <EuiTextArea
            fullWidth
            placeholder={
              modal.action === 'approve'
                ? 'Reason (optional but encouraged)…'
                : 'Reason (required)…'
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-test-subj="argusInboxVerdictReason"
            rows={3}
          />
        </EuiConfirmModal>
      ) : null}
    </EuiPanel>
  );
};
