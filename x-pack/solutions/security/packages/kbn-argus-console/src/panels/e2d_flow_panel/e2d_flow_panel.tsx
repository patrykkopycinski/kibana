/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButtonGroup,
  EuiCallOut,
  EuiDescriptionList,
  EuiEmptyPrompt,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiHorizontalRule,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';

import type {
  ArgusArtifactDetails,
  ArgusArtifactRelatedKind,
  ArgusE2dAppliedStage,
  ArgusE2dBacktestedStage,
  ArgusE2dEvaluatedStage,
  ArgusE2dExploitProbabilityStage,
  ArgusE2dFlowResponse,
  ArgusE2dGovernanceStage,
  ArgusE2dIngestedStage,
  ArgusE2dRecentCve,
  ArgusE2dRunningStage,
  ArgusE2dStage,
  ArgusE2dStageKind,
  ArgusE2dStageStatus,
  ArgusE2dSynthesizedStage,
} from '@kbn/argus-console-common';

import { useE2dFlow, useRecentCves, type ArgusHttp, type E2dFlowWindow } from '../../hooks';
import {
  ArgusArtifactDetailsFlyout,
  DocumentNarrativeSummary,
  type ArgusArtifactPivotTarget,
} from '../artifact_details_flyout';
import { SynthesisAlternativesInline } from './synthesis_alternatives_inline';

export interface E2dFlowPanelProps {
  readonly http?: ArgusHttp;
  /**
   * Deep-link target CVE (from the URL `?cve=...` query param). When set, the
   * panel selects this CVE on mount.
   */
  readonly initialCve?: string;
  readonly initialWindow?: E2dFlowWindow;
  /**
   * Called when the user clicks "View in Proposals" on the inline
   * alternatives block. Consumers wire this to route the user to the
   * global Proposals tab pre-focused on the same CVE.
   */
  readonly onOpenProposals?: (cveId: string) => void;
  /**
   * Optional forwarder for the stage-details flyout pivot buttons
   * (Reasoning / Lineage / Decision graph). Mirrors the Autonomy /
   * Mutation lineage / Activity feed plumbing so a single handler in
   * the console wrapper can route to every sub-panel.
   */
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
}

interface WindowOption {
  readonly id: E2dFlowWindow;
  readonly label: string;
}

const WINDOW_OPTIONS: readonly WindowOption[] = [
  { id: '24h', label: 'Last 24h' },
  { id: '7d', label: 'Last 7d' },
];

const STAGE_LABELS: Record<ArgusE2dStageKind, string> = {
  ingested: 'CVE advisory ingested',
  exploit_probability: 'Exploit probability',
  synthesized: 'Rule synthesized',
  evaluated: 'Offline eval',
  backtested: 'Backtest',
  governance: 'Governance gate',
  applied: 'Applied',
  running: 'Running',
};

const STAGE_ICON: Record<ArgusE2dStageKind, string> = {
  ingested: 'bug',
  exploit_probability: 'visBarHorizontal',
  synthesized: 'wrench',
  evaluated: 'beaker',
  backtested: 'timeline',
  governance: 'lock',
  applied: 'checkInCircleFilled',
  running: 'play',
};

const statusBadge = (status: ArgusE2dStageStatus): JSX.Element => {
  switch (status) {
    case 'done':
      return <EuiBadge color="success">{'Done'}</EuiBadge>;
    case 'pending':
      return <EuiBadge color="hollow">{'Pending'}</EuiBadge>;
    case 'skipped':
      return <EuiBadge color="default">{'Skipped'}</EuiBadge>;
    case 'blocked':
      return <EuiBadge color="danger">{'Blocked'}</EuiBadge>;
    case 'failed':
      return <EuiBadge color="warning">{'Failed'}</EuiBadge>;
  }
};

const formatTimestamp = (iso: string | undefined): string => {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleString();
};

const severityColor = (severity: string | null | undefined): 'danger' | 'warning' | 'default' => {
  const s = (severity ?? '').toLowerCase();
  if (s === 'critical' || s === 'high') return 'danger';
  if (s === 'medium') return 'warning';
  return 'default';
};

interface StageDetail {
  readonly label: string;
  readonly value: string;
}

const detailsForStage = (stage: ArgusE2dStage): readonly StageDetail[] => {
  switch (stage.kind) {
    case 'ingested': {
      const s = stage as ArgusE2dIngestedStage;
      return [
        ...(s.cve_id ? [{ label: 'CVE', value: s.cve_id }] : []),
        ...(s.severity ? [{ label: 'Severity', value: s.severity }] : []),
        ...(s.kev ? [{ label: 'KEV', value: 'yes' }] : []),
        ...(s.mitre_techniques.length > 0
          ? [{ label: 'MITRE', value: s.mitre_techniques.join(', ') }]
          : []),
        ...(s.source ? [{ label: 'Source', value: s.source }] : []),
      ];
    }
    case 'exploit_probability': {
      const s = stage as ArgusE2dExploitProbabilityStage;
      return [
        ...(typeof s.score === 'number'
          ? [{ label: 'Score', value: `${Math.round(s.score * 100)}%` }]
          : []),
        ...(s.kev ? [{ label: 'KEV', value: 'yes' }] : []),
      ];
    }
    case 'synthesized': {
      const s = stage as ArgusE2dSynthesizedStage;
      return [
        ...(s.draft_rule_id ? [{ label: 'Draft rule', value: s.draft_rule_id }] : []),
        ...(s.mutation_intent_id
          ? [{ label: 'Mutation intent', value: s.mutation_intent_id }]
          : []),
        ...(s.recommendation_id ? [{ label: 'Recommendation', value: s.recommendation_id }] : []),
      ];
    }
    case 'evaluated': {
      const s = stage as ArgusE2dEvaluatedStage;
      return [
        ...(typeof s.precision === 'number'
          ? [{ label: 'Precision', value: `${(s.precision * 100).toFixed(0)}%` }]
          : []),
        ...(typeof s.recall === 'number'
          ? [{ label: 'Recall', value: `${(s.recall * 100).toFixed(0)}%` }]
          : []),
        ...(typeof s.variant_coverage === 'number'
          ? [{ label: 'Variant coverage', value: `${(s.variant_coverage * 100).toFixed(0)}%` }]
          : []),
        ...(s.gate_decision ? [{ label: 'Gate', value: s.gate_decision }] : []),
        ...(s.gate_reason ? [{ label: 'Reason', value: s.gate_reason }] : []),
      ];
    }
    case 'backtested': {
      const s = stage as ArgusE2dBacktestedStage;
      return [
        ...(typeof s.windows_tested === 'number'
          ? [{ label: 'Windows tested', value: String(s.windows_tested) }]
          : []),
        ...(typeof s.true_positives === 'number'
          ? [{ label: 'True positives', value: String(s.true_positives) }]
          : []),
        ...(typeof s.false_positives === 'number'
          ? [{ label: 'False positives', value: String(s.false_positives) }]
          : []),
        ...(s.gate_decision ? [{ label: 'Gate', value: s.gate_decision }] : []),
      ];
    }
    case 'governance': {
      const s = stage as ArgusE2dGovernanceStage;
      return [
        ...(s.gate_status ? [{ label: 'Gate status', value: s.gate_status }] : []),
        ...(s.trust_tier ? [{ label: 'Trust tier', value: s.trust_tier }] : []),
        ...(s.blocked_reason ? [{ label: 'Block reason', value: s.blocked_reason }] : []),
      ];
    }
    case 'applied': {
      const s = stage as ArgusE2dAppliedStage;
      return [
        ...(s.rule_id ? [{ label: 'Rule', value: s.rule_id }] : []),
        ...(s.applied_at ? [{ label: 'Applied at', value: formatTimestamp(s.applied_at) }] : []),
        ...(s.rolled_back && typeof s.rollback_mttr_ms === 'number'
          ? [
              {
                label: 'Rollback MTTR',
                value: `${(s.rollback_mttr_ms / 1000).toFixed(1)}s`,
              },
            ]
          : []),
      ];
    }
    case 'running': {
      const s = stage as ArgusE2dRunningStage;
      return [
        ...(s.rule_id ? [{ label: 'Rule', value: s.rule_id }] : []),
        { label: 'Detections', value: `${s.live_hits} hits / ${s.live_hits_window}` },
      ];
    }
  }
};

interface StageCardProps {
  readonly stage: ArgusE2dStage;
  readonly isLast: boolean;
  /**
   * When set, the card is rendered as a button that opens the shared
   * artifact-details flyout pre-filled with `stage.source_index` /
   * `stage.source_doc_id`. Stages without a source doc stay read-only.
   */
  readonly onOpenDetails?: (stage: ArgusE2dStage) => void;
}

const StageCard: React.FC<StageCardProps> = ({ stage, isLast, onOpenDetails }) => {
  const { euiTheme } = useEuiTheme();
  const details = detailsForStage(stage);
  const isClickable = Boolean(onOpenDetails && stage.source_doc_id);
  const handleClick = useCallback(() => {
    if (onOpenDetails) onOpenDetails(stage);
  }, [onOpenDetails, stage]);

  return (
    <EuiFlexGroup
      gutterSize="m"
      alignItems="flexStart"
      responsive={false}
      data-test-subj={`argusE2dStage-${stage.kind}`}
    >
      <EuiFlexItem grow={false}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: euiTheme.size.xs,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: euiTheme.colors.lightestShade,
              border: `1px solid ${euiTheme.colors.lightShade}`,
            }}
          >
            <EuiIcon type={STAGE_ICON[stage.kind]} size="l" />
          </div>
          {isLast ? null : (
            <div
              style={{
                width: 2,
                flexGrow: 1,
                minHeight: 48,
                backgroundColor: euiTheme.colors.lightShade,
              }}
            />
          )}
        </div>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiPanel
          hasBorder
          paddingSize="m"
          {...(isClickable
            ? {
                onClick: handleClick,
                'aria-label': `View ${STAGE_LABELS[stage.kind]} details`,
                style: { cursor: 'pointer' },
                'data-test-subj': `argusE2dStageCard-${stage.kind}`,
              }
            : {})}
        >
          <EuiFlexGroup
            alignItems="center"
            gutterSize="s"
            responsive={false}
            justifyContent="spaceBetween"
          >
            <EuiFlexItem>
              <EuiText size="xs" color="subdued">
                {STAGE_LABELS[stage.kind]}
              </EuiText>
              <EuiText size="m">
                <strong>{stage.title}</strong>
              </EuiText>
              {stage.subtitle ? (
                <EuiText size="s" color="subdued">
                  {stage.subtitle}
                </EuiText>
              ) : null}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>{statusBadge(stage.status)}</EuiFlexItem>
                {isClickable ? (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content="View step details">
                      <EuiIcon type="inspect" color="subdued" />
                    </EuiToolTip>
                  </EuiFlexItem>
                ) : null}
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>

          {details.length > 0 ? (
            <>
              <EuiSpacer size="s" />
              <EuiFlexGroup gutterSize="m" responsive={false} wrap>
                {details.map((d) => (
                  <EuiFlexItem key={`${stage.kind}-${d.label}`} grow={false}>
                    <EuiText size="xs" color="subdued">
                      {d.label}
                    </EuiText>
                    <EuiText size="s">
                      <code>{d.value}</code>
                    </EuiText>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            </>
          ) : null}

          {stage.timestamp || stage.source_doc_id ? (
            <>
              <EuiHorizontalRule margin="s" />
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
                {stage.timestamp ? (
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      {formatTimestamp(stage.timestamp)}
                    </EuiText>
                  </EuiFlexItem>
                ) : null}
                {stage.source_index ? (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip
                      position="top"
                      content={
                        stage.source_doc_id
                          ? `doc id: ${stage.source_doc_id}`
                          : 'Elasticsearch index for this stage'
                      }
                    >
                      <EuiBadge color="hollow">
                        <code>{stage.source_index}</code>
                      </EuiBadge>
                    </EuiToolTip>
                  </EuiFlexItem>
                ) : null}
              </EuiFlexGroup>
            </>
          ) : null}
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

interface CvePickerProps {
  readonly items: readonly ArgusE2dRecentCve[];
  readonly selectedCve: string | undefined;
  readonly onSelect: (cve: string) => void;
  readonly kevOnly: boolean;
  readonly onToggleKev: (v: boolean) => void;
  readonly filterText: string;
  readonly onChangeFilter: (v: string) => void;
  readonly isLoading: boolean;
  readonly truncated: boolean;
}

const CvePicker: React.FC<CvePickerProps> = ({
  items,
  selectedCve,
  onSelect,
  kevOnly,
  onToggleKev,
  filterText,
  onChangeFilter,
  isLoading,
  truncated,
}) => {
  const visible = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      return (
        (i.cve_id ?? '').toLowerCase().includes(q) ||
        (i.title ?? '').toLowerCase().includes(q) ||
        (i.draft_rule_id ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, filterText]);

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="argusE2dCvePicker">
      <EuiTitle size="xxs">
        <h3>{'Recent CVE advisories'}</h3>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued">
        {'Pick a CVE to trace the full path from advisory to running rule.'}
      </EuiText>

      <EuiSpacer size="s" />

      <EuiFormRow display="rowCompressed">
        <EuiFieldText
          compressed
          placeholder="Filter by CVE, title, or rule id"
          value={filterText}
          onChange={(e) => onChangeFilter(e.target.value)}
          data-test-subj="argusE2dCveFilter"
        />
      </EuiFormRow>

      <EuiSpacer size="s" />

      <EuiSwitch
        compressed
        label="KEV only"
        checked={kevOnly}
        onChange={(e) => onToggleKev(e.target.checked)}
        data-test-subj="argusE2dKevToggle"
      />

      <EuiSpacer size="s" />

      {isLoading ? <EuiProgress size="xs" color="primary" /> : null}

      <EuiSpacer size="s" />

      {visible.length === 0 ? (
        <EuiText size="s" color="subdued">
          {filterText || kevOnly
            ? 'No CVEs match the current filters.'
            : 'No CVE advisories have been ingested yet.'}
        </EuiText>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {visible.map((item) => {
            const isSelected = selectedCve === item.cve_id || selectedCve === item.advisory_id;
            return (
              <EuiPanel
                key={item.advisory_id}
                paddingSize="s"
                hasBorder
                hasShadow={false}
                color={isSelected ? 'primary' : 'plain'}
                onClick={() => onSelect(item.cve_id ?? item.advisory_id)}
                data-test-subj={`argusE2dCveRow-${item.advisory_id}`}
                style={{ marginBottom: 8, cursor: 'pointer' }}
              >
                <EuiFlexGroup
                  alignItems="center"
                  gutterSize="s"
                  responsive={false}
                  justifyContent="spaceBetween"
                >
                  <EuiFlexItem>
                    <EuiText size="s">
                      <strong>{item.cve_id ?? item.advisory_id}</strong>
                    </EuiText>
                    {item.title ? (
                      <EuiText size="xs" color="subdued">
                        {item.title}
                      </EuiText>
                    ) : null}
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                      {item.severity ? (
                        <EuiFlexItem grow={false}>
                          <EuiBadge color={severityColor(item.severity)}>{item.severity}</EuiBadge>
                        </EuiFlexItem>
                      ) : null}
                      {item.kev ? (
                        <EuiFlexItem grow={false}>
                          <EuiBadge color="danger">{'KEV'}</EuiBadge>
                        </EuiFlexItem>
                      ) : null}
                      {item.has_mutation_intent ? (
                        <EuiFlexItem grow={false}>
                          <EuiToolTip content="Has an active mutation intent">
                            <EuiIcon type="link" />
                          </EuiToolTip>
                        </EuiFlexItem>
                      ) : null}
                    </EuiFlexGroup>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPanel>
            );
          })}
          {truncated ? (
            <EuiText size="xs" color="subdued">
              {`Showing ${visible.length} — narrow the filter to see more.`}
            </EuiText>
          ) : null}
        </div>
      )}
    </EuiPanel>
  );
};

/**
 * Per-stage subset of related lookups we request from the artifact-details
 * endpoint. We chain through the entities that give the richest story for
 * each stage so the Summary / Related tabs surface the full arc:
 *
 * - `ingested` / `exploit_probability` → the advisory / recommendation row,
 *   followed by whatever rule + mutation intent got synthesised from it.
 * - `synthesized` / `evaluated` / `backtested` → rule-centric with the
 *   backtest evidence block so operators see the query + FP/TP samples.
 * - `governance` / `applied` / `running` → rule-centric with the
 *   post-apply observation block (live alerts) + actor for trust context.
 */
const STAGE_RELATED_KINDS: Record<ArgusE2dStageKind, readonly ArgusArtifactRelatedKind[]> = {
  ingested: ['rule', 'mutation_intent', 'outcome'],
  exploit_probability: ['rule', 'mutation_intent', 'outcome'],
  synthesized: ['rule', 'mutation_intent', 'backtest', 'outcome'],
  evaluated: ['rule', 'mutation_intent', 'backtest'],
  backtested: ['rule', 'mutation_intent', 'backtest', 'outcome'],
  governance: ['rule', 'mutation_intent', 'actor', 'outcome'],
  applied: ['rule', 'mutation_intent', 'outcome', 'post_apply_observation', 'alert', 'actor'],
  running: ['rule', 'mutation_intent', 'outcome', 'post_apply_observation', 'alert'],
};

interface E2dStageDetailsFlyoutProps {
  readonly http: ArgusHttp;
  readonly stage: ArgusE2dStage;
  readonly onClose: () => void;
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
}

/**
 * Wraps the shared `ArgusArtifactDetailsFlyout` with a stage-aware header
 * (step label + status badge) and a compact summary that restates the
 * inline StageCard fields inside the flyout — so operators can drill from
 * the timeline into raw Elasticsearch context without losing continuity.
 */
const E2dStageDetailsFlyout: React.FC<E2dStageDetailsFlyoutProps> = ({
  http,
  stage,
  onClose,
  onPivot,
}) => {
  const stageLabel = STAGE_LABELS[stage.kind];
  const title = stage.title || stageLabel;
  const subtitle = (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
      <EuiFlexItem grow={false}>
        <EuiBadge color="hollow">{stageLabel}</EuiBadge>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>{statusBadge(stage.status)}</EuiFlexItem>
      {stage.subtitle ? (
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {stage.subtitle}
          </EuiText>
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  );

  const renderSummary = useCallback(
    (details: ArgusArtifactDetails | undefined) => (
      <>
        <StageDetailSummary stage={stage} />
        <DocumentNarrativeSummary
          details={details}
          dataTestSubj="argusE2dStageDetailsNarrative"
        />
      </>
    ),
    [stage]
  );

  return (
    <ArgusArtifactDetailsFlyout
      http={http}
      title={title}
      subtitle={subtitle}
      sourceIndex={stage.source_index ?? ''}
      sourceDocId={stage.source_doc_id ?? ''}
      includeRelated={STAGE_RELATED_KINDS[stage.kind]}
      onClose={onClose}
      renderSummary={renderSummary}
      onPivot={onPivot}
      dataTestSubj="argusE2dStageDetailsFlyout"
    />
  );
};

const StageDetailSummary: React.FC<{ readonly stage: ArgusE2dStage }> = ({ stage }) => {
  const details = detailsForStage(stage);
  const items: Array<{
    title: NonNullable<React.ReactNode>;
    description: NonNullable<React.ReactNode>;
  }> = [];

  if (stage.timestamp) {
    items.push({ title: 'When', description: formatTimestamp(stage.timestamp) });
  }

  for (const detail of details) {
    items.push({
      title: detail.label,
      description: <code>{detail.value}</code>,
    });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <EuiDescriptionList compressed listItems={items} />
      <EuiSpacer size="m" />
    </>
  );
};

export const E2dFlowPanel: React.FC<E2dFlowPanelProps> = ({
  http,
  initialCve,
  initialWindow = '24h',
  onOpenProposals,
  onPivot,
}) => {
  const [selectedCve, setSelectedCve] = useState<string | undefined>(initialCve);
  const [window, setWindow] = useState<E2dFlowWindow>(initialWindow);
  const [kevOnly, setKevOnly] = useState<boolean>(false);
  const [filterText, setFilterText] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<ArgusE2dStage | undefined>(undefined);
  const handleOpenStage = useCallback((stage: ArgusE2dStage) => {
    setSelectedStage(stage);
  }, []);
  const handleCloseStage = useCallback(() => {
    setSelectedStage(undefined);
  }, []);

  const recent = useRecentCves({
    http: http as ArgusHttp,
    kevOnly,
    limit: 50,
    enabled: Boolean(http),
    refreshIntervalMs: 30_000,
  });

  const items = recent.status === 'success' ? recent.data.items : [];
  const truncated = recent.status === 'success' ? recent.data.truncated : false;

  // Auto-select the first CVE if the caller didn't pre-select one. This keeps
  // the timeline populated the moment the tab opens instead of showing an
  // empty state until the user picks.
  useEffect(() => {
    if (selectedCve || recent.status !== 'success' || items.length === 0) return;
    const first = items[0];
    setSelectedCve(first.cve_id ?? first.advisory_id);
    // Intentionally only run when the recent list finishes its initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent.status]);

  const flow = useE2dFlow({
    http: http as ArgusHttp,
    cve: selectedCve,
    window,
    enabled: Boolean(http) && Boolean(selectedCve),
    refreshIntervalMs: 10_000,
  });

  const flowPayload: ArgusE2dFlowResponse | null = flow.status === 'success' ? flow.data : null;
  const isFlowLoading = Boolean(http) && Boolean(selectedCve) && flow.status === 'loading';

  return (
    <>
      <EuiFlexGroup gutterSize="l" alignItems="flexStart">
        <EuiFlexItem grow={3}>
          <CvePicker
            items={items}
            selectedCve={selectedCve}
            onSelect={setSelectedCve}
            kevOnly={kevOnly}
            onToggleKev={setKevOnly}
            filterText={filterText}
            onChangeFilter={setFilterText}
            isLoading={recent.status === 'loading'}
            truncated={truncated}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={7}>
          <EuiPanel hasBorder paddingSize="l" data-test-subj="argusE2dFlowPanel">
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
              <EuiFlexItem>
                <EuiTitle size="xs">
                  <h3>{'Exploit → Detection'}</h3>
                </EuiTitle>
                <EuiText size="xs" color="subdued">
                  {'Full path from CVE advisory ingest to a detection rule running with live hits.'}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonGroup
                  legend="Live hits window"
                  idSelected={window}
                  onChange={(id) => setWindow(id as E2dFlowWindow)}
                  options={WINDOW_OPTIONS.map(({ id, label }) => ({ id, label }))}
                  buttonSize="s"
                  data-test-subj="argusE2dWindowToggle"
                />
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />

            {!selectedCve ? (
              <EuiEmptyPrompt
                iconType="bug"
                title={<h4>{'Pick a CVE'}</h4>}
                body={
                  <EuiText size="s">
                    {'Select a CVE advisory from the list to trace its journey through Argus.'}
                  </EuiText>
                }
                data-test-subj="argusE2dFlowNoSelection"
              />
            ) : flow.status === 'error' ? (
              <EuiCallOut
                color="danger"
                iconType="alert"
                title="Couldn't load flow"
                data-test-subj="argusE2dFlowError"
              >
                {flow.error.message}
              </EuiCallOut>
            ) : isFlowLoading && !flowPayload ? (
              <EuiFlexGroup alignItems="center" justifyContent="center">
                <EuiFlexItem grow={false}>
                  <EuiLoadingSpinner size="l" />
                </EuiFlexItem>
              </EuiFlexGroup>
            ) : flowPayload?.reason_code === 'not_found' || !flowPayload?.flow ? (
              <EuiEmptyPrompt
                iconType="questionInCircle"
                title={<h4>{'CVE not found'}</h4>}
                body={
                  <EuiText size="s">
                    {'No advisory matched '}
                    <code>{selectedCve}</code>
                    {'. Has it been ingested into '}
                    <code>{'.soc-cve-advisories'}</code>
                    {'?'}
                  </EuiText>
                }
                data-test-subj="argusE2dFlowNotFound"
              />
            ) : (
              (() => {
                const { flow: currentFlow } = flowPayload;
                const stageCount = currentFlow.stages.length;
                return (
                  <>
                    <EuiFlexGroup
                      alignItems="center"
                      justifyContent="spaceBetween"
                      gutterSize="m"
                      responsive={false}
                      wrap
                    >
                      <EuiFlexItem>
                        <EuiText size="m">
                          <strong>{currentFlow.title ?? currentFlow.cve_id ?? '—'}</strong>
                        </EuiText>
                        <EuiText size="xs" color="subdued">
                          <code>{currentFlow.cve_id ?? currentFlow.advisory_id ?? '—'}</code>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiBadge color="primary">{currentFlow.overall_status}</EuiBadge>
                      </EuiFlexItem>
                    </EuiFlexGroup>

                    <EuiSpacer size="m" />

                    {currentFlow.stages.map((stage, idx) => {
                      const isLast = idx === stageCount - 1;
                      const showAlternatives =
                        stage.kind === 'synthesized' &&
                        http &&
                        (currentFlow.cve_id ?? currentFlow.advisory_id);
                      return (
                        <React.Fragment key={stage.kind}>
                          <StageCard
                            stage={stage}
                            isLast={isLast && !showAlternatives}
                            onOpenDetails={http ? handleOpenStage : undefined}
                          />
                          {showAlternatives ? (
                            <>
                              <EuiSpacer size="s" />
                              <SynthesisAlternativesInline
                                http={http as ArgusHttp}
                                cveId={(currentFlow.cve_id ?? currentFlow.advisory_id) as string}
                                onOpenFullView={onOpenProposals}
                              />
                              <EuiSpacer size="s" />
                            </>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </>
                );
              })()
            )}
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
      {selectedStage && http ? (
        <E2dStageDetailsFlyout
          http={http}
          stage={selectedStage}
          onClose={handleCloseStage}
          onPivot={onPivot}
        />
      ) : null}
    </>
  );
};
