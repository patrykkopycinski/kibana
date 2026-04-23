/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiCodeBlock,
  EuiDescriptionList,
  type EuiDescriptionListProps,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiSpacer,
  EuiStat,
  EuiText,
} from '@elastic/eui';

import type {
  ArgusEventSample,
  ArgusEventSampleClassification,
  ArgusMutationPostApplyObservation,
} from '@kbn/argus-console-common';

/**
 * Render an ISO-8601 timestamp in the user's locale; falls back to the
 * raw string when parsing fails so we never silently hide information
 * the server returned.
 */
const formatTimestamp = (iso: string | null): string => {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleString();
};

const classificationBadge = (
  classification: ArgusEventSampleClassification
): React.ReactElement => {
  switch (classification) {
    case 'fp':
      return <EuiBadge color="danger">{'FP'}</EuiBadge>;
    case 'tp':
      return <EuiBadge color="success">{'TP'}</EuiBadge>;
    case 'unclassified':
      return <EuiBadge color="hollow">{'Unclassified'}</EuiBadge>;
  }
};

interface SampleEventsTableProps {
  readonly samples: readonly ArgusEventSample[];
  readonly dataTestSubj: string;
  /**
   * When true, hides the classification column — useful for FP-only or
   * TP-only sub-tables where the badge would be redundant.
   */
  readonly hideClassification?: boolean;
}

/**
 * Reusable compact table that shows the smallest set of columns needed
 * to understand *why* the detection fired on this event: timestamp,
 * host/user context, the command, and (optionally) the classification.
 * Designed to live inside a flyout section so it stays read-only and
 * does not try to be a full-blown alerts grid.
 */
export const SampleEventsTable: React.FC<SampleEventsTableProps> = ({
  samples,
  dataTestSubj,
  hideClassification,
}) => {
  if (samples.length === 0) {
    return (
      <EuiText size="s" color="subdued" data-test-subj={`${dataTestSubj}Empty`}>
        {'No sample events recorded.'}
      </EuiText>
    );
  }

  const columns = [
    {
      field: 'timestamp',
      name: 'Timestamp',
      render: (iso: string | null) => <EuiText size="s">{formatTimestamp(iso ?? null)}</EuiText>,
      width: '180px',
    },
    {
      field: 'host_name',
      name: 'Host',
      render: (value: string | null) => <EuiText size="s">{value ?? '—'}</EuiText>,
      width: '160px',
    },
    {
      field: 'user_name',
      name: 'User',
      render: (value: string | null) => <EuiText size="s">{value ?? '—'}</EuiText>,
      width: '140px',
    },
    {
      field: 'command_line',
      name: 'Command',
      render: (value: string | null) =>
        value ? (
          <EuiCodeBlock paddingSize="none" fontSize="s" transparentBackground isCopyable={false}>
            {value}
          </EuiCodeBlock>
        ) : (
          <EuiText size="s">{'—'}</EuiText>
        ),
    },
    ...(hideClassification
      ? []
      : [
          {
            field: 'classification',
            name: 'Classification',
            render: (value: ArgusEventSampleClassification) => classificationBadge(value),
            width: '120px',
          },
        ]),
    {
      field: 'reason',
      name: 'Reason',
      render: (value: string | null) =>
        value ? (
          <EuiText size="s" color="subdued">
            {value}
          </EuiText>
        ) : (
          <EuiText size="s" color="subdued">
            {'—'}
          </EuiText>
        ),
    },
  ];

  return (
    <EuiBasicTable
      tableCaption="Sample events"
      items={samples.map((sample) => ({ ...sample }))}
      columns={columns}
      compressed
      data-test-subj={dataTestSubj}
    />
  );
};

interface BacktestEvidenceBlockProps {
  readonly query: string | null;
  readonly windowStart: string | null;
  readonly windowEnd: string | null;
  readonly fpSamples: readonly ArgusEventSample[];
  readonly tpSamples: readonly ArgusEventSample[];
  readonly dataTestSubj?: string;
}

/**
 * Evidence block rendered below the aggregate backtest stats. Split into
 * three parts so reviewers can answer the three questions they ask in
 * rapid succession:
 *
 *   1. What query actually ran?
 *   2. What window did the backtester use?
 *   3. Which concrete events were judged TP vs FP?
 *
 * When none of those three are populated (legacy backtest doc), the
 * component renders nothing so the flyout stays compact.
 */
export const BacktestEvidenceBlock: React.FC<BacktestEvidenceBlockProps> = ({
  query,
  windowStart,
  windowEnd,
  fpSamples,
  tpSamples,
  dataTestSubj = 'argusBacktestEvidence',
}) => {
  const hasSamples = fpSamples.length > 0 || tpSamples.length > 0;
  const hasWindow = Boolean(windowStart || windowEnd);
  if (!query && !hasWindow && !hasSamples) return null;

  return (
    <div data-test-subj={dataTestSubj}>
      {query ? (
        <>
          <EuiText size="xs" color="subdued">
            <strong>{'Query that ran'}</strong>
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiCodeBlock
            language="kuery"
            paddingSize="s"
            fontSize="s"
            isCopyable
            data-test-subj={`${dataTestSubj}Query`}
          >
            {query}
          </EuiCodeBlock>
          <EuiSpacer size="s" />
        </>
      ) : null}

      {hasWindow ? (
        <>
          <EuiDescriptionList
            type="responsiveColumn"
            compressed
            listItems={[
              { title: 'Window start', description: formatTimestamp(windowStart) },
              { title: 'Window end', description: formatTimestamp(windowEnd) },
            ]}
          />
          <EuiSpacer size="s" />
        </>
      ) : null}

      {tpSamples.length > 0 ? (
        <>
          <EuiText size="xs" color="subdued">
            <strong>{'True-positive samples'}</strong>
          </EuiText>
          <EuiSpacer size="xs" />
          <SampleEventsTable
            samples={tpSamples}
            dataTestSubj={`${dataTestSubj}TpSamples`}
            hideClassification
          />
          <EuiSpacer size="s" />
        </>
      ) : null}

      {fpSamples.length > 0 ? (
        <>
          <EuiText size="xs" color="subdued">
            <strong>{'False-positive samples'}</strong>
          </EuiText>
          <EuiSpacer size="xs" />
          <SampleEventsTable
            samples={fpSamples}
            dataTestSubj={`${dataTestSubj}FpSamples`}
            hideClassification
          />
        </>
      ) : null}
    </div>
  );
};

interface PostApplyObservationBlockProps {
  readonly observation: ArgusMutationPostApplyObservation;
  readonly dataTestSubj?: string;
}

/**
 * Shows the alerts the rule fired inside its canary/applied window.
 * Renders aggregate counters (total / FP / TP), a sample-events table,
 * and a deep-link to the Alerts app pre-filtered by the same criteria.
 */
export const PostApplyObservationBlock: React.FC<PostApplyObservationBlockProps> = ({
  observation,
  dataTestSubj = 'argusPostApplyObservation',
}) => {
  const windowItems: EuiDescriptionListProps['listItems'] = [
    { title: 'Window start', description: formatTimestamp(observation.window_start) },
    { title: 'Window end', description: formatTimestamp(observation.window_end) },
  ];

  return (
    <div data-test-subj={dataTestSubj}>
      <EuiFlexGroup gutterSize="m" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={observation.alerts_total.toLocaleString()}
            description="Alerts in window"
            titleSize="s"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={observation.alerts_classified_fp.toLocaleString()}
            description="Classified FP"
            titleSize="s"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={observation.alerts_classified_tp.toLocaleString()}
            description="Classified TP"
            titleSize="s"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiDescriptionList type="responsiveColumn" compressed listItems={windowItems} />
      <EuiSpacer size="s" />
      {observation.sample_events.length > 0 ? (
        <>
          <EuiText size="xs" color="subdued">
            <strong>{'Sample alerts'}</strong>
          </EuiText>
          <EuiSpacer size="xs" />
          <SampleEventsTable
            samples={observation.sample_events}
            dataTestSubj={`${dataTestSubj}Samples`}
          />
          <EuiSpacer size="s" />
        </>
      ) : (
        <EuiText size="s" color="subdued">
          {'No alerts fired inside the observation window.'}
        </EuiText>
      )}
      {observation.alerts_deep_link_url ? (
        <EuiText size="s">
          <EuiLink
            href={observation.alerts_deep_link_url}
            target="_blank"
            data-test-subj={`${dataTestSubj}DeepLink`}
          >
            {'Open in Alerts'}
          </EuiLink>
        </EuiText>
      ) : null}
    </div>
  );
};
