/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBasicTable,
  type EuiBasicTableColumn,
  EuiButtonIcon,
  EuiCode,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';

import type { ArgusSynthesisProposal, ArgusSynthesisWeights } from '@kbn/argus-console-common';

import { ProposalDetailCard, TierLegend } from './proposal_row_expansion';
import {
  compositionSummary,
  formatNumber,
  renderDominationReasons,
  tierBadge,
  weightedScore,
} from './proposal_scoring';

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
          <ProposalDetailCard
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
