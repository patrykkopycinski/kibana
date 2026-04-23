/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  type EuiBasicTableColumn,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiCallOut,
  EuiCode,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type {
  ArgusSynthesisRecentRow,
  ArgusSynthesisResponse,
  ArgusSynthesisWindow,
} from '@kbn/argus-console-common';

import { useRecentProposals, useSynthesisProposals, type ArgusHttp } from '../../hooks';
import { ProposalsTable } from './proposals_table';

export interface ProposalsPanelProps {
  readonly http?: ArgusHttp;
  readonly initialWindow?: ArgusSynthesisWindow;
  /**
   * If set, the panel opens with the per-CVE detail already expanded.
   * Supports deep-linking via `?tab=proposals&cve=...`.
   */
  readonly initialCve?: string;
  /**
   * Invoked when the user clicks the "Open in flow" affordance next to a
   * row. Consumers wire this to the existing E2D deep-link helper so the
   * two surfaces stay navigable.
   */
  readonly onOpenInFlow?: (cveId: string) => void;
}

const WINDOW_OPTIONS: ReadonlyArray<{ id: ArgusSynthesisWindow; label: string }> = [
  { id: '24h', label: 'Last 24h' },
  { id: '7d', label: 'Last 7d' },
];

const formatNumber = (n: number): string => n.toFixed(2);

/**
 * Inline detail view rendered when the user drills into a single CVE. Runs
 * its own fetch so the list view does not need to pre-hydrate every
 * recommendation's full candidate set.
 */
const ProposalsDetail: React.FC<{
  http: ArgusHttp;
  cveId: string;
  onClose: () => void;
  onOpenInFlow?: (cveId: string) => void;
}> = ({ http, cveId, onClose, onOpenInFlow }) => {
  const state = useSynthesisProposals({ http, cveId, refreshIntervalMs: 15_000 });

  const renderBody = (data: ArgusSynthesisResponse) => {
    if (data.missing_reason === 'advisory_not_found') {
      return (
        <EuiEmptyPrompt
          iconType="alert"
          title={<h3>{`Advisory not found for ${cveId}`}</h3>}
          body={
            <EuiText size="s">
              {'Check the CVE id — the advisory may not have been ingested yet.'}
            </EuiText>
          }
        />
      );
    }
    if (data.missing_reason === 'recommendation_not_found') {
      return (
        <EuiEmptyPrompt
          iconType="visLine"
          title={<h3>{'Synthesis not yet run'}</h3>}
          body={
            <EuiText size="s">
              {'This advisory has no recommendation yet — the E2D pipeline has not picked it up.'}
            </EuiText>
          }
        />
      );
    }
    if (data.missing_reason === 'no_synthesis_metadata') {
      return (
        <EuiEmptyPrompt
          iconType="iInCircle"
          title={<h3>{'No candidate set recorded'}</h3>}
          body={
            <EuiText size="s">
              {
                'The recommendation was produced before the Pareto-synthesis step was enabled, so there are no alternative candidates to review.'
              }
            </EuiText>
          }
        />
      );
    }

    return (
      <>
        <EuiFlexGroup gutterSize="s" alignItems="center" wrap responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {'Recommendation:'}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiCode transparentBackground>{data.recommendation_id ?? '—'}</EuiCode>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {'Draft rule:'}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiCode transparentBackground>{data.draft_rule_id ?? '—'}</EuiCode>
          </EuiFlexItem>
          {data.weights ? (
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {`Weights: precision=${formatNumber(data.weights.precision)} recall=${formatNumber(
                  data.weights.recall
                )} fp=${formatNumber(data.weights.fp_rate)} axis=${formatNumber(
                  data.weights.axis_fn
                )}`}
              </EuiText>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <ProposalsTable proposals={data.proposals} weights={data.weights} />
      </>
    );
  };

  return (
    <EuiPanel paddingSize="m" hasBorder data-test-subj="argus-proposals-detail">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{`Proposals for ${cveId}`}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" responsive={false}>
            {onOpenInFlow ? (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  size="xs"
                  iconType="apmTrace"
                  onClick={() => onOpenInFlow(cveId)}
                  data-test-subj="argus-proposals-open-flow"
                >
                  {'Open E2D flow'}
                </EuiButtonEmpty>
              </EuiFlexItem>
            ) : null}
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size="xs" iconType="cross" onClick={onClose}>
                {'Close'}
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      {state.status === 'loading' ? (
        <EuiText size="s" color="subdued">
          {'Loading proposals…'}
        </EuiText>
      ) : state.status === 'error' ? (
        <EuiCallOut color="warning" title="Failed to load proposals" iconType="alert" size="s">
          {state.error.message}
        </EuiCallOut>
      ) : state.status === 'success' ? (
        renderBody(state.data)
      ) : null}
    </EuiPanel>
  );
};

export const ProposalsPanel: React.FC<ProposalsPanelProps> = ({
  http,
  initialWindow = '24h',
  initialCve,
  onOpenInFlow,
}) => {
  const [windowKey, setWindowKey] = useState<ArgusSynthesisWindow>(initialWindow);
  const [selectedCve, setSelectedCve] = useState<string | undefined>(initialCve);

  const listState = useRecentProposals({
    http: http as ArgusHttp,
    window: windowKey,
    enabled: Boolean(http),
    refreshIntervalMs: 30_000,
  });

  const columns: Array<EuiBasicTableColumn<ArgusSynthesisRecentRow>> = useMemo(
    () => [
      {
        field: 'cve_id',
        name: 'CVE',
        width: '170px',
        render: (_v, row) => <EuiCode transparentBackground>{row.cve_id}</EuiCode>,
      },
      {
        field: 'chosen_candidate_id',
        name: 'Chosen',
        width: '100px',
        render: (_v, row) => <EuiBadge color="success">{row.chosen_candidate_id}</EuiBadge>,
      },
      {
        field: 'frontier_size',
        name: 'Frontier',
        width: '90px',
        align: 'right',
        render: (_v, row) => <EuiText size="xs">{row.frontier_size}</EuiText>,
      },
      {
        field: 'dominated_count',
        name: 'Dominated',
        width: '110px',
        align: 'right',
        render: (_v, row) => <EuiText size="xs">{row.dominated_count}</EuiText>,
      },
      {
        field: 'predicted.precision',
        name: 'Precision',
        width: '90px',
        align: 'right',
        render: (_v, row) => <EuiText size="xs">{formatNumber(row.predicted.precision)}</EuiText>,
      },
      {
        field: 'predicted.recall',
        name: 'Recall',
        width: '85px',
        align: 'right',
        render: (_v, row) => <EuiText size="xs">{formatNumber(row.predicted.recall)}</EuiText>,
      },
      {
        field: 'predicted.fp_rate',
        name: 'FP rate',
        width: '85px',
        align: 'right',
        render: (_v, row) => <EuiText size="xs">{formatNumber(row.predicted.fp_rate)}</EuiText>,
      },
      {
        name: 'Actions',
        width: '120px',
        render: (row: ArgusSynthesisRecentRow) => (
          <EuiButtonEmpty
            size="xs"
            iconType="inspect"
            onClick={() => setSelectedCve(row.cve_id)}
            data-test-subj={`argus-proposals-inspect-${row.cve_id}`}
          >
            {'Inspect'}
          </EuiButtonEmpty>
        ),
      },
    ],
    []
  );

  const renderList = () => {
    if (!http) {
      return (
        <EuiEmptyPrompt
          iconType="inspect"
          title={<h3>{'Proposals unavailable'}</h3>}
          body={
            <EuiText size="s">
              {'The HTTP client is not wired — the console is running in offline mode.'}
            </EuiText>
          }
        />
      );
    }
    if (listState.status === 'loading') {
      return (
        <EuiText size="s" color="subdued">
          {'Loading recent synthesis decisions…'}
        </EuiText>
      );
    }
    if (listState.status === 'error') {
      return (
        <EuiCallOut color="warning" title="Failed to load proposals" iconType="alert" size="s">
          {listState.error.message}
        </EuiCallOut>
      );
    }
    if (listState.status === 'success') {
      const rows = [...listState.data.rows];
      if (rows.length === 0) {
        return (
          <EuiEmptyPrompt
            iconType="inspect"
            title={<h3>{'No synthesis runs in this window'}</h3>}
            body={
              <EuiText size="s">
                {
                  'No recommendations with Pareto-synthesis metadata were filed in the selected window. Either the E2D pipeline has not run, or the recommendations pre-date the R3 synthesis step.'
                }
              </EuiText>
            }
          />
        );
      }
      return (
        <EuiBasicTable<ArgusSynthesisRecentRow>
          tableCaption="Recent synthesis proposals"
          items={rows}
          columns={columns}
          rowProps={(row) => ({
            'data-test-subj': `argus-proposals-list-row-${row.cve_id}`,
          })}
        />
      );
    }
    return null;
  };

  return (
    <EuiFlexGroup direction="column" gutterSize="m" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiPanel paddingSize="m" hasBorder data-test-subj="argus-proposals-panel">
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs">
                <h2>{'Rule proposals — candidate sets and dominance reasons'}</h2>
              </EuiTitle>
              <EuiText size="xs" color="subdued">
                {
                  'Every synthesized rule picks one composition from a grid of up to eight. This tab shows the picked pick alongside the alternatives it beat, with a "why not picked" reason for each.'
                }
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonGroup
                legend="Window"
                idSelected={windowKey}
                options={WINDOW_OPTIONS.map((w) => ({ id: w.id, label: w.label }))}
                onChange={(id) => setWindowKey(id as ArgusSynthesisWindow)}
                buttonSize="compressed"
                data-test-subj="argus-proposals-window-toggle"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          {renderList()}
        </EuiPanel>
      </EuiFlexItem>
      {selectedCve && http ? (
        <EuiFlexItem grow={false}>
          <ProposalsDetail
            http={http}
            cveId={selectedCve}
            onClose={() => setSelectedCve(undefined)}
            onOpenInFlow={onOpenInFlow}
          />
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  );
};
