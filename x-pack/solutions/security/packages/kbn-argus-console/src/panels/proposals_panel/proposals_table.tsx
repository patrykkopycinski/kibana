/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  type EuiBasicTableColumn,
  EuiButtonIcon,
  EuiCode,
  EuiDescriptionList,
  type EuiDescriptionListProps,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';

import type {
  ArgusSynthesisComposition,
  ArgusSynthesisDominationReason,
  ArgusSynthesisPredicted,
  ArgusSynthesisProposal,
  ArgusSynthesisWeights,
  ArgusVariantAxisName,
} from '@kbn/argus-console-common';

export interface ProposalsTableProps {
  readonly proposals: readonly ArgusSynthesisProposal[];
  /**
   * Weights the Pareto picker used to break ties between frontier
   * candidates. When present, the expanded row shows each candidate's
   * weighted score so the user can see *why* `chosen` outranks the other
   * frontier picks even though every frontier row is Pareto-optimal.
   */
  readonly weights?: ArgusSynthesisWeights;
  /**
   * Compact mode drops composition detail and shrinks the row padding so
   * the table fits inside the E2D Synthesis stage card without dominating
   * the timeline. `false` is the dedicated-tab layout and adds the tier
   * legend + expandable per-row detail.
   */
  readonly compact?: boolean;
}

const formatNumber = (n: number): string => n.toFixed(2);
const formatPercent = (n: number): string => `${(n * 100).toFixed(0)}%`;

const tierBadge = (tier: ArgusSynthesisProposal['tier']): JSX.Element => {
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

const compositionSummary = (c: ArgusSynthesisComposition): string =>
  `${c.must_anchor_subset === 'all' ? 'all-anchors' : 'primary-anchor'} · ${
    c.wildcard_retention === 'full' ? 'full-wildcards' : 'strict-wildcards'
  } · msm=${c.minimum_should_match}`;

const AXIS_LABEL: Record<ArgusSynthesisDominationReason['axis'], string> = {
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
const compositionExplainer = (
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

type PredictedAxisKey = 'precision' | 'recall' | 'fp_rate' | 'axis_fn_mean';

const PREDICTED_LABEL: Record<PredictedAxisKey, { label: string; hint: string }> = {
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
const PREDICTED_DIRECTION: Record<PredictedAxisKey, 'higher' | 'lower'> = {
  precision: 'higher',
  recall: 'higher',
  fp_rate: 'lower',
  axis_fn_mean: 'higher',
};

const VARIANT_AXIS_LABEL: Record<ArgusVariantAxisName, string> = {
  command_args: 'Command args',
  encoding_layers: 'Encoding layers',
  process_ancestry: 'Process ancestry',
  timing_jitter_ms: 'Timing jitter',
  named_pipe_vs_stdout: 'Named pipe / stdout',
  living_off_land: 'Living-off-the-land',
};

const VARIANT_AXIS_ORDER: readonly ArgusVariantAxisName[] = [
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
const compositionDiff = (
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
const queryShapeHint = (c: ArgusSynthesisComposition): string => {
  const anchors = c.must_anchor_subset === 'all' ? 'every anchor signal' : 'the primary anchor';
  const wildcards =
    c.wildcard_retention === 'full' ? 'all wildcard signals kept' : 'broadest wildcard stripped';
  const msm =
    c.minimum_should_match === 2
      ? 'and at least two optional clauses must match'
      : 'and any optional clause counts';
  return `Rule requires ${anchors}; ${wildcards}, ${msm}.`;
};

const signedDelta = (delta: number): string => `${delta >= 0 ? '+' : ''}${formatNumber(delta)}`;

const deltaColor = (
  delta: number,
  direction: 'higher' | 'lower'
): 'success' | 'danger' | 'subdued' => {
  if (Math.abs(delta) < 0.005) return 'subdued';
  const good = direction === 'higher' ? delta > 0 : delta < 0;
  return good ? 'success' : 'danger';
};

interface MetricBarProps {
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
const MetricBar: React.FC<MetricBarProps> = ({ value, reference, direction }) => {
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
const weightedScore = (p: ArgusSynthesisPredicted, w: ArgusSynthesisWeights): number =>
  p.precision * w.precision +
  p.recall * w.recall +
  (1 - p.fp_rate) * w.fp_rate +
  p.axis_fn_mean * w.axis_fn;

const renderDominationReasons = (
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

const TierLegend: React.FC = () => (
  <EuiAccordion
    id="argus-proposals-tier-legend"
    buttonContent={
      <EuiText size="xs" color="subdued">
        {'What do Chosen / Frontier / Dominated mean?'}
      </EuiText>
    }
    paddingSize="s"
    data-test-subj="argus-proposals-tier-legend"
  >
    <EuiPanel color="subdued" paddingSize="s" hasBorder={false}>
      <EuiDescriptionList
        type="column"
        compressed
        titleProps={{ style: { width: 90 } }}
        listItems={[
          {
            title: <EuiBadge color="success">{'Chosen'}</EuiBadge>,
            description:
              'The single candidate Argus promoted to the detection-eval gate. Picked from the Pareto frontier by the tenant-configured weights (shown above). This is what becomes the draft rule.',
          },
          {
            title: <EuiBadge color="primary">{'Frontier'}</EuiBadge>,
            description:
              'Pareto-optimal: no other candidate is strictly better on every axis. These are valid alternatives — a recall-biased tenant, or one that cared less about FP rate, might have picked one of these instead. They lost the weighted tie-break to the chosen candidate.',
          },
          {
            title: <EuiBadge color="hollow">{'Dominated'}</EuiBadge>,
            description:
              'Strictly worse than at least one frontier candidate — beaten on every scored axis by the same competitor. Kept in the audit trail so reviewers can see what was considered and rejected, but never promoted to a rule.',
          },
        ]}
      />
      <EuiSpacer size="s" />
      <EuiText size="xs" color="subdued">
        <em>
          {
            'Pareto synthesis enumerates up to eight rule compositions per advisory, predicts each one\u2019s precision / recall / FP rate / axis coverage, and keeps only candidates that aren\u2019t dominated on every axis. The tenant weights then break ties on the frontier.'
          }
        </em>
      </EuiText>
    </EuiPanel>
  </EuiAccordion>
);

interface DetailCardProps {
  readonly row: ArgusSynthesisProposal;
  readonly chosen?: ArgusSynthesisProposal;
  readonly weights?: ArgusSynthesisWeights;
  readonly chosenScore?: number;
  readonly rank?: number;
  readonly totalRanked?: number;
}

const DetailCard: React.FC<DetailCardProps> = ({
  row,
  chosen,
  weights,
  chosenScore,
  rank,
  totalRanked,
}) => {
  const compositionItems: EuiDescriptionListProps['listItems'] = compositionExplainer(
    row.composition
  ).map((knob) => ({
    title: (
      <EuiText size="xs">
        <strong>{knob.label}</strong>
        <span style={{ opacity: 0.7 }}>{` \u00b7 ${knob.value}`}</span>
      </EuiText>
    ),
    description: (
      <EuiText size="xs" color="subdued">
        {knob.description}
      </EuiText>
    ),
  }));

  const rowScore = weights ? weightedScore(row.predicted, weights) : undefined;
  const scoreDelta =
    rowScore !== undefined && chosenScore !== undefined ? rowScore - chosenScore : undefined;

  const predictedKeys: readonly PredictedAxisKey[] = [
    'precision',
    'recall',
    'fp_rate',
    'axis_fn_mean',
  ];

  const metricRows = predictedKeys.map((key) => {
    const value = row.predicted[key];
    const reference = chosen?.predicted[key];
    const direction = PREDICTED_DIRECTION[key];
    const delta =
      reference !== undefined && row.candidate_id !== chosen?.candidate_id
        ? value - reference
        : undefined;
    return { key, value, reference, direction, delta };
  });

  const axisFn = row.predicted.axis_fn;
  const chosenAxisFn = chosen?.predicted.axis_fn;
  const axisFnRows = axisFn
    ? VARIANT_AXIS_ORDER.flatMap((axis) => {
        const value = axisFn[axis];
        if (typeof value !== 'number') return [];
        const ref = chosenAxisFn?.[axis];
        const delta =
          ref !== undefined && row.candidate_id !== chosen?.candidate_id ? value - ref : undefined;
        return [{ axis, value, ref, delta }];
      })
    : [];

  const diffs = chosen ? compositionDiff(row.composition, chosen.composition) : [];

  let tierExplanation: React.ReactNode = null;
  if (row.tier === 'chosen') {
    tierExplanation = (
      <EuiText size="xs">
        <strong>{'Why chosen: '}</strong>
        {
          'Top weighted score across the Pareto frontier given this tenant\u2019s precision/recall/FP/axis weights. Promoted to the detection-eval gate and drafted as a rule.'
        }
      </EuiText>
    );
  } else if (row.tier === 'frontier') {
    tierExplanation = (
      <EuiText size="xs">
        <strong>{'Why not picked: '}</strong>
        {
          'Pareto-optimal, so no single axis disqualified it — but the weighted tie-break favoured the chosen candidate.'
        }
        {rowScore !== undefined && scoreDelta !== undefined ? (
          <>
            {' Weighted score '}
            <EuiCode transparentBackground>{formatNumber(rowScore)}</EuiCode>
            {' vs chosen '}
            <EuiCode transparentBackground>{formatNumber(chosenScore ?? 0)}</EuiCode>
            {` (\u0394 ${scoreDelta >= 0 ? '+' : ''}${formatNumber(scoreDelta)}).`}
          </>
        ) : null}
      </EuiText>
    );
  } else if (row.tier === 'dominated') {
    tierExplanation = (
      <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="xs">
            <strong>{'Why not picked: '}</strong>
            {row.dominated_by ? (
              <>
                {'Strictly worse than '}
                <EuiCode transparentBackground>{row.dominated_by.candidate_id}</EuiCode>
                {' on every axis listed below — no tenant weighting would have rescued it.'}
              </>
            ) : (
              'Strictly worse than at least one frontier candidate.'
            )}
          </EuiText>
        </EuiFlexItem>
        {row.dominated_by && row.dominated_by.reasons.length > 0 ? (
          <EuiFlexItem grow={false}>
            {renderDominationReasons(row.dominated_by.reasons)}
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>
    );
  }

  const scoreBreakdownRows = weights
    ? [
        {
          label: 'Precision',
          weight: weights.precision,
          value: row.predicted.precision,
          inverted: false,
        },
        { label: 'Recall', weight: weights.recall, value: row.predicted.recall, inverted: false },
        {
          label: '1 \u2212 FP rate',
          weight: weights.fp_rate,
          value: 1 - row.predicted.fp_rate,
          inverted: true,
        },
        {
          label: 'Axis coverage',
          weight: weights.axis_fn,
          value: row.predicted.axis_fn_mean,
          inverted: false,
        },
      ]
    : [];

  return (
    <EuiPanel
      color="subdued"
      paddingSize="s"
      hasBorder={false}
      data-test-subj={`argus-proposal-detail-${row.candidate_id}`}
    >
      <EuiFlexGroup gutterSize="s" alignItems="center" wrap responsive={false}>
        <EuiFlexItem grow={false}>{tierBadge(row.tier)}</EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiCode transparentBackground>{row.candidate_id}</EuiCode>
        </EuiFlexItem>
        {rank !== undefined && totalRanked !== undefined ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{`Weighted rank ${rank}/${totalRanked}`}</EuiBadge>
          </EuiFlexItem>
        ) : null}
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {queryShapeHint(row.composition)}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      {diffs.length > 0 ? (
        <>
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="subdued" data-test-subj="argus-proposal-detail-diff">
            <strong>{'Differs from chosen on '}</strong>
            {diffs.join(' \u00b7 ')}
          </EuiText>
        </>
      ) : null}
      <EuiSpacer size="s" />
      <EuiFlexGroup responsive={false} gutterSize="l" wrap>
        <EuiFlexItem grow={1} style={{ minWidth: 260 }}>
          <EuiTitle size="xxs">
            <h4>{'Composition'}</h4>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiDescriptionList type="column" compressed listItems={compositionItems} />
        </EuiFlexItem>
        <EuiFlexItem grow={1} style={{ minWidth: 300 }}>
          <EuiTitle size="xxs">
            <h4>{'Predicted performance'}</h4>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiFlexGroup direction="column" gutterSize="s" responsive={false}>
            {metricRows.map(({ key, value, reference, direction, delta }) => (
              <EuiFlexItem key={key} grow={false}>
                <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap={false}>
                  <EuiFlexItem grow={false} style={{ width: 110 }}>
                    <EuiToolTip content={PREDICTED_LABEL[key].hint}>
                      <EuiText size="xs">
                        <strong>{PREDICTED_LABEL[key].label}</strong>
                      </EuiText>
                    </EuiToolTip>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <MetricBar value={value} reference={reference} direction={direction} />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false} style={{ width: 52, textAlign: 'right' }}>
                    <EuiText size="xs">{formatNumber(value)}</EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false} style={{ width: 72, textAlign: 'right' }}>
                    {delta !== undefined ? (
                      <EuiText size="xs" color={deltaColor(delta, direction)}>
                        {`\u0394 ${signedDelta(delta)}`}
                      </EuiText>
                    ) : (
                      <EuiText size="xs" color="subdued">
                        {row.tier === 'chosen' ? 'baseline' : '—'}
                      </EuiText>
                    )}
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
          {rowScore !== undefined && weights ? (
            <>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="subdued">
                <strong>{'Weighted score: '}</strong>
                <EuiCode transparentBackground>{formatNumber(rowScore)}</EuiCode>
                {scoreDelta !== undefined && row.candidate_id !== chosen?.candidate_id ? (
                  <>
                    {' '}
                    <span style={{ opacity: 0.8 }}>
                      {`(\u0394 ${signedDelta(scoreDelta)} vs chosen)`}
                    </span>
                  </>
                ) : null}
              </EuiText>
              <EuiSpacer size="xs" />
              <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
                {scoreBreakdownRows.map((b) => (
                  <EuiFlexItem key={b.label} grow={false}>
                    <EuiFlexGroup
                      gutterSize="s"
                      alignItems="center"
                      responsive={false}
                      wrap={false}
                    >
                      <EuiFlexItem grow={false} style={{ width: 110 }}>
                        <EuiText size="xs" color="subdued">
                          {b.label}
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false} style={{ width: 84, textAlign: 'right' }}>
                        <EuiText size="xs" color="subdued">
                          {`${formatPercent(b.weight)} \u00d7 ${formatNumber(b.value)}`}
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false} style={{ width: 64, textAlign: 'right' }}>
                        <EuiText size="xs">{`= ${formatNumber(b.weight * b.value)}`}</EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            </>
          ) : null}
        </EuiFlexItem>
      </EuiFlexGroup>

      {axisFnRows.length > 0 ? (
        <>
          <EuiHorizontalRule margin="s" />
          <EuiTitle size="xxs">
            <h4>{'Per-axis variant coverage'}</h4>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            {
              'Fraction of adversary variants along each axis that the emitted rule is predicted to catch. Higher is better; the tick shows the chosen pick.'
            }
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
            {axisFnRows.map(({ axis, value, ref, delta }) => (
              <EuiFlexItem key={axis} grow={false}>
                <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap={false}>
                  <EuiFlexItem grow={false} style={{ width: 150 }}>
                    <EuiText size="xs">{VARIANT_AXIS_LABEL[axis]}</EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <MetricBar value={value} reference={ref} direction="higher" />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false} style={{ width: 52, textAlign: 'right' }}>
                    <EuiText size="xs">{formatPercent(value)}</EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false} style={{ width: 72, textAlign: 'right' }}>
                    {delta !== undefined ? (
                      <EuiText size="xs" color={deltaColor(delta, 'higher')}>
                        {`\u0394 ${signedDelta(delta)}`}
                      </EuiText>
                    ) : (
                      <EuiText size="xs" color="subdued">
                        {row.tier === 'chosen' ? 'baseline' : '—'}
                      </EuiText>
                    )}
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </>
      ) : null}

      <EuiHorizontalRule margin="s" />
      {tierExplanation}
    </EuiPanel>
  );
};

export const ProposalsTable: React.FC<ProposalsTableProps> = ({
  proposals,
  weights,
  compact = false,
}) => {
  const [expandedMap, setExpandedMap] = useState<Record<string, React.ReactNode>>({});

  const chosenProposal = useMemo(() => proposals.find((p) => p.tier === 'chosen'), [proposals]);

  const chosenScore = useMemo(() => {
    if (!weights || !chosenProposal) return undefined;
    return weightedScore(chosenProposal.predicted, weights);
  }, [chosenProposal, weights]);

  /**
   * Map of `candidate_id` -> `{ rank, total }` by weighted score. `chosen`
   * is always rank 1. Dominated rows still get ranked so the detail card can
   * show them as "5/8" alongside the frontier picks.
   */
  const scoreRankByCandidate = useMemo(() => {
    if (!weights) return new Map<string, { rank: number; total: number }>();
    const scored = proposals.map((p) => ({
      id: p.candidate_id,
      score: weightedScore(p.predicted, weights),
    }));
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    const total = sorted.length;
    const map = new Map<string, { rank: number; total: number }>();
    sorted.forEach((entry, idx) => {
      map.set(entry.id, { rank: idx + 1, total });
    });
    return map;
  }, [proposals, weights]);

  const toggleExpanded = (row: ArgusSynthesisProposal) => {
    setExpandedMap((prev) => {
      const next = { ...prev };
      if (next[row.candidate_id]) {
        delete next[row.candidate_id];
      } else {
        const rankInfo = scoreRankByCandidate.get(row.candidate_id);
        next[row.candidate_id] = (
          <DetailCard
            row={row}
            chosen={chosenProposal}
            weights={weights}
            chosenScore={chosenScore}
            rank={rankInfo?.rank}
            totalRanked={rankInfo?.total}
          />
        );
      }
      return next;
    });
  };

  const columns: Array<EuiBasicTableColumn<ArgusSynthesisProposal>> = [
    ...(compact
      ? []
      : [
          {
            align: 'left' as const,
            width: '40px',
            isExpander: true,
            name: '',
            render: (row: ArgusSynthesisProposal) => {
              const isExpanded = Boolean(expandedMap[row.candidate_id]);
              return (
                <EuiButtonIcon
                  onClick={() => toggleExpanded(row)}
                  aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                  iconType={isExpanded ? 'arrowDown' : 'arrowRight'}
                  data-test-subj={`argus-proposal-expand-${row.candidate_id}`}
                />
              );
            },
          },
        ]),
    {
      field: 'tier',
      name: 'Tier',
      width: '110px',
      render: (_v, row) => tierBadge(row.tier),
    },
    {
      field: 'candidate_id',
      name: 'Candidate',
      width: '120px',
      render: (_v, row) => <EuiCode transparentBackground>{row.candidate_id}</EuiCode>,
    },
    ...(compact
      ? []
      : [
          {
            field: 'composition',
            name: 'Composition',
            render: (_v: unknown, row: ArgusSynthesisProposal) => (
              <EuiText size="xs">{compositionSummary(row.composition)}</EuiText>
            ),
          } as EuiBasicTableColumn<ArgusSynthesisProposal>,
        ]),
    {
      field: 'predicted.precision',
      name: 'Precision',
      width: '95px',
      align: 'right',
      render: (_v, row) => (
        <EuiToolTip content="Narrower query → higher precision (0..1)">
          <EuiText size="xs">{formatNumber(row.predicted.precision)}</EuiText>
        </EuiToolTip>
      ),
    },
    {
      field: 'predicted.recall',
      name: 'Recall',
      width: '90px',
      align: 'right',
      render: (_v, row) => (
        <EuiToolTip content="Fraction of advisory signals recognised (0..1)">
          <EuiText size="xs">{formatNumber(row.predicted.recall)}</EuiText>
        </EuiToolTip>
      ),
    },
    {
      field: 'predicted.fp_rate',
      name: 'FP rate',
      width: '90px',
      align: 'right',
      render: (_v, row) => (
        <EuiToolTip content="Predicted false-positive rate on benign traffic (0..1, lower is better)">
          <EuiText size="xs">{formatNumber(row.predicted.fp_rate)}</EuiText>
        </EuiToolTip>
      ),
    },
    ...(compact
      ? []
      : [
          {
            field: 'predicted.axis_fn_mean',
            name: 'Axis cov.',
            width: '95px',
            align: 'right',
            render: (_v: unknown, row: ArgusSynthesisProposal) => (
              <EuiToolTip content="Axis coverage — higher means more variant axes are still exercised">
                <EuiText size="xs">{formatNumber(row.predicted.axis_fn_mean)}</EuiText>
              </EuiToolTip>
            ),
          } as EuiBasicTableColumn<ArgusSynthesisProposal>,
        ]),
    {
      field: 'dominated_by',
      name: 'Why not picked',
      render: (_v, row) => {
        if (row.tier === 'chosen') {
          return (
            <EuiText size="xs" color="success">
              {'Promoted to detection-eval gate'}
            </EuiText>
          );
        }
        if (row.tier === 'frontier') {
          return (
            <EuiText size="xs" color="subdued">
              {'On Pareto frontier, not picked by weights'}
            </EuiText>
          );
        }
        if (!row.dominated_by) {
          return (
            <EuiText size="xs" color="subdued">
              {'Dominated'}
            </EuiText>
          );
        }
        return (
          <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText size="xs">
                {'Dominated by '}
                <EuiCode transparentBackground>{row.dominated_by.candidate_id}</EuiCode>
              </EuiText>
            </EuiFlexItem>
            {row.dominated_by.reasons.length > 0 ? (
              <EuiFlexItem grow={false}>
                {renderDominationReasons(row.dominated_by.reasons)}
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        );
      },
    },
  ];

  return (
    <>
      {!compact ? (
        <>
          <TierLegend />
          <EuiSpacer size="s" />
        </>
      ) : null}
      <EuiBasicTable<ArgusSynthesisProposal>
        compressed={compact}
        tableCaption="Synthesis proposals"
        items={[...proposals]}
        columns={columns}
        itemId="candidate_id"
        itemIdToExpandedRowMap={compact ? undefined : expandedMap}
        rowProps={(row) => ({
          'data-test-subj': `argus-proposal-row-${row.tier}-${row.candidate_id}`,
        })}
      />
    </>
  );
};
