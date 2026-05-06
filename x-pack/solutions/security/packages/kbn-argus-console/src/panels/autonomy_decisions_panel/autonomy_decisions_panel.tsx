/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  type EuiBasicTableColumn,
  EuiButtonGroup,
  EuiCallOut,
  EuiDescriptionList,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';

import {
  ARGUS_SOC_INDICES,
  type ArgusArtifactDetails,
  type ArgusArtifactRelatedKind,
  type ArgusAutonomyDecision,
  type ArgusAutonomyFinalStatus,
  type ArgusAutonomyWindow,
} from '@kbn/argus-console-common';

import { useAutonomyDecisions, type ArgusHttp } from '../../hooks';
import {
  ArgusArtifactDetailsFlyout,
  DocumentNarrativeSummary,
  type ArgusArtifactPivotTarget,
} from '../artifact_details_flyout';

export interface AutonomyDecisionsOpenRuleArgs {
  /** The verbatim `artifact_id` from `.soc-autonomy-decisions`. */
  readonly artifactId: string;
  /**
   * Kibana saved-object id of the rule, when the backend resolved the
   * `artifact_id` to a real rule. When absent the wrapper should route to
   * a generic surface (e.g. the rules list) rather than a 404 detail page.
   */
  readonly kibanaRuleId?: string;
}

export interface AutonomyDecisionsPanelProps {
  readonly http?: ArgusHttp;
  readonly initialWindow?: ArgusAutonomyWindow;
  /**
   * Called when an operator clicks a rule-typed artifact in the Autonomy
   * table. The security_solution wrapper implements this using
   * `application.navigateToApp` so the package stays independent of
   * Kibana's `application` client. When omitted, the artifact renders as
   * plain text.
   */
  readonly onOpenRule?: (args: AutonomyDecisionsOpenRuleArgs) => void;
  /**
   * Optional forwarder so pivot buttons in the shared details flyout
   * (Reasoning / Lineage / Decision graph) can land in the corresponding
   * console panels — mirrors the Activity feed + Mutation lineage plumbing.
   */
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
}

/**
 * Related-entity subset we request from the artifact_details route for an
 * autonomy decision. Autonomy docs are rule-centric — we chain
 * `artifact_id` → rule → mutation_intent → outcome → post_apply_observation
 * so the flyout's Related / Summary tabs surface the full decision arc.
 */
const AUTONOMY_RELATED_KINDS: readonly ArgusArtifactRelatedKind[] = [
  'rule',
  'mutation_intent',
  'outcome',
  'post_apply_observation',
];

const WINDOW_OPTIONS: ReadonlyArray<{ readonly id: ArgusAutonomyWindow; readonly label: string }> =
  [
    { id: '24h', label: 'Last 24h' },
    { id: '7d', label: 'Last 7d' },
  ];

const statusBadge = (status: ArgusAutonomyFinalStatus): JSX.Element => {
  switch (status) {
    case 'auto_applied':
      return <EuiBadge color="success">{'Auto-applied'}</EuiBadge>;
    case 'deferred':
      return <EuiBadge color="warning">{'Deferred'}</EuiBadge>;
    case 'required_human':
      return <EuiBadge color="accent">{'Needs human'}</EuiBadge>;
    case 'rejected':
      return <EuiBadge color="danger">{'Rejected'}</EuiBadge>;
    case 'rolled_back':
      return <EuiBadge color="warning">{'Rolled back'}</EuiBadge>;
    case 'unknown':
      return <EuiBadge color="hollow">{'Unknown'}</EuiBadge>;
  }
};

const formatTimestamp = (iso: string): string => {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : iso;
};

export const AutonomyDecisionsPanel: React.FC<AutonomyDecisionsPanelProps> = ({
  http,
  initialWindow = '24h',
  onOpenRule,
  onPivot,
}) => {
  const [window, setWindow] = useState<ArgusAutonomyWindow>(initialWindow);
  const [selectedDecision, setSelectedDecision] = useState<ArgusAutonomyDecision | undefined>(
    undefined
  );

  const state = useAutonomyDecisions({
    http: http as ArgusHttp,
    window,
    enabled: Boolean(http),
    refreshIntervalMs: 10_000,
  });

  const payload = state.status === 'success' ? state.data : null;
  const isLoading = Boolean(http) && state.status === 'loading';
  const hasLiveData = state.status === 'success';
  const counts = payload?.counts ?? {
    total: 0,
    auto_applied: 0,
    deferred: 0,
    required_human: 0,
    rejected: 0,
    rolled_back: 0,
  };

  const decisions = payload?.decisions ?? [];

  const columns = useMemo<Array<EuiBasicTableColumn<ArgusAutonomyDecision>>>(
    () => [
      {
        field: 'timestamp',
        name: 'When',
        width: '180px',
        render: (value: string) => <span title={value}>{formatTimestamp(value)}</span>,
      },
      {
        field: 'final_status',
        name: 'Outcome',
        width: '140px',
        render: (value: ArgusAutonomyFinalStatus) => statusBadge(value),
      },
      {
        field: 'artifact_id',
        name: 'Artifact',
        render: (_value, row: ArgusAutonomyDecision) => {
          // `rule` and `detection_rule` are both ARGUS-authored custom
          // detection rules — the former comes from older/synthesis paths
          // and the latter from the live update-rule action path. Treating
          // only `rule` as rule-like used to strand the 327+ live
          // `soc_post_apply_observer` decisions as plain text. Keep the two
          // bucketed together so they both become deep-links.
          const isCustomRule =
            row.artifact_type === 'rule' || row.artifact_type === 'detection_rule';
          const isPrebuiltRule = row.artifact_type === 'prebuilt_rule';
          const isRuleLike = isCustomRule || isPrebuiltRule;
          const canLink = isRuleLike && Boolean(onOpenRule);
          const hasKibanaId = Boolean(row.kibana_rule_id);

          // Prefer the resolved rule name so operators don't stare at bare
          // UUIDs (especially for prebuilt rules where `artifact_id` is the
          // logical rule_id assigned by the Elastic prebuilt package). Fall
          // back to `artifact_id` when the rule wasn't resolvable.
          const primaryLabel = row.kibana_rule_name ?? row.artifact_id;
          const showSecondaryId = Boolean(row.kibana_rule_name);

          // When we have a Kibana rule UUID we can deep-link to the rule
          // details page directly. When we don't (ARGUS emitted a logical
          // artifact id that was never materialised as a Kibana rule) the
          // wrapper still gets called so it can route to the rules list —
          // but we flag the row so operators know what they'll see.
          const artifactNode = canLink ? (
            <EuiLink
              onClick={(e: React.MouseEvent) => {
                // Keep the "jump to rule details" affordance independent of
                // the row-level "open shared flyout" click — without this
                // stop both handlers fire and the flyout pops while the app
                // navigates away.
                e.stopPropagation();
                onOpenRule?.({
                  artifactId: row.artifact_id,
                  kibanaRuleId: row.kibana_rule_id,
                });
              }}
              data-test-subj="argusAutonomyArtifactLink"
            >
              <strong>{primaryLabel}</strong>
            </EuiLink>
          ) : (
            <strong>{primaryLabel}</strong>
          );

          return (
            <div>
              <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
                <EuiFlexItem grow={false}>
                  <EuiText size="s">{artifactNode}</EuiText>
                </EuiFlexItem>
                {isPrebuiltRule ? (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip
                      position="top"
                      content="ARGUS autonomously enabled this Elastic prebuilt detection rule instead of synthesizing a new custom rule — the community-vetted candidate beat ARGUS's synthesized Pareto frontier on PR@k / false-positive cost."
                    >
                      <EuiBadge color="primary">{'prebuilt'}</EuiBadge>
                    </EuiToolTip>
                  </EuiFlexItem>
                ) : null}
              </EuiFlexGroup>
              <EuiFlexGroup
                gutterSize="xs"
                alignItems="center"
                responsive={false}
                wrap
                style={{ marginTop: 2 }}
              >
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">
                    {row.artifact_type ?? 'artifact'}
                    {row.action ? ` · ${row.action}` : ''}
                  </EuiText>
                </EuiFlexItem>
                {showSecondaryId ? (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip position="top" content={`rule_id: ${row.artifact_id}`}>
                      <EuiText size="xs" color="subdued" css={{ fontFamily: 'monospace' }}>
                        {`· ${row.artifact_id.slice(0, 8)}…`}
                      </EuiText>
                    </EuiToolTip>
                  </EuiFlexItem>
                ) : null}
                {isRuleLike && !hasKibanaId ? (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip
                      position="top"
                      content="ARGUS recorded this decision but no Kibana detection rule with this rule_id exists in this space. The apply step may not have materialised, or the rule was deleted."
                    >
                      <EuiBadge color="hollow">{'not in Kibana'}</EuiBadge>
                    </EuiToolTip>
                  </EuiFlexItem>
                ) : null}
              </EuiFlexGroup>
            </div>
          );
        },
      },
      {
        field: 'source_agent',
        name: 'Proposed by',
        width: '200px',
        render: (_v, row) => (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiText size="s">{row.source_agent ?? '—'}</EuiText>
            </EuiFlexItem>
            {row.trust_tier ? (
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">{row.trust_tier}</EuiBadge>
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        ),
      },
      {
        field: 'gates_passed',
        name: 'Gates',
        width: '140px',
        render: (_v, row) => {
          const passed = row.gates_passed?.length ?? 0;
          const evaluated = row.gates_evaluated?.length ?? 0;
          const gateText = `${passed}/${evaluated || '?'}`;
          const tooltip = row.first_failing_gate
            ? `First failing gate: ${row.first_failing_gate}`
            : `Gates passed: ${row.gates_passed?.join(', ') || 'n/a'}`;
          return (
            <EuiToolTip position="top" content={tooltip}>
              <EuiBadge color={row.first_failing_gate ? 'danger' : 'success'}>{gateText}</EuiBadge>
            </EuiToolTip>
          );
        },
      },
      {
        field: 'review_reason',
        name: 'Why',
        render: (value: string | undefined) =>
          value ? (
            <EuiText size="s" color="subdued">
              {value}
            </EuiText>
          ) : (
            <span>{'—'}</span>
          ),
      },
    ],
    [onOpenRule]
  );

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="argusConsoleAutonomyPanel">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{'Autonomy decisions'}</h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {'Every apply / defer / reject / rollback from '}
            <code>{'.soc-autonomy-decisions'}</code>
            {'. Shows the full gate cascade, source agent, and review reason.'}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={hasLiveData ? 'success' : 'hollow'}>
            {hasLiveData ? 'live' : 'demo-grade'}
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="m" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiStat title={counts.total} description="Decisions" titleSize="s" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={counts.auto_applied}
            description="Auto-applied"
            titleSize="s"
            titleColor="success"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={counts.required_human}
            description="Needed human"
            titleSize="s"
            titleColor="accent"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={counts.deferred}
            description="Deferred"
            titleSize="s"
            titleColor="warning"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={counts.rolled_back}
            description="Rolled back"
            titleSize="s"
            titleColor="warning"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={counts.rejected}
            description="Rejected"
            titleSize="s"
            titleColor="danger"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiButtonGroup
                legend="Time window"
                idSelected={window}
                onChange={(id) => setWindow(id as ArgusAutonomyWindow)}
                options={WINDOW_OPTIONS.map(({ id, label }) => ({ id, label }))}
                buttonSize="s"
                data-test-subj="argusAutonomyWindowToggle"
              />
            </EuiFlexItem>
            {window === '24h' ? (
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  position="top"
                  content="ARGUS keeps decisions indefinitely — flip to Last 7d to see the longer trail."
                >
                  <EuiText size="xs" color="subdued">
                    {'last 24h only'}
                  </EuiText>
                </EuiToolTip>
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isLoading ? (
        <>
          <EuiSpacer size="m" />
          <EuiProgress size="xs" color="primary" />
        </>
      ) : null}

      <EuiSpacer size="m" />

      {state.status === 'error' ? (
        <EuiCallOut
          color="danger"
          iconType="alert"
          title="Couldn't load autonomy decisions"
          data-test-subj="argusAutonomyError"
        >
          {state.error.message}
        </EuiCallOut>
      ) : decisions.length === 0 ? (
        <EuiEmptyPrompt
          iconType="dot"
          title={<h4>{'No autonomy decisions in this window'}</h4>}
          body={
            <EuiText size="s">
              {'Nothing in '}
              <code>{'.soc-autonomy-decisions'}</code>
              {' matched the '}
              <strong>{window === '24h' ? 'last 24 hours' : 'last 7 days'}</strong>
              {'. The autonomous-applier workflow populates this index on every tick.'}
            </EuiText>
          }
          data-test-subj="argusAutonomyEmpty"
        />
      ) : (
        <>
          <EuiBasicTable<ArgusAutonomyDecision>
            items={[...decisions]}
            columns={columns}
            tableLayout="auto"
            data-test-subj="argusAutonomyTable"
            rowProps={(decision) => ({
              onClick: () => setSelectedDecision(decision),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedDecision(decision);
                }
              },
              style: { cursor: 'pointer' },
              'aria-label': `Open details for ${decision.kibana_rule_name ?? decision.artifact_id}`,
              'data-test-subj': `argusAutonomyRow-${decision.id}`,
            })}
          />
          {payload?.truncated ? (
            <>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="subdued">
                {'Showing '}
                <strong>{decisions.length}</strong>
                {' decisions — more matched this window. Narrow the window to drill in.'}
              </EuiText>
            </>
          ) : null}
        </>
      )}

      {selectedDecision && http ? (
        <AutonomyDecisionDetailsFlyout
          http={http}
          decision={selectedDecision}
          onClose={() => setSelectedDecision(undefined)}
          onPivot={onPivot}
        />
      ) : null}
    </EuiPanel>
  );
};

/**
 * Shared details flyout for a single autonomy decision. Fetches the raw
 * `.soc-autonomy-decisions` doc via the artifact_details route and
 * requests the rule / mutation_intent / outcome / post_apply_observation
 * chain so operators see the full decision arc (what was evaluated, which
 * rule it targeted, what the backtest said, and what happened after apply).
 */
const AutonomyDecisionDetailsFlyout: React.FC<{
  readonly http: ArgusHttp;
  readonly decision: ArgusAutonomyDecision;
  readonly onClose: () => void;
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
}> = ({ http, decision, onClose, onPivot }) => {
  const title = decision.kibana_rule_name ?? decision.artifact_id;
  const subtitle = `${decision.artifact_type ?? 'artifact'} · ${decision.final_status}${
    decision.action ? ` · ${decision.action}` : ''
  }`;

  const renderSummary = useCallback(
    (details: ArgusArtifactDetails | undefined) => (
      <>
        <AutonomyDecisionSummary decision={decision} />
        <EuiSpacer size="m" />
        <DocumentNarrativeSummary details={details} dataTestSubj="argusConsoleAutonomyNarrative" />
      </>
    ),
    [decision]
  );

  return (
    <ArgusArtifactDetailsFlyout
      http={http}
      title={title}
      subtitle={subtitle}
      sourceIndex={ARGUS_SOC_INDICES.autonomyDecisions}
      sourceDocId={decision.id}
      includeRelated={AUTONOMY_RELATED_KINDS}
      onClose={onClose}
      renderSummary={renderSummary}
      onPivot={onPivot}
      dataTestSubj="argusConsoleAutonomyDetailsFlyout"
    />
  );
};

interface SummaryItem {
  readonly title: NonNullable<React.ReactNode>;
  readonly description: NonNullable<React.ReactNode>;
}

const AutonomyDecisionSummary: React.FC<{
  readonly decision: ArgusAutonomyDecision;
}> = ({ decision }) => {
  const items: SummaryItem[] = [
    { title: 'When', description: formatTimestamp(decision.timestamp) },
    { title: 'Outcome', description: statusBadge(decision.final_status) },
    {
      title: 'Artifact',
      description: (
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <strong>{decision.kibana_rule_name ?? decision.artifact_id}</strong>
            </EuiText>
          </EuiFlexItem>
          {decision.artifact_type ? (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{decision.artifact_type}</EuiBadge>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      ),
    },
  ];

  if (decision.source_agent) {
    items.push({
      title: 'Proposed by',
      description: (
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiText size="s">{decision.source_agent}</EuiText>
          </EuiFlexItem>
          {decision.trust_tier ? (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{decision.trust_tier}</EuiBadge>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      ),
    });
  }

  const passed = decision.gates_passed?.length ?? 0;
  const evaluated = decision.gates_evaluated?.length ?? 0;
  if (evaluated > 0) {
    items.push({
      title: 'Gates',
      description: (
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiBadge color={decision.first_failing_gate ? 'danger' : 'success'}>
              {`${passed}/${evaluated}`}
            </EuiBadge>
          </EuiFlexItem>
          {decision.first_failing_gate ? (
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {`first failing: ${decision.first_failing_gate}`}
              </EuiText>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      ),
    });
  }

  if (decision.review_reason) {
    items.push({
      title: 'Why',
      description: (
        <EuiText size="s" color="subdued">
          {decision.review_reason}
        </EuiText>
      ),
    });
  }

  if (decision.backtest_verdict) {
    items.push({ title: 'Backtest verdict', description: decision.backtest_verdict });
  }

  if (typeof decision.confidence === 'number' && Number.isFinite(decision.confidence)) {
    items.push({ title: 'Confidence', description: `${decision.confidence}` });
  }

  return <EuiDescriptionList compressed listItems={items} />;
};
