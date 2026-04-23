/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiCallOut,
  EuiCodeBlock,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiSkeletonText,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type {
  ArgusArtifactDetails,
  ArgusArtifactRelated,
  ArgusArtifactRelatedKind,
} from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from '../../hooks';
import { useArtifactDetails } from '../../hooks';
import { BacktestEvidenceBlock, PostApplyObservationBlock } from '../evidence_blocks';

type FlyoutTabId = 'summary' | 'related' | 'raw';

export type ArgusArtifactPivotTarget =
  | { readonly kind: 'reasoning'; readonly subject: { kind: 'run' | 'alert'; id: string } }
  | {
      readonly kind: 'lineage';
      readonly subject: { kind: 'alert' | 'rule' | 'mutation' | 'cve'; id: string };
    }
  | {
      readonly kind: 'decision_graph';
      readonly subject: {
        kind:
          | 'advisory'
          | 'intent'
          | 'outcome'
          | 'rule'
          | 'actor'
          | 'technique'
          | 'reasoning'
          | 'audit'
          | 'observation';
        id: string;
      };
    }
  | { readonly kind: 'discover'; readonly sourceIndex: string; readonly sourceDocId: string };

export interface ArgusArtifactDetailsFlyoutProps {
  readonly http: ArgusHttp;
  readonly title: string;
  readonly subtitle?: React.ReactNode;
  readonly sourceIndex: string;
  readonly sourceDocId: string;
  /**
   * Subset of related lookups to request. Omit for all.
   */
  readonly includeRelated?: readonly ArgusArtifactRelatedKind[];
  readonly onClose: () => void;
  /**
   * Panel-specific Summary tab body. Renders above the always-on
   * `source_index` / `source_doc_id` row. `details` is `undefined` while
   * the fetch is in flight.
   */
  readonly renderSummary?: (details: ArgusArtifactDetails | undefined) => React.ReactNode;
  /**
   * Invoked when the user clicks a pivot button. Implementing it is
   * optional — buttons that don't have a handler are hidden.
   */
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
  readonly dataTestSubj?: string;
}

const TAB_DEFINITIONS: ReadonlyArray<{ readonly id: FlyoutTabId; readonly label: string }> = [
  { id: 'summary', label: 'Summary' },
  { id: 'related', label: 'Related' },
  { id: 'raw', label: 'Raw JSON' },
];

/**
 * Reusable details flyout used by the Activity feed and Mutation lineage
 * panels. Owns the fetch via `useArtifactDetails` so callers only have to
 * pass `(source_index, source_doc_id)` — everything else is optional.
 */
export const ArgusArtifactDetailsFlyout: React.FC<ArgusArtifactDetailsFlyoutProps> = ({
  http,
  title,
  subtitle,
  sourceIndex,
  sourceDocId,
  includeRelated,
  onClose,
  renderSummary,
  onPivot,
  dataTestSubj = 'argusConsoleArtifactDetailsFlyout',
}) => {
  const state = useArtifactDetails({ http, sourceIndex, sourceDocId, includeRelated });
  const [activeTab, setActiveTab] = useState<FlyoutTabId>('summary');
  const details = state.status === 'success' ? state.data : undefined;

  return (
    <EuiFlyout onClose={onClose} size="m" data-test-subj={dataTestSubj}>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2>{title}</h2>
        </EuiTitle>
        {subtitle ? (
          <>
            <EuiSpacer size="xs" />
            <EuiText size="s" color="subdued">
              {subtitle}
            </EuiText>
          </>
        ) : null}
        <EuiSpacer size="s" />
        <EuiTabs size="s">
          {TAB_DEFINITIONS.map((tab) => (
            <EuiTab
              key={tab.id}
              isSelected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-test-subj={`${dataTestSubj}Tab-${tab.id}`}
            >
              {tab.label}
            </EuiTab>
          ))}
        </EuiTabs>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <FlyoutBody
          state={state}
          activeTab={activeTab}
          details={details}
          sourceIndex={sourceIndex}
          sourceDocId={sourceDocId}
          renderSummary={renderSummary}
          onPivot={onPivot}
          onClose={onClose}
          dataTestSubj={dataTestSubj}
        />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};

interface FlyoutBodyProps {
  readonly state: FetchState<ArgusArtifactDetails>;
  readonly activeTab: FlyoutTabId;
  readonly details: ArgusArtifactDetails | undefined;
  readonly sourceIndex: string;
  readonly sourceDocId: string;
  readonly renderSummary?: (details: ArgusArtifactDetails | undefined) => React.ReactNode;
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
  readonly onClose: () => void;
  readonly dataTestSubj: string;
}

const FlyoutBody: React.FC<FlyoutBodyProps> = ({
  state,
  activeTab,
  details,
  sourceIndex,
  sourceDocId,
  renderSummary,
  onPivot,
  onClose,
  dataTestSubj,
}) => {
  if (state.status === 'error') {
    return (
      <EuiCallOut
        color="danger"
        title="Unable to load artifact details"
        data-test-subj={`${dataTestSubj}Error`}
      >
        {state.error.message}
      </EuiCallOut>
    );
  }

  if (state.status === 'success' && state.data.reason_code === 'not_found') {
    return (
      <EuiCallOut color="warning" title="Source document not found">
        <EuiText size="s">
          {`The document at `}
          <code>{`${sourceIndex}:${sourceDocId}`}</code>
          {` is no longer available.`}
        </EuiText>
      </EuiCallOut>
    );
  }

  if (state.status !== 'success') {
    return <EuiSkeletonText lines={6} />;
  }

  if (activeTab === 'summary') {
    return (
      <SummaryTab
        details={details}
        sourceIndex={sourceIndex}
        sourceDocId={sourceDocId}
        renderSummary={renderSummary}
      />
    );
  }

  if (activeTab === 'related') {
    return (
      <RelatedTab
        details={details}
        sourceIndex={sourceIndex}
        sourceDocId={sourceDocId}
        onPivot={onPivot}
        onClose={onClose}
      />
    );
  }

  return (
    <EuiCodeBlock
      language="json"
      isCopyable
      paddingSize="s"
      overflowHeight={520}
      data-test-subj={`${dataTestSubj}RawJson`}
    >
      {JSON.stringify(details?.raw_document ?? {}, null, 2)}
    </EuiCodeBlock>
  );
};

const SummaryTab: React.FC<{
  readonly details: ArgusArtifactDetails | undefined;
  readonly sourceIndex: string;
  readonly sourceDocId: string;
  readonly renderSummary?: (details: ArgusArtifactDetails | undefined) => React.ReactNode;
}> = ({ details, sourceIndex, sourceDocId, renderSummary }) => {
  const related = details?.related;
  const backtest = related?.backtest ?? null;
  const observation = related?.post_apply_observation ?? null;
  const backtestHasEvidence =
    backtest !== null &&
    (Boolean(backtest.query) ||
      Boolean(backtest.window_start) ||
      Boolean(backtest.window_end) ||
      backtest.fp_samples.length > 0 ||
      backtest.tp_samples.length > 0);

  return (
    <>
      {renderSummary ? renderSummary(details) : null}
      {renderSummary ? <EuiSpacer size="m" /> : null}
      {backtestHasEvidence && backtest ? (
        <>
          <EuiTitle size="xxs">
            <h4>{'Backtest evidence'}</h4>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <BacktestEvidenceBlock
            query={backtest.query}
            windowStart={backtest.window_start}
            windowEnd={backtest.window_end}
            fpSamples={backtest.fp_samples}
            tpSamples={backtest.tp_samples}
            dataTestSubj="argusArtifactDetailsBacktestEvidence"
          />
          <EuiSpacer size="m" />
        </>
      ) : null}
      {observation ? (
        <>
          <EuiTitle size="xxs">
            <h4>{'Post-apply observation'}</h4>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <PostApplyObservationBlock
            observation={observation}
            dataTestSubj="argusArtifactDetailsPostApplyObservation"
          />
          <EuiSpacer size="m" />
        </>
      ) : null}
      <EuiDescriptionList
        compressed
        listItems={[
          { title: 'Source index', description: <code>{sourceIndex}</code> },
          { title: 'Source doc id', description: <code>{sourceDocId}</code> },
        ]}
      />
    </>
  );
};

const RelatedTab: React.FC<{
  readonly details: ArgusArtifactDetails | undefined;
  readonly sourceIndex: string;
  readonly sourceDocId: string;
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
  readonly onClose: () => void;
}> = ({ details, sourceIndex, sourceDocId, onPivot, onClose }) => {
  const pivots = useMemo(
    () => buildPivotTargets({ details, sourceIndex, sourceDocId }),
    [details, sourceIndex, sourceDocId]
  );
  const related = details?.related;
  const hasRelated = Boolean(related && Object.keys(related).length > 0);

  return (
    <>
      {related && hasRelated ? (
        <RelatedEntitiesList related={related} />
      ) : (
        <EuiText size="s" color="subdued">
          {'No related entities were resolved for this artifact.'}
        </EuiText>
      )}
      <EuiSpacer size="m" />
      <EuiTitle size="xxs">
        <h4>{'Pivot'}</h4>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="s" wrap responsive={false}>
        {pivots.map((pivot) => {
          // Every pivot destination lives outside the flyout (different tab,
          // different subject, or Discover). Without dismissing the flyout
          // the new surface is hidden behind the open panel and the click
          // feels broken. So the one handler below always closes first and
          // then invokes the host pivot callback.
          if (!onPivot) return null;
          return (
            <EuiFlexItem grow={false} key={`${pivot.target.kind}-${pivot.label}`}>
              <EuiButton
                size="s"
                iconType={pivot.iconType}
                onClick={() => {
                  onClose();
                  onPivot(pivot.target);
                }}
                data-test-subj={`argusConsoleArtifactDetailsPivot-${pivot.target.kind}`}
              >
                {pivot.label}
              </EuiButton>
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
    </>
  );
};

const RelatedEntitiesList: React.FC<{ readonly related: ArgusArtifactRelated }> = ({ related }) => {
  const items: Array<{
    title: NonNullable<React.ReactNode>;
    description: NonNullable<React.ReactNode>;
  }> = [];
  if (related.rule) {
    items.push({
      title: 'Rule',
      description: (
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{related.rule.id}</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="s">{related.rule.name}</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    });
  }
  if (related.mutation_intent) {
    items.push({
      title: 'Mutation intent',
      description: (
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{related.mutation_intent.id}</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="s">{related.mutation_intent.summary}</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    });
  }
  if (related.reasoning_trace) {
    items.push({
      title: 'Reasoning trace',
      description: `${related.reasoning_trace.run_id} · ${related.reasoning_trace.steps} step${
        related.reasoning_trace.steps === 1 ? '' : 's'
      }`,
    });
  }
  if (related.outcome) {
    items.push({
      title: 'Outcome',
      description: `${related.outcome.id} · ${related.outcome.status}`,
    });
  }
  if (related.alert) {
    items.push({
      title: 'Alert',
      description: related.alert.rule_name
        ? `${related.alert.id} · ${related.alert.rule_name}`
        : related.alert.id,
    });
  }
  if (related.actor) {
    items.push({
      title: 'Actor',
      description: related.actor.trust_tier
        ? `${related.actor.id} · ${related.actor.trust_tier}`
        : related.actor.id,
    });
  }
  return <EuiDescriptionList compressed listItems={items} />;
};

interface PivotDescriptor {
  readonly label: string;
  readonly iconType: string;
  readonly target: ArgusArtifactPivotTarget;
}

/**
 * Derive a concrete set of pivot buttons from whatever related entities the
 * server resolved. `discover` is always offered because it only needs the
 * source pair that was used for the fetch.
 *
 * Button order mirrors the reasoning → lineage → decision graph → discover
 * workflow operators typically walk during a demo.
 */
const buildPivotTargets = ({
  details,
  sourceIndex,
  sourceDocId,
}: {
  details: ArgusArtifactDetails | undefined;
  sourceIndex: string;
  sourceDocId: string;
}): readonly PivotDescriptor[] => {
  const out: PivotDescriptor[] = [];
  const related = details?.related;

  if (related?.reasoning_trace) {
    out.push({
      label: 'Open reasoning',
      iconType: 'inspect',
      target: { kind: 'reasoning', subject: { kind: 'run', id: related.reasoning_trace.run_id } },
    });
  } else if (related?.alert) {
    out.push({
      label: 'Open reasoning (via alert)',
      iconType: 'inspect',
      target: { kind: 'reasoning', subject: { kind: 'alert', id: related.alert.id } },
    });
  }

  if (related?.mutation_intent) {
    out.push({
      label: 'Open lineage',
      iconType: 'branch',
      target: {
        kind: 'lineage',
        subject: { kind: 'mutation', id: related.mutation_intent.id },
      },
    });
  } else if (related?.rule) {
    out.push({
      label: 'Open lineage (via rule)',
      iconType: 'branch',
      target: { kind: 'lineage', subject: { kind: 'rule', id: related.rule.id } },
    });
  } else if (related?.alert) {
    out.push({
      label: 'Open lineage (via alert)',
      iconType: 'branch',
      target: { kind: 'lineage', subject: { kind: 'alert', id: related.alert.id } },
    });
  }

  if (related?.rule) {
    out.push({
      label: 'Open decision graph',
      iconType: 'graphApp',
      target: { kind: 'decision_graph', subject: { kind: 'rule', id: related.rule.id } },
    });
  } else if (related?.mutation_intent) {
    out.push({
      label: 'Open decision graph',
      iconType: 'graphApp',
      target: {
        kind: 'decision_graph',
        subject: { kind: 'intent', id: related.mutation_intent.id },
      },
    });
  }

  out.push({
    label: 'View in Discover',
    iconType: 'discoverApp',
    target: { kind: 'discover', sourceIndex, sourceDocId },
  });

  return out;
};
