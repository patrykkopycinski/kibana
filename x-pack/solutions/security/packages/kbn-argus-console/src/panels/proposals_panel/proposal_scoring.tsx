/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';

import type {
  ArgusSynthesisComposition,
  ArgusSynthesisDominationReason,
  ArgusSynthesisPredicted,
  ArgusSynthesisProposal,
  ArgusSynthesisWeights,
  ArgusVariantAxisName,
} from '@kbn/argus-console-common';

export const formatNumber = (n: number): string => n.toFixed(2);
export const formatPercent = (n: number): string => `${(n * 100).toFixed(0)}%`;

export const tierBadge = (tier: ArgusSynthesisProposal['tier']): JSX.Element => {
  switch (tier) {
    case 'chosen':
      return <EuiBadge color="success">{'Chosen'}</EuiBadge>;
    case 'frontier':
      return <EuiBadge color="primary">{'Frontier'}</EuiBadge>;
    case 'dominated':
      return <EuiBadge color="hollow">{'Dominated'}</EuiBadge>;
    default:
      return <EuiBadge color="default">{tier}</EuiBadge>;
  }
};

export const compositionSummary = (c: ArgusSynthesisComposition): string =>
  `${c.must_anchor_subset === 'all' ? 'all-anchors' : 'primary-anchor'} · ${
    c.wildcard_retention === 'full' ? 'full-wildcards' : 'strict-wildcards'
  } · msm=${c.minimum_should_match}`;

export const AXIS_LABEL: Record<ArgusSynthesisDominationReason['axis'], string> = {
  precision: 'precision',
  recall: 'recall',
  fp_rate: 'FP rate',
  axis_fn_mean: 'axis coverage',
};

/**
 * Plain-English tooltip copy for each composition knob. Surfaced in the
 * expanded row so demo viewers can understand what "all-anchors" etc.
 * actually changes in the emitted rule.
 */
export const compositionExplainer = (
  c: ArgusSynthesisComposition
): Array<{ label: string; value: string; description: string }> => [
  {
    label: 'Anchor subset',
    value: c.must_anchor_subset === 'all' ? 'all-anchors' : 'primary-anchor',
    description:
      c.must_anchor_subset === 'all'
        ? 'Every advisory anchor (process, path, registry, network indicator) must match. Narrower query, higher precision.'
        : 'Only the primary anchor must match. Catches variants that drop secondary indicators — higher recall, more false positives.',
  },
  {
    label: 'Wildcard retention',
    value: c.wildcard_retention === 'full' ? 'full-wildcards' : 'strict-wildcards',
    description:
      c.wildcard_retention === 'full'
        ? 'Advisory wildcards kept as-is. Matches more process-name permutations but costs latency and FP budget.'
        : 'Wildcards stripped to literals. Cheaper at runtime and less noisy, but misses adversary renames.',
  },
  {
    label: 'Minimum-should-match',
    value: `msm=${c.minimum_should_match}`,
    description:
      c.minimum_should_match === 2
        ? 'At least two optional clauses must match. Sharper pick, tends to dominate on precision.'
        : 'Any single optional clause matches. Wider net, tends to dominate on recall.',
  },
];

export type PredictedAxisKey = 'precision' | 'recall' | 'fp_rate' | 'axis_fn_mean';

export const PREDICTED_LABEL: Record<PredictedAxisKey, { label: string; hint: string }> = {
  precision: {
    label: 'Precision',
    hint: 'Fraction of rule hits that are true positives (higher is better).',
  },
  recall: {
    label: 'Recall',
    hint: 'Fraction of advisory signals the rule catches (higher is better).',
  },
  fp_rate: {
    label: 'FP rate',
    hint: 'Predicted false positives on benign traffic (lower is better).',
  },
  axis_fn_mean: {
    label: 'Axis coverage',
    hint: 'Mean variant-axis coverage across the advisory grid (higher is better).',
  },
};

/**
 * Direction of each axis: `higher` means the bar fill tracks the value
 * directly; `lower` means the bar fills to `1 - value` so "good" is always
 * the visual right-hand side of the bar.
 */
export const PREDICTED_DIRECTION: Record<PredictedAxisKey, 'higher' | 'lower'> = {
  precision: 'higher',
  recall: 'higher',
  fp_rate: 'lower',
  axis_fn_mean: 'higher',
};

export const VARIANT_AXIS_LABEL: Record<ArgusVariantAxisName, string> = {
  command_args: 'Command args',
  encoding_layers: 'Encoding layers',
  process_ancestry: 'Process ancestry',
  timing_jitter_ms: 'Timing jitter',
  named_pipe_vs_stdout: 'Named pipe / stdout',
  living_off_land: 'Living-off-the-land',
};

export const VARIANT_AXIS_ORDER: readonly ArgusVariantAxisName[] = [
  'command_args',
  'encoding_layers',
  'process_ancestry',
  'timing_jitter_ms',
  'named_pipe_vs_stdout',
  'living_off_land',
];

/**
 * Compare this candidate's composition against the chosen one and return a
 * human label for each knob that differs. Used to explain "why this row is
 * not the chosen pick" at the composition level (the weighted-score
 * explanation picks up the performance level).
 */
export const compositionDiff = (
  row: ArgusSynthesisComposition,
  chosen: ArgusSynthesisComposition
): string[] => {
  const diffs: string[] = [];
  if (row.must_anchor_subset !== chosen.must_anchor_subset) {
    diffs.push(
      `anchors: ${row.must_anchor_subset === 'all' ? 'all' : 'primary-only'} (chosen: ${
        chosen.must_anchor_subset === 'all' ? 'all' : 'primary-only'
      })`
    );
  }
  if (row.wildcard_retention !== chosen.wildcard_retention) {
    diffs.push(`wildcards: ${row.wildcard_retention} (chosen: ${chosen.wildcard_retention})`);
  }
  if (row.minimum_should_match !== chosen.minimum_should_match) {
    diffs.push(`msm=${row.minimum_should_match} (chosen: msm=${chosen.minimum_should_match})`);
  }
  return diffs;
};

/**
 * One-liner describing what the emitted Elasticsearch query is going to
 * look like for this composition. Purely derived — no backend dependency —
 * so reviewers who can't read the generated `draft_rule.query` still get a
 * sense of how strict the rule is.
 */
export const queryShapeHint = (c: ArgusSynthesisComposition): string => {
  const anchors = c.must_anchor_subset === 'all' ? 'every anchor signal' : 'the primary anchor';
  const wildcards =
    c.wildcard_retention === 'full' ? 'all wildcard signals kept' : 'broadest wildcard stripped';
  const msm =
    c.minimum_should_match === 2
      ? 'and at least two optional clauses must match'
      : 'and any optional clause counts';
  return `Rule requires ${anchors}; ${wildcards}, ${msm}.`;
};

export const signedDelta = (delta: number): string => `${delta >= 0 ? '+' : ''}${formatNumber(delta)}`;

export const deltaColor = (
  delta: number,
  direction: 'higher' | 'lower'
): 'success' | 'danger' | 'subdued' => {
  if (Math.abs(delta) < 0.005) return 'subdued';
  const good = direction === 'higher' ? delta > 0 : delta < 0;
  return good ? 'success' : 'danger';
};

export interface MetricBarProps {
  readonly value: number;
  readonly reference?: number;
  readonly direction: 'higher' | 'lower';
}

const BAR_HEIGHT = 6;
const BAR_WIDTH = 140;

/**
 * Compact horizontal bar for a single `[0, 1]` metric. When `reference` is
 * supplied the chosen candidate's value is drawn as a tick mark so viewers
 * can see at a glance how far above/below the pick each candidate sits.
 * `direction` controls which end of the bar is "good": `lower` rates
 * mirror the fill so FP rate reads left-to-right like the others.
 */
export const MetricBar: React.FC<MetricBarProps> = ({ value, reference, direction }) => {
  const fillValue = direction === 'higher' ? value : 1 - value;
  const refValue =
    reference !== undefined ? (direction === 'higher' ? reference : 1 - reference) : undefined;
  const fillColor = direction === 'higher' ? '#00BFB3' : '#FEC514';
  return (
    <svg
      width={BAR_WIDTH}
      height={BAR_HEIGHT + 6}
      viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT + 6}`}
      role="presentation"
      aria-hidden
      style={{ display: 'block' }}
    >
      <rect x={0} y={3} width={BAR_WIDTH} height={BAR_HEIGHT} rx={3} fill="#E5ECF5" />
      <rect
        x={0}
        y={3}
        width={Math.max(0, Math.min(1, fillValue)) * BAR_WIDTH}
        height={BAR_HEIGHT}
        rx={3}
        fill={fillColor}
      />
      {refValue !== undefined ? (
        <line
          x1={refValue * BAR_WIDTH}
          x2={refValue * BAR_WIDTH}
          y1={0}
          y2={BAR_HEIGHT + 6}
          stroke="#343741"
          strokeWidth={1.5}
          strokeDasharray="2 2"
        />
      ) : null}
    </svg>
  );
};

/**
 * Weighted score the Pareto picker uses to break ties between frontier
 * candidates. `fp_rate` is inverted because lower is better. Same shape as
 * `scoreCandidate` in `synthesize_pareto.ts` so the demo numbers line up
 * with the backend pick.
 */
export const weightedScore = (p: ArgusSynthesisPredicted, w: ArgusSynthesisWeights): number =>
  p.precision * w.precision +
  p.recall * w.recall +
  (1 - p.fp_rate) * w.fp_rate +
  p.axis_fn_mean * w.axis_fn;

export const renderDominationReasons = (
  reasons: readonly ArgusSynthesisDominationReason[]
): JSX.Element => (
  <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
    {reasons.map((r) => {
      const glyph = r.direction === 'higher_is_better' ? '↓' : '↑';
      return (
        <EuiFlexItem key={r.axis} grow={false}>
          <EuiText size="xs" color="subdued">
            {`${glyph} ${AXIS_LABEL[r.axis]}: ${formatNumber(r.candidate_value)} vs ${formatNumber(
              r.dominator_value
            )}`}
          </EuiText>
        </EuiFlexItem>
      );
    })}
  </EuiFlexGroup>
);
