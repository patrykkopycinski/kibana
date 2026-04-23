/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiAccordion,
  EuiBadge,
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

import type { ArgusSynthesisProposal, ArgusSynthesisWeights } from '@kbn/argus-console-common';

import {
  compositionDiff,
  compositionExplainer,
  deltaColor,
  formatNumber,
  formatPercent,
  MetricBar,
  PREDICTED_DIRECTION,
  PREDICTED_LABEL,
  type PredictedAxisKey,
  queryShapeHint,
  renderDominationReasons,
  signedDelta,
  tierBadge,
  VARIANT_AXIS_LABEL,
  VARIANT_AXIS_ORDER,
  weightedScore,
} from './proposal_scoring';

export const TierLegend: React.FC = () => (
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
              'The single candidate ARGUS promoted to the detection-eval gate. Picked from the Pareto frontier by the tenant-configured weights (shown above). This is what becomes the draft rule.',
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

export interface ProposalDetailCardProps {
  readonly row: ArgusSynthesisProposal;
  readonly chosen?: ArgusSynthesisProposal;
  readonly weights?: ArgusSynthesisWeights;
  readonly chosenScore?: number;
  readonly rank?: number;
  readonly totalRanked?: number;
}

export const ProposalDetailCard: React.FC<ProposalDetailCardProps> = ({
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
