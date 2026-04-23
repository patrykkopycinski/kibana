/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';

import type {
  GovernancePulse,
  GovernancePulseDrift,
  GovernancePulseMttr,
  GovernancePulseThroughput,
  GovernancePulseTierMix,
} from '@kbn/argus-console-common';

import { useGovernancePulse, type ArgusHttp } from '../../hooks';

export interface PulseMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string | number;
  readonly description?: string;
  readonly tone?: 'primary' | 'success' | 'warning' | 'danger' | 'subdued' | 'accent';
  readonly tooltip?: string;
}

export interface PulsePanelProps {
  /**
   * Optional core HTTP client. When provided, the panel fetches live
   * governance metrics and renders all four widget groups (MTTR, throughput,
   * drift, tier mix). When omitted, the panel renders the static demo tile
   * set (useful for Storybook, marketing screenshots, and offline demos).
   */
  readonly http?: ArgusHttp;
  /**
   * Override the metric tile set entirely. Bypasses the governance-pulse
   * fetch — mostly used by tests.
   */
  readonly metrics?: readonly PulseMetric[];
  /**
   * Called when an operator clicks a KPI tile. The metric id (e.g.
   * `mutations-applied`, `drift-open`) lets the host route to the
   * appropriate tab with a pre-applied filter.
   */
  readonly onMetricClick?: (metricId: string) => void;
}

/**
 * Format a millisecond duration as a short human label. Keeps the tile readable
 * across the ~5 orders of magnitude MTTR can span (100ms to hours).
 */
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(m < 10 ? 2 : 1)} min`;
  const h = m / 60;
  return `${h.toFixed(h < 10 ? 2 : 1)} h`;
};

const mttrTone = (p50Ms: number | null): PulseMetric['tone'] => {
  if (p50Ms === null) return 'subdued';
  if (p50Ms < 60_000) return 'success';
  if (p50Ms < 5 * 60_000) return 'warning';
  return 'danger';
};

/**
 * MTTR tile (section 1). Mirrors the original single-widget Pulse — still the
 * headline governance-recovery signal.
 */
const mttrTile = (mttr: GovernancePulseMttr | null): PulseMetric => {
  if (!mttr || mttr.p50_ms === null) {
    return {
      id: 'rollback-mttr',
      label: 'Rollback MTTR (p50)',
      value: '—',
      description: 'no rollback outcomes in window',
      tone: 'subdued',
      tooltip:
        'Median time between a mutation being applied and rolled back, measured ' +
        'across .soc-outcomes. Instrumented by soc-recovery.yaml (Argus R6).',
    };
  }

  const descParts: string[] = [
    `${mttr.rollback_count} rollback${mttr.rollback_count === 1 ? '' : 's'}`,
  ];
  if (mttr.avg_ms !== null) descParts.push(`avg ${formatDuration(mttr.avg_ms)}`);
  if (mttr.p95_ms !== null) descParts.push(`p95 ${formatDuration(mttr.p95_ms)}`);

  return {
    id: 'rollback-mttr',
    label: 'Rollback MTTR (p50)',
    value: formatDuration(mttr.p50_ms),
    description: descParts.join(' · '),
    tone: mttrTone(mttr.p50_ms),
    tooltip:
      'Median time between apply and rollback across all actors in the window. ' +
      'Emitted by soc-recovery.yaml (.soc-outcomes.rollback_mttr_ms) and aggregated ' +
      'by the trust-tier assessor.',
  };
};

/**
 * Throughput tiles (section 2): applied / rolled_back / blocked over the
 * window. Reads both `.soc-outcomes` (applied + rolled_back) and
 * `.soc-mutation-intents` (blocked by governance).
 */
const throughputTiles = (
  throughput: GovernancePulseThroughput | null
): readonly PulseMetric[] => {
  if (!throughput) {
    return [
      {
        id: 'mutations-applied',
        label: 'Mutations applied',
        value: '—',
        description: 'no outcomes in window',
        tone: 'subdued',
      },
    ];
  }

  return [
    {
      id: 'mutations-applied',
      label: 'Mutations applied',
      value: throughput.applied,
      description: 'success outcomes (not rolled back)',
      tone: throughput.applied > 0 ? 'success' : 'subdued',
      tooltip:
        '.soc-outcomes rows in the window minus the rolled_back=true subset. ' +
        'These are mutations that reached production and stayed there.',
    },
    {
      id: 'mutations-rolled-back',
      label: 'Mutations rolled back',
      value: throughput.rolled_back,
      description: 'auto-rollback via outcome gate',
      tone: throughput.rolled_back > 0 ? 'warning' : 'subdued',
    },
    {
      id: 'mutations-blocked',
      label: 'Blocked by governance',
      value: throughput.blocked,
      description: 'eval/injection/operator veto',
      tone: throughput.blocked > 0 ? 'danger' : 'subdued',
      tooltip:
        'Mutation intents whose `governance_gate.status` was set to `blocked` — ' +
        'either by a failing eval gate, an injection-surface flag, or an operator veto.',
    },
  ];
};

/**
 * Drift tile (section 3). One tile, two numbers: "open now" headline, "×
 * resolved in window" as context.
 */
const driftTile = (drift: GovernancePulseDrift | null): PulseMetric => {
  if (!drift) {
    return {
      id: 'drift-open',
      label: 'Drift incidents open',
      value: '—',
      description: 'no drift-detected intents tracked',
      tone: 'subdued',
      tooltip:
        'Unresolved drift-detected mutation_intents. A drift signal stays open ' +
        'until the intent is re-evaluated and either re-applied or rolled back.',
    };
  }

  const desc = drift.resolved_count
    ? `${drift.resolved_count} resolved in window`
    : 'no resolutions in window';

  return {
    id: 'drift-open',
    label: 'Drift incidents open',
    value: drift.open_count,
    description: desc,
    tone: drift.open_count === 0 ? 'success' : drift.open_count > 3 ? 'danger' : 'warning',
    tooltip:
      'Count of mutation_intents with drift_detected=true and no resolution yet. ' +
      'Reads `.soc-mutation-intents` at the refresh tick — this is a point-in-time value.',
  };
};

/**
 * Tier-mix tiles (section 4): trusted / probationary / untrusted / system.
 * Each rendered as a small "X of Y" stat. The distribution is the health
 * signal — large probationary/untrusted cohorts signal elevated pressure.
 */
const tierMixTiles = (mix: GovernancePulseTierMix | null): readonly PulseMetric[] => {
  if (!mix || mix.total === 0) {
    return [
      {
        id: 'tier-mix-trusted',
        label: 'Actors trusted',
        value: '—',
        description: 'no trust-tier data',
        tone: 'subdued',
      },
    ];
  }

  const pct = (n: number): string => `${Math.round((n / mix.total) * 100)}%`;

  return [
    {
      id: 'tier-mix-trusted',
      label: 'Actors trusted',
      value: `${mix.trusted}/${mix.total}`,
      description: `${pct(mix.trusted)} of population`,
      tone: mix.trusted / mix.total > 0.66 ? 'success' : 'primary',
    },
    {
      id: 'tier-mix-probationary',
      label: 'Actors probationary',
      value: mix.probationary,
      description: pct(mix.probationary),
      tone: mix.probationary === 0 ? 'success' : 'warning',
    },
    {
      id: 'tier-mix-untrusted',
      label: 'Actors untrusted',
      value: mix.untrusted,
      description: pct(mix.untrusted),
      tone: mix.untrusted === 0 ? 'success' : 'danger',
    },
    {
      id: 'tier-mix-system',
      label: 'System principals',
      value: mix.system,
      description: pct(mix.system),
      tone: 'subdued',
    },
  ];
};

const DEMO_PULSE: GovernancePulse = {
  window_start: 'now-24h',
  window_end: 'now',
  rollback_mttr: null,
  mutation_throughput: { applied: 7, rolled_back: 1, blocked: 2 },
  drift: { open_count: 3, resolved_count: 2 },
  tier_mix: { trusted: 6, probationary: 2, untrusted: 1, system: 3, total: 12 },
};

interface TileRowProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly metrics: readonly PulseMetric[];
  readonly isLoading?: boolean;
  readonly onMetricClick?: (metricId: string) => void;
}

const TileRow: React.FC<TileRowProps> = ({ title, subtitle, metrics, isLoading, onMetricClick }) => (
  <>
    <EuiFlexGroup alignItems="baseline" gutterSize="s" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiText size="s">
          <strong>{title}</strong>
        </EuiText>
      </EuiFlexItem>
      {subtitle ? (
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {subtitle}
          </EuiText>
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
    <EuiSpacer size="xs" />
    <EuiFlexGroup wrap gutterSize="m">
      {metrics.map((metric) => {
        const isClickable = Boolean(onMetricClick);
        const stat = (
          <EuiStat
            title={metric.value}
            description={metric.label}
            titleColor={metric.tone === 'accent' ? 'accent' : metric.tone ?? 'primary'}
            titleSize="s"
            reverse
            isLoading={isLoading}
          />
        );

        return (
          <EuiFlexItem key={metric.id} grow={false} style={{ minWidth: 200 }}>
            <EuiPanel
              hasShadow={false}
              hasBorder
              paddingSize="m"
              data-test-subj={`argusPulseTile-${metric.id}`}
              onClick={isClickable ? () => onMetricClick!(metric.id) : undefined}
              style={isClickable ? { cursor: 'pointer' } : undefined}
            >
              {metric.tooltip ? (
                <EuiToolTip position="top" content={metric.tooltip}>
                  {stat}
                </EuiToolTip>
              ) : (
                stat
              )}
              {metric.description ? (
                <EuiText size="xs" color="subdued">
                  {metric.description}
                </EuiText>
              ) : null}
            </EuiPanel>
          </EuiFlexItem>
        );
      })}
    </EuiFlexGroup>
  </>
);

export const PulsePanel: React.FC<PulsePanelProps> = ({ http, metrics: metricsOverride, onMetricClick }) => {
  const pulse = useGovernancePulse({
    http: http as ArgusHttp,
    enabled: Boolean(http),
    // Live-demo cadence: refresh widgets every 10s so throughput / MTTR /
    // drift counters keep moving between ticker emits. Cheap (single ES
    // round-trip) and cancelled on unmount.
    refreshIntervalMs: 10_000,
  });

  const payload = useMemo<GovernancePulse>(() => {
    if (pulse.status === 'success') return pulse.data;
    return DEMO_PULSE;
  }, [pulse]);

  const isLoading = Boolean(http) && pulse.status === 'loading';
  const hasLiveData = pulse.status === 'success';

  // `metricsOverride` short-circuits everything — tests use it to pass a fixed
  // list into the panel without bothering with live fetches.
  const overrideRow = metricsOverride ? (
    <TileRow title="Metrics" metrics={metricsOverride} />
  ) : null;

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="argusConsolePulsePanel">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{'Argus pulse'}</h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {'Cross-layer health summary over '}
            <code>{payload.window_start}</code>
            {' → '}
            <code>{payload.window_end}</code>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={hasLiveData ? 'success' : 'hollow'}>
            {hasLiveData ? 'live' : 'demo-grade'}
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isLoading ? (
        <>
          <EuiSpacer size="m" />
          <EuiProgress size="xs" color="primary" />
        </>
      ) : null}

      <EuiSpacer size="m" />

      {overrideRow ?? (
        <>
          <TileRow
            title="Governance recovery"
            subtitle="rollback MTTR (.soc-outcomes.rollback_mttr_ms)"
            metrics={[mttrTile(payload.rollback_mttr)]}
            isLoading={isLoading}
            onMetricClick={onMetricClick}
          />

          <EuiHorizontalRule margin="m" />

          <TileRow
            title="Mutation throughput"
            subtitle="applied · rolled back · blocked (.soc-mutation-intents + .soc-outcomes)"
            metrics={throughputTiles(payload.mutation_throughput)}
            isLoading={isLoading}
            onMetricClick={onMetricClick}
          />

          <EuiHorizontalRule margin="m" />

          <TileRow
            title="Drift signals"
            subtitle="unresolved drift-detected intents"
            metrics={[driftTile(payload.drift)]}
            isLoading={isLoading}
            onMetricClick={onMetricClick}
          />

          <EuiHorizontalRule margin="m" />

          <TileRow
            title="Trust tier mix"
            subtitle="actor distribution (.soc-actor-trust-tiers, most-recent-per-actor)"
            metrics={tierMixTiles(payload.tier_mix)}
            isLoading={isLoading}
            onMetricClick={onMetricClick}
          />
        </>
      )}
    </EuiPanel>
  );
};
