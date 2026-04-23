/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  type EuiBasicTableColumn,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';

import type {
  ArgusCalderaCommand,
  ArgusCalderaCommandStatus,
  ArgusCalderaDifficultyState,
  ArgusCalderaProfile,
} from '@kbn/argus-console-common';

import { useCalderaQueue, type ArgusHttp } from '../../hooks';

export interface CalderaQueuePanelProps {
  readonly http?: ArgusHttp;
}

const statusBadge = (status: ArgusCalderaCommandStatus): JSX.Element => {
  switch (status) {
    case 'pending':
      return <EuiBadge color="hollow">{'Pending'}</EuiBadge>;
    case 'claimed':
      return <EuiBadge color="accent">{'Claimed'}</EuiBadge>;
    case 'running':
      return <EuiBadge color="primary">{'Running'}</EuiBadge>;
    case 'completed':
      return <EuiBadge color="success">{'Completed'}</EuiBadge>;
    case 'failed':
      return <EuiBadge color="danger">{'Failed'}</EuiBadge>;
    case 'unknown':
      return <EuiBadge color="hollow">{'Unknown'}</EuiBadge>;
  }
};

const formatTimestamp = (iso: string | undefined): string => {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : iso;
};

const DifficultyChip: React.FC<{ state?: ArgusCalderaDifficultyState }> = ({ state }) => {
  if (!state) return null;
  const level = state.current_level ?? state.level;
  if (level === undefined) return null;
  return (
    <EuiToolTip
      position="top"
      content={
        state.reasoning ?? `Level ${level}${state.level_name ? ` — ${state.level_name}` : ''}`
      }
    >
      <EuiBadge color="accent">
        {'Difficulty '}
        {level}
        {state.level_name ? ` · ${state.level_name}` : ''}
      </EuiBadge>
    </EuiToolTip>
  );
};

/**
 * Human-readable label for the structured `decision_reason` enum emitted by
 * the difficulty controller. Unknown values fall through to the raw string
 * so we never drop producer signal on the floor.
 */
const REASON_LABEL: Readonly<Record<string, string>> = {
  normal_escalation: 'Normal escalation',
  strong_signal_bypass: 'Strong signal · trust bypassed',
  at_max_level: 'At max level',
  performance_degraded: 'Performance degraded',
  at_min_level: 'At min level',
  held_stable: 'Held stable',
  trust_stale: 'Trust data stale',
  insufficient_data: 'Insufficient data',
};

const humanizeReason = (raw?: string): string | undefined => {
  if (!raw) return undefined;
  return REASON_LABEL[raw] ?? raw.replace(/_/g, ' ');
};

const formatDecision = (decision?: string): string => {
  if (!decision) return 'Unknown';
  return decision.charAt(0).toUpperCase() + decision.slice(1);
};

/**
 * Surfaces the latest controller tick so operators can answer "why is
 * difficulty stuck?" without opening a Kibana query. Three pieces of info:
 *  - the decision itself (increase / decrease / maintain)
 *  - the structured reason (colour-coded: warning when stale/blocked)
 *  - a stale banner when the controller hasn't ticked in >30 min
 */
const LastTickChip: React.FC<{ state?: ArgusCalderaDifficultyState }> = ({ state }) => {
  if (!state) return null;
  const decision = state.decision;
  const reason = state.decision_reason;
  if (!decision && !reason) return null;

  const reasonLabel = humanizeReason(reason);

  // `trust_stale` means: "we would have escalated but we can't see trust
  // data". That's actionable (upstream bug in the trust scorer) so colour
  // the chip as a warning rather than hollow.
  const isActionable =
    reason === 'trust_stale' || reason === 'performance_degraded' || reason === 'insufficient_data';
  const chipColor = isActionable ? 'warning' : 'hollow';

  const tooltipBody = state.reasoning
    ? `${state.reasoning}${
        state.age_seconds !== undefined ? ` · tick ${formatAge(state.age_seconds)} ago` : ''
      }`
    : reasonLabel ?? '';

  return (
    <EuiToolTip position="top" content={tooltipBody}>
      <EuiBadge color={chipColor} data-test-subj="argusCalderaLastTickChip">
        {'Last tick: '}
        {formatDecision(decision)}
        {reasonLabel ? ` · ${reasonLabel}` : ''}
      </EuiBadge>
    </EuiToolTip>
  );
};

const StaleWarningChip: React.FC<{ state?: ArgusCalderaDifficultyState }> = ({ state }) => {
  if (!state?.stale) return null;
  return (
    <EuiToolTip
      position="top"
      content={
        state.age_seconds !== undefined
          ? `Controller last ticked ${formatAge(
              state.age_seconds
            )} ago. Cadence is 15 min — something is blocking the workflow.`
          : 'Controller tick is stale.'
      }
    >
      <EuiBadge color="danger" data-test-subj="argusCalderaStaleChip">
        {'Stale'}
      </EuiBadge>
    </EuiToolTip>
  );
};

const formatAge = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
};

export const CalderaQueuePanel: React.FC<CalderaQueuePanelProps> = ({ http }) => {
  const state = useCalderaQueue({
    http: http as ArgusHttp,
    enabled: Boolean(http),
    refreshIntervalMs: 10_000,
  });

  const payload = state.status === 'success' ? state.data : null;
  const isLoading = Boolean(http) && state.status === 'loading';
  const hasLiveData = state.status === 'success';
  const counts = payload?.counts ?? {
    pending: 0,
    claimed: 0,
    running: 0,
    completed: 0,
    failed: 0,
    total: 0,
  };

  const commands = payload?.commands ?? [];
  const profiles = payload?.profiles ?? [];

  const commandColumns = useMemo<Array<EuiBasicTableColumn<ArgusCalderaCommand>>>(
    () => [
      {
        field: 'timestamp',
        name: 'Dispatched',
        width: '180px',
        render: (value: string) => <span title={value}>{formatTimestamp(value)}</span>,
      },
      {
        field: 'status',
        name: 'Status',
        width: '120px',
        render: (value: ArgusCalderaCommandStatus) => statusBadge(value),
      },
      {
        field: 'profile',
        name: 'Profile',
        render: (_v, row) => (
          <div>
            <EuiText size="s">
              <strong>{row.profile ?? row.operation_profile ?? '—'}</strong>
            </EuiText>
            {row.difficulty !== undefined ? (
              <EuiText size="xs" color="subdued">
                {'Difficulty '}
                {row.difficulty}
              </EuiText>
            ) : null}
          </div>
        ),
      },
      {
        field: 'techniques',
        name: 'Techniques',
        render: (_v, row) => {
          const techniques = row.techniques ?? [];
          if (techniques.length === 0) return <span>{'—'}</span>;
          const shown = techniques.slice(0, 4);
          return (
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {shown.map((t) => (
                <EuiFlexItem grow={false} key={t}>
                  <EuiBadge color="hollow">{t}</EuiBadge>
                </EuiFlexItem>
              ))}
              {techniques.length > shown.length ? (
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">{`+${techniques.length - shown.length}`}</EuiBadge>
                </EuiFlexItem>
              ) : null}
            </EuiFlexGroup>
          );
        },
      },
      {
        field: 'source',
        name: 'Source',
        width: '160px',
        render: (value: string | undefined) =>
          value ? (
            <EuiText size="s" color="subdued">
              <code>{value}</code>
            </EuiText>
          ) : (
            <span>{'—'}</span>
          ),
      },
    ],
    []
  );

  const profileColumns = useMemo<Array<EuiBasicTableColumn<ArgusCalderaProfile>>>(
    () => [
      {
        field: 'difficulty_level',
        name: 'Lvl',
        width: '70px',
        render: (value: number) => <EuiBadge color="accent">{value}</EuiBadge>,
      },
      {
        field: 'name',
        name: 'Profile',
        render: (_v, row) => (
          <div>
            <EuiText size="s">
              <strong>{row.name}</strong>
            </EuiText>
            {row.group ? (
              <EuiText size="xs" color="subdued">
                {row.group}
              </EuiText>
            ) : null}
          </div>
        ),
      },
      {
        field: 'techniques',
        name: 'Techniques',
        render: (value: readonly string[]) => (
          <EuiText size="xs" color="subdued">
            {value.length === 0
              ? '—'
              : value.slice(0, 6).join(', ') + (value.length > 6 ? `, +${value.length - 6}` : '')}
          </EuiText>
        ),
      },
    ],
    []
  );

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="argusConsoleCalderaPanel">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{'Caldera queue'}</h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {'Attacker side of the loop. Commands, adversary profiles, and the current difficulty '}
            {'level the red-team workflow is running at.'}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center" wrap>
            <EuiFlexItem grow={false}>
              <DifficultyChip state={payload?.difficulty_state} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <LastTickChip state={payload?.difficulty_state} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <StaleWarningChip state={payload?.difficulty_state} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color={hasLiveData ? 'success' : 'hollow'}>
                {hasLiveData ? 'live' : 'demo-grade'}
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="m" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiStat title={counts.total} description="Commands" titleSize="s" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={counts.pending}
            description="Pending"
            titleSize="s"
            titleColor="subdued"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={counts.claimed + counts.running}
            description="In flight"
            titleSize="s"
            titleColor="accent"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={counts.completed}
            description="Completed"
            titleSize="s"
            titleColor="success"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat title={counts.failed} description="Failed" titleSize="s" titleColor="danger" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat title={profiles.length} description="Profiles" titleSize="s" />
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
          title="Couldn't load Caldera queue"
          data-test-subj="argusCalderaError"
        >
          {state.error.message}
        </EuiCallOut>
      ) : (
        <>
          {commands.length === 0 ? (
            <EuiEmptyPrompt
              iconType="dot"
              title={<h4>{'No Caldera commands dispatched yet'}</h4>}
              body={
                <EuiText size="s">
                  {'Nothing in '}
                  <code>{'.soc-attack-commands'}</code>
                  {'. The red-team dispatcher writes here before Caldera picks up each operation.'}
                </EuiText>
              }
              data-test-subj="argusCalderaEmpty"
            />
          ) : (
            <>
              <EuiText size="s">
                <strong>{'Recent commands'}</strong>
              </EuiText>
              <EuiSpacer size="xs" />
              <EuiBasicTable<ArgusCalderaCommand>
                items={[...commands]}
                columns={commandColumns}
                tableLayout="auto"
                data-test-subj="argusCalderaCommandsTable"
              />
            </>
          )}

          {profiles.length > 0 ? (
            <>
              <EuiSpacer size="l" />
              <EuiText size="s">
                <strong>{'Seeded adversary profiles'}</strong>
              </EuiText>
              <EuiSpacer size="xs" />
              <EuiBasicTable<ArgusCalderaProfile>
                items={[...profiles]}
                columns={profileColumns}
                tableLayout="auto"
                data-test-subj="argusCalderaProfilesTable"
              />
            </>
          ) : null}
        </>
      )}
    </EuiPanel>
  );
};
