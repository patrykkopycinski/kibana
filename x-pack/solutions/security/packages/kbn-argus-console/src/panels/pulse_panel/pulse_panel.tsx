/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiBadge,
  EuiCallOut,
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
  GovernancePulseCoverageTrend,
  GovernancePulseDrift,
  GovernancePulseHoursSaved,
  GovernancePulseMttd,
  GovernancePulseMttr,
  GovernancePulseSignalToNoise,
  GovernancePulseThroughput,
  GovernancePulseTierMix,
  GovernancePulseTriggerToRule,
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
   * Optional core HTTP client. When provided (and `demoMode` is false), the panel
   * fetches live governance metrics and renders all four widget groups (MTTR,
   * throughput, drift, tier mix).
   */
  readonly http?: ArgusHttp;
  /**
   * When true, skips the governance-pulse request and renders the static
   * `DEMO_PULSE` tile set (Storybook, marketing screenshots, offline demos).
   * Never used as an error fallback — fetch failures surface a callout instead.
   */
  readonly demoMode?: boolean;
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
 * MTTD tile — vision-doc 4.4 success metric (B11).
 *
 * Mirrors the MTTR tile: shows the p50 as the headline (single-outlier
 * resistant), with avg + p95 in the description. Tone bands are tighter than
 * MTTR because detection latency is normally measured in seconds-to-minutes,
 * not minutes-to-hours: <30s success, <2min warning, >2min danger.
 */
const mttdTone = (p50Ms: number | null): PulseMetric['tone'] => {
  if (p50Ms === null) return 'subdued';
  if (p50Ms < 30_000) return 'success';
  if (p50Ms < 2 * 60_000) return 'warning';
  return 'danger';
};

const mttdTile = (mttd: GovernancePulseMttd | null): PulseMetric => {
  if (!mttd || mttd.p50_ms === null) {
    return {
      id: 'detection-mttd',
      label: 'Detection MTTD (p50)',
      value: '—',
      description: 'no detection outcomes in window',
      tone: 'subdued',
      tooltip:
        'Median time between attack signal availability and the corresponding alert ' +
        'firing, measured across .soc-outcomes.time_to_detect. Vision-doc 4.4 success metric.',
    };
  }

  const descParts: string[] = [
    `${mttd.detect_count} detection${mttd.detect_count === 1 ? '' : 's'}`,
  ];
  if (mttd.avg_ms !== null) descParts.push(`avg ${formatDuration(mttd.avg_ms)}`);
  if (mttd.p95_ms !== null) descParts.push(`p95 ${formatDuration(mttd.p95_ms)}`);

  return {
    id: 'detection-mttd',
    label: 'Detection MTTD (p50)',
    value: formatDuration(mttd.p50_ms),
    description: descParts.join(' · '),
    tone: mttdTone(mttd.p50_ms),
    tooltip:
      'Median time between an attack signal first being available in events and the ' +
      'corresponding alert firing. Sourced from .soc-outcomes.time_to_detect over ' +
      'the window. Vision-doc 4.4 — a primary success metric for the Detection Engine.',
  };
};

/**
 * Hours-saved proxy tone (B12). The headline metric is *intentionally*
 * allowed to go negative when human-handled rollbacks dominate — that is the
 * failure mode AutoDEX governance exists to prevent and the tile must
 * surface it loudly.
 */
const hoursSavedTone = (totalHours: number | null): PulseMetric['tone'] => {
  if (totalHours === null) return 'subdued';
  if (totalHours < 0) return 'danger';
  if (totalHours < 4) return 'warning';
  return 'success';
};

/**
 * Format a non-negative hour count for the headline tile. Whole numbers
 * render without a decimal, fractional values keep one decimal so a 1.5h
 * proxy doesn't read as "2 h" or "1 h" on the dashboard.
 */
const formatHours = (hours: number): string => {
  const rounded = Math.round(hours * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded} h`;
  return `${rounded.toFixed(1)} h`;
};

const hoursSavedTile = (hoursSaved: GovernancePulseHoursSaved | null): PulseMetric => {
  if (!hoursSaved) {
    return {
      id: 'hours-saved',
      label: 'Estimated analyst hours saved',
      value: '—',
      description: 'no AutoDEX activity in window',
      tone: 'subdued',
      tooltip:
        'Estimated analyst hours saved (proxy). Sourced from rules autonomously authored, ' +
        'alerts auto-triaged, and rollbacks auto-recovered, weighted by per-action minute ' +
        'constants. See B12 RFC for the model. Vision-doc 4.3 success metric.',
    };
  }

  const { breakdown, source_counts: sourceCounts, total_hours: totalHours } = hoursSaved;
  // Build a compact breakdown sentence ("6 h authoring · 5 h triage · 1 h
  // recovery · -0 h rollback cost"). Skip zero-hour rows in the description
  // so the line stays readable on small windows; the headline still reflects
  // the full math.
  const descParts: string[] = [];
  if (breakdown.authoring_hours !== 0) {
    descParts.push(`${formatHours(breakdown.authoring_hours)} authoring`);
  }
  if (breakdown.triage_hours !== 0) {
    descParts.push(`${formatHours(breakdown.triage_hours)} triage`);
  }
  if (breakdown.recovery_hours !== 0) {
    descParts.push(`${formatHours(breakdown.recovery_hours)} auto-recovery`);
  }
  if (breakdown.human_rollback_hours !== 0) {
    // Already negative — render with explicit sign so the cost is unambiguous.
    descParts.push(`${formatHours(breakdown.human_rollback_hours)} human rollback`);
  }
  if (descParts.length === 0) {
    descParts.push('no observable contributions');
  }

  const totalRules = sourceCounts.rules_authored;
  const tooltipParts: string[] = [
    `${totalRules} rule${totalRules === 1 ? '' : 's'} authored, ` +
      `${sourceCounts.auto_triaged_outcomes} auto-triaged, ` +
      `${sourceCounts.auto_recovered_rollbacks} auto-recovered, ` +
      `${sourceCounts.human_rollbacks} human-handled.`,
    'Proxy from .soc-outcomes × tunable per-action minute constants. See B12 RFC.',
  ];

  // Render negative totals with explicit sign so leadership reads "-2 h"
  // rather than misinterpreting "2 h" as a saving.
  const headline =
    totalHours < 0 ? `-${formatHours(Math.abs(totalHours))}` : formatHours(totalHours);

  return {
    id: 'hours-saved',
    label: 'Estimated analyst hours saved',
    value: headline,
    description: descParts.join(' · '),
    tone: hoursSavedTone(totalHours),
    tooltip: tooltipParts.join(' '),
  };
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
        'across .soc-outcomes. Instrumented by soc_recovery.yaml (ARGUS R6).',
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
      'Emitted by soc_recovery.yaml (.soc-outcomes.rollback_mttr_ms) and aggregated ' +
      'by the trust-tier assessor.',
  };
};

/**
 * Throughput tiles (section 2): applied / rolled_back / blocked over the
 * window. Reads both `.soc-outcomes` (applied + rolled_back) and
 * `.soc-mutation-intents` (blocked by governance).
 */
const throughputTiles = (throughput: GovernancePulseThroughput | null): readonly PulseMetric[] => {
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

/**
 * Vision-doc 1.6.8 — signal-to-noise tile (S/N).
 *
 * Tone bands favour the SOC perspective: anything below 50% is danger
 * (alerts mostly noise), 50–80% warning, ≥80% success (alerts mostly real).
 */
const snrTone = (ratio: number | null): PulseMetric['tone'] => {
  if (ratio === null) return 'subdued';
  if (ratio >= 0.8) return 'success';
  if (ratio >= 0.5) return 'warning';
  return 'danger';
};

const formatPercent = (ratio: number): string => `${(ratio * 100).toFixed(0)}%`;

const signalToNoiseTile = (snr: GovernancePulseSignalToNoise | null): PulseMetric => {
  if (!snr || snr.confirmed_ratio === null) {
    return {
      id: 'signal-to-noise',
      label: 'Signal-to-noise (TP/total)',
      value: '—',
      description: 'no labelled outcomes in window',
      tone: 'subdued',
      tooltip:
        'Confirmed-rate across labelled outcomes — confirmed / (confirmed + ' +
        'false_positive). Sourced from .soc-outcomes.disposition. Vision-doc ' +
        '1.6.8 — performance telemetry "signal-to-noise" headline metric.',
    };
  }
  const total = snr.confirmed + snr.false_positive;
  return {
    id: 'signal-to-noise',
    label: 'Signal-to-noise (TP/total)',
    value: formatPercent(snr.confirmed_ratio),
    description: `${snr.confirmed} confirmed · ${snr.false_positive} FP · ${total} labelled`,
    tone: snrTone(snr.confirmed_ratio),
    tooltip:
      'TP-rate across labelled outcomes in the window. Higher is better — ' +
      '≥80% means alerts are mostly real, <50% means the SOC is drowning in ' +
      'false positives. Vision-doc 1.6.8.',
  };
};

/**
 * Vision-doc 4.1 — trigger-to-rule synthesis lag tile.
 *
 * The vision-doc target is "<1 min". We surface compliance ratio as the
 * headline (e.g. "85% under 1m") and the p50 lag as context. Tone bands
 * are tighter than MTTD: ≥95% compliance success, ≥75% warning, otherwise
 * danger.
 */
const triggerToRuleTone = (ratio: number | null): PulseMetric['tone'] => {
  if (ratio === null) return 'subdued';
  if (ratio >= 0.95) return 'success';
  if (ratio >= 0.75) return 'warning';
  return 'danger';
};

const triggerToRuleTile = (lag: GovernancePulseTriggerToRule | null): PulseMetric => {
  if (!lag) {
    return {
      id: 'trigger-to-rule',
      label: 'Trigger-to-rule (<1m compliance)',
      value: '—',
      description: 'no synthesis runs in window',
      tone: 'subdued',
      tooltip:
        'Fraction of mutation_intents whose synthesis_lag_ms is under 60s. ' +
        'Sourced from .soc-mutation-intents.synthesis_lag_ms (advisory ingest → ' +
        'mutation_intent built). Vision-doc 4.1 success metric.',
    };
  }
  const desc = `${lag.lag_count_under_60s}/${lag.lag_count} runs <1m${
    lag.p50_ms !== null ? ` · p50 ${formatDuration(lag.p50_ms)}` : ''
  }`;
  return {
    id: 'trigger-to-rule',
    label: 'Trigger-to-rule (<1m compliance)',
    value: formatPercent(lag.under_one_minute_ratio ?? 0),
    description: desc,
    tone: triggerToRuleTone(lag.under_one_minute_ratio),
    tooltip:
      'Vision-doc 4.1 target compliance — fraction of synthesis runs that ' +
      'completed within 60s of advisory ingest. p50 / avg / p95 frame the ' +
      'distribution; 100% means every synthesis was sub-minute.',
  };
};

/**
 * Vision-doc 4.2 — ATT&CK coverage trend tile.
 *
 * The headline is the latest coverage_pct; the description shows the delta
 * vs the window-baseline ("+3.2pp last 24h"). A negative delta is rendered
 * as `danger` — coverage regression is itself a drift signal.
 */
const coverageTrendTone = (deltaPp: number | null): PulseMetric['tone'] => {
  if (deltaPp === null) return 'subdued';
  if (deltaPp > 0) return 'success';
  if (deltaPp === 0) return 'subdued';
  return 'danger';
};

const coverageTrendTile = (trend: GovernancePulseCoverageTrend | null): PulseMetric => {
  if (!trend) {
    return {
      id: 'coverage-trend',
      label: 'ATT&CK coverage',
      value: '—',
      description: 'fewer than two snapshots in window',
      tone: 'subdued',
      tooltip:
        'Latest ATT&CK coverage % from .soc-coverage-snapshots, with delta ' +
        'vs the oldest snapshot in the window. Producer: ' +
        'soc_argus_coverage_snapshotter (1h cadence). Vision-doc 4.2.',
    };
  }
  const delta = trend.delta_pp;
  const sign = delta > 0 ? '+' : delta < 0 ? '' : '±';
  return {
    id: 'coverage-trend',
    label: 'ATT&CK coverage',
    value: `${trend.current.coverage_pct.toFixed(2)}%`,
    description:
      `${trend.current.covered_techniques}/${trend.current.total_techniques} techniques · ` +
      `${sign}${delta.toFixed(2)}pp vs baseline`,
    tone: coverageTrendTone(delta),
    tooltip:
      'Latest coverage_pct surfaced from .soc-coverage-snapshots. Trend = ' +
      'current.coverage_pct − baseline.coverage_pct (in percentage points). ' +
      'Negative ⇒ coverage regression — itself a drift signal worth ' +
      'investigating. Vision-doc 4.2 success metric.',
  };
};

const DEMO_PULSE: GovernancePulse = {
  window_start: 'now-24h',
  window_end: 'now',
  mttd: { detect_count: 12, avg_ms: 24_000, p50_ms: 18_000, p95_ms: 72_000 },
  hours_saved: {
    total_hours: 12,
    breakdown: {
      authoring_hours: 6,
      triage_hours: 5,
      recovery_hours: 1,
      human_rollback_hours: 0,
    },
    source_counts: {
      rules_authored: 4,
      auto_triaged_outcomes: 60,
      auto_recovered_rollbacks: 4,
      human_rollbacks: 0,
    },
    applied_constants: {
      minutes_per_authoring: 90,
      minutes_per_triage: 5,
      minutes_per_rollback_recovery: 15,
      minutes_per_human_rollback: 30,
    },
  },
  rollback_mttr: null,
  mutation_throughput: { applied: 7, rolled_back: 1, blocked: 2 },
  drift: { open_count: 3, resolved_count: 2 },
  tier_mix: { trusted: 6, probationary: 2, untrusted: 1, system: 3, total: 12 },
  signal_to_noise: { confirmed: 18, false_positive: 2, confirmed_ratio: 0.9 },
  trigger_to_rule: {
    lag_count: 4,
    lag_count_under_60s: 4,
    under_one_minute_ratio: 1,
    avg_ms: 18_000,
    p50_ms: 14_500,
    p95_ms: 41_000,
  },
  coverage_trend: {
    baseline: {
      snapshot_at: '2026-04-19T12:00:00.000Z',
      total_techniques: 200,
      covered_techniques: 110,
      coverage_pct: 55,
    },
    current: {
      snapshot_at: '2026-04-20T11:00:00.000Z',
      total_techniques: 200,
      covered_techniques: 124,
      coverage_pct: 62,
    },
    delta_pp: 7,
  },
};

/** Placeholder while loading or when live data is unavailable (never masked as demo). */
const EMPTY_PULSE_PLACEHOLDER: GovernancePulse = {
  window_start: 'now-24h',
  window_end: 'now',
  mttd: null,
  hours_saved: null,
  rollback_mttr: null,
  mutation_throughput: null,
  drift: null,
  tier_mix: null,
  signal_to_noise: null,
  trigger_to_rule: null,
  coverage_trend: null,
};

interface TileRowProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly metrics: readonly PulseMetric[];
  readonly isLoading?: boolean;
  readonly onMetricClick?: (metricId: string) => void;
}

const TileRow: React.FC<TileRowProps> = ({
  title,
  subtitle,
  metrics,
  isLoading,
  onMetricClick,
}) => (
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
              onClick={isClickable && onMetricClick ? () => onMetricClick(metric.id) : undefined}
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

export const PulsePanel: React.FC<PulsePanelProps> = ({
  http,
  demoMode = false,
  metrics: metricsOverride,
  onMetricClick,
}) => {
  const useLiveFetch = Boolean(http) && !demoMode;

  const pulse = useGovernancePulse({
    http: http as ArgusHttp,
    enabled: useLiveFetch,
    // Live-demo cadence: refresh widgets every 10s so throughput / MTTR /
    // drift counters keep moving between ticker emits. Cheap (single ES
    // round-trip) and cancelled on unmount.
    refreshIntervalMs: 10_000,
  });

  const payload = useMemo<GovernancePulse>(() => {
    if (demoMode) {
      return DEMO_PULSE;
    }
    if (pulse.status === 'success') {
      return pulse.data;
    }
    if (pulse.status === 'error') {
      return EMPTY_PULSE_PLACEHOLDER;
    }
    return EMPTY_PULSE_PLACEHOLDER;
  }, [demoMode, pulse]);

  const isLoading = useLiveFetch && pulse.status === 'loading';
  const fetchError = useLiveFetch && pulse.status === 'error' ? pulse.error : undefined;
  const hasLiveData = useLiveFetch && pulse.status === 'success';

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
            <h3>{'ARGUS pulse'}</h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {'Cross-layer health summary over '}
            <code>{payload.window_start}</code>
            {' → '}
            <code>{payload.window_end}</code>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge
            color={fetchError ? 'danger' : demoMode ? 'hollow' : hasLiveData ? 'success' : 'hollow'}
          >
            {fetchError ? 'unavailable' : demoMode ? 'demo' : hasLiveData ? 'live' : 'offline'}
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isLoading ? (
        <>
          <EuiSpacer size="m" />
          <EuiProgress size="xs" color="primary" />
        </>
      ) : null}

      {fetchError ? (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut
            announceOnMount
            title="Could not load governance pulse"
            color="danger"
            iconType="error"
            data-test-subj="argusPulsePanelFetchError"
          >
            {fetchError.message}
          </EuiCallOut>
        </>
      ) : null}

      <EuiSpacer size="m" />

      {overrideRow ?? (
        <>
          <TileRow
            title="Detection responsiveness"
            subtitle="mean time to detect (.soc-outcomes.time_to_detect)"
            metrics={[mttdTile(payload.mttd)]}
            isLoading={isLoading}
            onMetricClick={onMetricClick}
          />

          <EuiHorizontalRule margin="m" />

          <TileRow
            title="Analyst time saved (proxy)"
            subtitle="estimate from .soc-outcomes × per-action minute constants — see B12 RFC"
            metrics={[hoursSavedTile(payload.hours_saved)]}
            isLoading={isLoading}
            onMetricClick={onMetricClick}
          />

          <EuiHorizontalRule margin="m" />

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

          <EuiHorizontalRule margin="m" />

          <TileRow
            title="Signal-to-noise"
            subtitle="confirmed / (confirmed + false_positive) over labelled outcomes — vision §1.6.8"
            metrics={[signalToNoiseTile(payload.signal_to_noise)]}
            isLoading={isLoading}
            onMetricClick={onMetricClick}
          />

          <EuiHorizontalRule margin="m" />

          <TileRow
            title="Trigger-to-rule synthesis lag"
            subtitle="advisory ingest → mutation_intent built (target <1m, vision §4.1)"
            metrics={[triggerToRuleTile(payload.trigger_to_rule)]}
            isLoading={isLoading}
            onMetricClick={onMetricClick}
          />

          <EuiHorizontalRule margin="m" />

          <TileRow
            title="ATT&CK coverage trend"
            subtitle="latest coverage % + delta vs window-baseline (.soc-coverage-snapshots, vision §4.2)"
            metrics={[coverageTrendTile(payload.coverage_trend)]}
            isLoading={isLoading}
            onMetricClick={onMetricClick}
          />
        </>
      )}
    </EuiPanel>
  );
};
