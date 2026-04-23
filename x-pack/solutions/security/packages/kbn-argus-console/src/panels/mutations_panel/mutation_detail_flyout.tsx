/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCode,
  EuiCodeBlock,
  EuiDescriptionList,
  type EuiDescriptionListProps,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';

import type {
  ArgusMutationDetail,
  ArgusMutationDetailBacktest,
  ArgusMutationDetailCoverageDelta,
  ArgusMutationDetailGate,
  ArgusMutationDetailOutcome,
  ArgusMutationDetailPatternSeed,
  ArgusMutationDetailRuleDelta,
  ArgusMutationDetailSourceSignal,
  ArgusMutationVerdict,
  ArgusSynthesisResponse,
} from '@kbn/argus-console-common';

import { useMutationDetail, type ArgusHttp } from '../../hooks';
import { BacktestEvidenceBlock, PostApplyObservationBlock } from '../evidence_blocks';
import { ProposalsTable } from '../proposals_panel/proposals_table';

export interface MutationDetailFlyoutProps {
  readonly http: ArgusHttp;
  readonly mutationIntentId: string;
  readonly onClose: () => void;
  /** Whether the user can approve/reject blocked mutations. */
  readonly canApproveMutations?: boolean;
  /** Called when the user clicks Approve in the footer. */
  readonly onApprove?: (detail: ArgusMutationDetail) => void;
  /** Called when the user clicks Reject in the footer. */
  readonly onReject?: (detail: ArgusMutationDetail) => void;
  /**
   * When the mutation has already been decided optimistically by the
   * list view, the footer replaces its buttons with a terminal badge.
   */
  readonly decidedAction?: 'approve' | 'reject' | null;
}

const verdictBadge = (verdict: ArgusMutationVerdict): JSX.Element => {
  switch (verdict) {
    case 'applied':
      return <EuiBadge color="success">{'Applied'}</EuiBadge>;
    case 'rolled_back':
      return <EuiBadge color="warning">{'Rolled back'}</EuiBadge>;
    case 'blocked':
      return <EuiBadge color="danger">{'Blocked'}</EuiBadge>;
  }
};

const formatTimestamp = (iso: string | null): string => {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleString();
};

const formatDurationMs = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)} s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(m < 10 ? 2 : 1)} min`;
  const h = m / 60;
  return `${h.toFixed(h < 10 ? 2 : 1)} h`;
};

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
};

/**
 * Wrap a section in a titled panel with a short subtitle so the reviewer
 * can scan the flyout top-to-bottom without hunting for boundaries.
 */
const Section: React.FC<{
  readonly title: string;
  readonly subtitle?: string;
  readonly testSubj: string;
  readonly children: React.ReactNode;
}> = ({ title, subtitle, testSubj, children }) => (
  <EuiPanel hasBorder paddingSize="m" data-test-subj={testSubj}>
    <EuiTitle size="xxs">
      <h4>{title}</h4>
    </EuiTitle>
    {subtitle ? (
      <EuiText size="xs" color="subdued">
        {subtitle}
      </EuiText>
    ) : null}
    <EuiSpacer size="s" />
    {children}
  </EuiPanel>
);

const GateBlock: React.FC<{ readonly gate: ArgusMutationDetailGate }> = ({ gate }) => {
  const listItems: EuiDescriptionListProps['listItems'] = [
    { title: 'Status', description: gate.status ?? '—' },
    { title: 'Reason', description: gate.reason ?? '—' },
    { title: 'Policy', description: gate.policy_id ? <EuiCode>{gate.policy_id}</EuiCode> : '—' },
  ];
  if (gate.thresholds && Object.keys(gate.thresholds).length > 0) {
    for (const [key, value] of Object.entries(gate.thresholds)) {
      listItems.push({
        title: `Threshold · ${key}`,
        description: value === null ? '—' : typeof value === 'number' ? String(value) : value,
      });
    }
  }
  return (
    <EuiDescriptionList
      type="responsiveColumn"
      compressed
      listItems={listItems}
      data-test-subj="argusMutationDetailGateList"
    />
  );
};

const SourceSignalBlock: React.FC<{
  readonly signal: ArgusMutationDetailSourceSignal;
}> = ({ signal }) => (
  <EuiDescriptionList
    type="responsiveColumn"
    compressed
    listItems={[
      { title: 'Type', description: <EuiCode>{signal.type}</EuiCode> },
      { title: 'Description', description: signal.description || '—' },
      {
        title: 'Evidence count',
        description:
          signal.evidence_count === null || signal.evidence_count === undefined
            ? '—'
            : signal.evidence_count.toLocaleString(),
      },
      { title: 'First seen', description: formatTimestamp(signal.first_seen) },
    ]}
  />
);

/**
 * Render a `before → after` pair for one field of the rule delta. We
 * render both sides even when one is null because that's useful signal
 * ("was nothing, now query X" = a net-new rule).
 */
const DeltaRow: React.FC<{
  readonly label: string;
  readonly before: string | number | null;
  readonly after: string | number | null;
  readonly codeBlock?: boolean;
}> = ({ label, before, after, codeBlock }) => {
  if (before === null && after === null) return null;
  const beforeDisplay = before === null || before === undefined ? '—' : String(before);
  const afterDisplay = after === null || after === undefined ? '—' : String(after);
  return (
    <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiText size="xs" color="subdued">
          <strong>{label}</strong>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="m" alignItems="flexStart" responsive={false}>
          <EuiFlexItem>
            <EuiText size="xs" color="subdued">
              {'Before'}
            </EuiText>
            {codeBlock ? (
              <EuiCodeBlock paddingSize="s" fontSize="s" isCopyable={false}>
                {beforeDisplay}
              </EuiCodeBlock>
            ) : (
              <EuiText size="s">{beforeDisplay}</EuiText>
            )}
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="xs" color="subdued">
              {'After'}
            </EuiText>
            {codeBlock ? (
              <EuiCodeBlock paddingSize="s" fontSize="s" isCopyable>
                {afterDisplay}
              </EuiCodeBlock>
            ) : (
              <EuiText size="s">
                <strong>{afterDisplay}</strong>
              </EuiText>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const RuleDeltaBlock: React.FC<{ readonly delta: ArgusMutationDetailRuleDelta }> = ({ delta }) => (
  <EuiFlexGroup direction="column" gutterSize="s" responsive={false}>
    {delta.change_type || delta.mitre_technique ? (
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
          {delta.change_type ? (
            <EuiFlexItem grow={false}>
              <EuiBadge color="accent">{`${delta.change_type}`}</EuiBadge>
            </EuiFlexItem>
          ) : null}
          {delta.mitre_technique ? (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{`MITRE · ${delta.mitre_technique}`}</EuiBadge>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </EuiFlexItem>
    ) : null}
    <EuiFlexItem grow={false}>
      <DeltaRow label="Severity" before={delta.severity_before} after={delta.severity_after} />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <DeltaRow label="Threshold" before={delta.threshold_before} after={delta.threshold_after} />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <DeltaRow label="Query" before={delta.query_before} after={delta.query_after} codeBlock />
    </EuiFlexItem>
    {delta.rationale ? (
      <EuiFlexItem grow={false}>
        <EuiCallOut
          size="s"
          color="primary"
          iconType="bullseye"
          title="Rationale"
          data-test-subj="argusMutationDetailRationale"
        >
          <EuiText size="s">{delta.rationale}</EuiText>
        </EuiCallOut>
      </EuiFlexItem>
    ) : null}
  </EuiFlexGroup>
);

const BacktestBlock: React.FC<{ readonly backtest: ArgusMutationDetailBacktest }> = ({
  backtest,
}) => {
  const hasEvidence =
    Boolean(backtest.query) ||
    Boolean(backtest.window_start) ||
    Boolean(backtest.window_end) ||
    backtest.fp_samples.length > 0 ||
    backtest.tp_samples.length > 0;
  return (
    <>
      <EuiFlexGroup gutterSize="m" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={backtest.tp.toLocaleString()}
            description="True positives"
            titleSize="s"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={backtest.fp.toLocaleString()}
            description="False positives"
            titleSize="s"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={backtest.windows.toLocaleString()}
            description="Windows evaluated"
            titleSize="s"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat
            title={formatPercent(backtest.precision)}
            description="Precision"
            titleSize="s"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiStat title={formatPercent(backtest.fp_rate)} description="FP rate" titleSize="s" />
        </EuiFlexItem>
        {backtest.gate_decision ? (
          <EuiFlexItem grow={false}>
            <EuiStat
              title={
                <EuiBadge color={backtest.gate_decision === 'pass' ? 'success' : 'warning'}>
                  {backtest.gate_decision}
                </EuiBadge>
              }
              description="Gate decision"
              titleSize="s"
            />
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>
      {hasEvidence ? (
        <>
          <EuiSpacer size="m" />
          <BacktestEvidenceBlock
            query={backtest.query}
            windowStart={backtest.window_start}
            windowEnd={backtest.window_end}
            fpSamples={backtest.fp_samples}
            tpSamples={backtest.tp_samples}
            dataTestSubj="argusMutationDetailBacktestEvidence"
          />
        </>
      ) : null}
    </>
  );
};

const SynthesisBlock: React.FC<{ readonly synthesis: ArgusSynthesisResponse }> = ({
  synthesis,
}) => {
  if (synthesis.missing_reason) {
    return (
      <EuiText size="s" color="subdued">
        {synthesis.missing_reason === 'no_synthesis_metadata'
          ? 'Recommendation predates Pareto synthesis — no alternatives recorded.'
          : synthesis.missing_reason === 'recommendation_not_found'
          ? 'No recommendation linked — synthesis has not run.'
          : 'Advisory not found.'}
      </EuiText>
    );
  }
  if (synthesis.proposals.length === 0) {
    return (
      <EuiText size="s" color="subdued">
        {'No alternatives recorded for this recommendation.'}
      </EuiText>
    );
  }
  return <ProposalsTable proposals={synthesis.proposals} compact />;
};

/**
 * Tier 2 — procedure-cluster chips. Each chip is a plain-text label the
 * synthesizer extracted while walking the corpus (e.g. "lolbin:certutil",
 * "registry-autorun"). We render them as chips + a deep-link to Discover
 * so reviewers can pivot to the raw corpus docs that carry the label.
 */
const ProcedureClustersSection: React.FC<{
  readonly seed: ArgusMutationDetailPatternSeed;
}> = ({ seed }) => {
  const clusters = seed.procedure_clusters;
  if (seed.pattern_id === null && clusters.length === 0) {
    return (
      <EuiText size="s" color="subdued">
        {'No seed pattern matched this technique — Argus synthesized from the advisory directly.'}
      </EuiText>
    );
  }
  return (
    <EuiFlexGroup direction="column" gutterSize="s" responsive={false}>
      {seed.pattern_id ? (
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {'Seeded from pattern '}
            <EuiCode>{seed.pattern_id}</EuiCode>
          </EuiText>
        </EuiFlexItem>
      ) : null}
      {clusters.length > 0 ? (
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
            {clusters.map((cluster) => (
              <EuiFlexItem key={cluster} grow={false}>
                <EuiBadge color="hollow" data-test-subj="argusMutationDetailProcedureClusterChip">
                  {cluster}
                </EuiBadge>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFlexItem>
      ) : (
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued">
            {'No procedure clusters were recorded for this intent.'}
          </EuiText>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};

/**
 * Tier 2 — coverage delta. Shows which techniques and procedures move
 * into covered state if the reviewer approves this intent, plus any
 * existing rules that the synthesizer believes become redundant.
 */
const CoverageDeltaSection: React.FC<{
  readonly delta: ArgusMutationDetailCoverageDelta;
}> = ({ delta }) => {
  const techniqueCount = delta.newly_covered_techniques.length;
  const procedureCount = delta.newly_covered_procedures.length;
  const redundantCount = delta.now_redundant_rule_ids.length;
  return (
    <EuiFlexGroup direction="column" gutterSize="s" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="m" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={techniqueCount.toLocaleString()}
              description="Newly covered techniques"
              titleSize="s"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={procedureCount.toLocaleString()}
              description="Newly covered procedures"
              titleSize="s"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={redundantCount.toLocaleString()}
              description="Rules now redundant"
              titleSize="s"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      {techniqueCount > 0 ? (
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>{'Techniques: '}</strong>
          </EuiText>
          <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
            {delta.newly_covered_techniques.map((t) => (
              <EuiFlexItem key={t} grow={false}>
                <EuiBadge color="success">{t}</EuiBadge>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFlexItem>
      ) : null}
      {redundantCount > 0 ? (
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>{'Now redundant: '}</strong>
          </EuiText>
          <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
            {delta.now_redundant_rule_ids.map((ruleId) => (
              <EuiFlexItem key={ruleId} grow={false}>
                <EuiBadge color="warning">
                  <EuiCode transparentBackground>{ruleId}</EuiCode>
                </EuiBadge>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFlexItem>
      ) : null}
      <EuiFlexItem grow={false}>
        <EuiText size="xs" color="subdued">
          {'Scored against snapshot '}
          <EuiCode>{formatTimestamp(delta.snapshot_ts)}</EuiCode>
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const OutcomeBlock: React.FC<{ readonly outcome: ArgusMutationDetailOutcome }> = ({ outcome }) => {
  const listItems: EuiDescriptionListProps['listItems'] = [
    { title: 'Applied at', description: formatTimestamp(outcome.applied_at) },
  ];
  if (outcome.rolled_back) {
    listItems.push(
      { title: 'Rolled back at', description: formatTimestamp(outcome.rolled_back_at) },
      { title: 'Rollback reason', description: outcome.rollback_reason ?? '—' },
      { title: 'Rollback MTTR', description: formatDurationMs(outcome.rollback_mttr_ms) }
    );
  }
  if (outcome.label) {
    listItems.push({ title: 'Label', description: outcome.label });
  }
  return (
    <>
      {outcome.rolled_back ? (
        <EuiCallOut
          color="warning"
          size="s"
          iconType="alert"
          title="This mutation was rolled back"
          data-test-subj="argusMutationDetailRollbackCallout"
        >
          <EuiText size="s">
            {outcome.rollback_reason ?? 'No reason recorded by the recovery workflow.'}
          </EuiText>
        </EuiCallOut>
      ) : null}
      <EuiSpacer size="s" />
      <EuiDescriptionList type="responsiveColumn" compressed listItems={listItems} />
      {outcome.post_apply_observation ? (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xxs">
            <h5>{'Post-apply observation'}</h5>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            {outcome.rolled_back
              ? 'Alerts the rule fired before auto-rollback tripped the guardrail.'
              : 'Alerts the rule fired inside the canary/watch window.'}
          </EuiText>
          <EuiSpacer size="s" />
          <PostApplyObservationBlock
            observation={outcome.post_apply_observation}
            dataTestSubj="argusMutationDetailPostApplyObservation"
          />
        </>
      ) : null}
    </>
  );
};

export const MutationDetailFlyout: React.FC<MutationDetailFlyoutProps> = ({
  http,
  mutationIntentId,
  onClose,
  canApproveMutations = false,
  onApprove,
  onReject,
  decidedAction = null,
}) => {
  const flyoutTitleId = useGeneratedHtmlId({ prefix: 'argusMutationDetailFlyout' });
  const state = useMutationDetail({ http, mutationIntentId });

  const renderBody = (): JSX.Element => {
    if (state.status === 'loading' || state.status === 'idle') {
      return (
        <EuiFlexGroup justifyContent="center" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s" color="subdued">
              {'Loading mutation detail…'}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }
    if (state.status === 'error') {
      return (
        <EuiCallOut color="danger" iconType="alert" title="Couldn't load mutation detail">
          {state.error.message}
        </EuiCallOut>
      );
    }
    if (state.data.reason_code === 'not_found' || !state.data.detail) {
      return (
        <EuiEmptyPrompt
          iconType="dot"
          title={<h4>{'Mutation not found'}</h4>}
          body={
            <EuiText size="s">
              {'No intent or outcome doc was found for '}
              <EuiCode>{mutationIntentId}</EuiCode>
              {'.'}
            </EuiText>
          }
        />
      );
    }

    const detail = state.data.detail;
    return (
      <EuiFlexGroup direction="column" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false}>
          <Section
            title="Governance gate"
            subtitle="Policy verdict from .soc-mutation-intents"
            testSubj="argusMutationDetailGateSection"
          >
            <GateBlock gate={detail.gate} />
          </Section>
        </EuiFlexItem>

        {detail.source_signal ? (
          <EuiFlexItem grow={false}>
            <Section
              title="Source signal"
              subtitle="Upstream event that triggered the mutation"
              testSubj="argusMutationDetailSourceSignalSection"
            >
              <SourceSignalBlock signal={detail.source_signal} />
            </Section>
          </EuiFlexItem>
        ) : null}

        {detail.proposed_rule_delta ? (
          <EuiFlexItem grow={false}>
            <Section
              title="Proposed rule change"
              subtitle="Before / after values Argus wants to write"
              testSubj="argusMutationDetailRuleDeltaSection"
            >
              <RuleDeltaBlock delta={detail.proposed_rule_delta} />
            </Section>
          </EuiFlexItem>
        ) : null}

        {detail.synthesis ? (
          <EuiFlexItem grow={false}>
            <Section
              title="Pareto alternatives"
              subtitle="Chosen / frontier / dominated candidates synthesised for this advisory"
              testSubj="argusMutationDetailSynthesisSection"
            >
              <SynthesisBlock synthesis={detail.synthesis} />
            </Section>
          </EuiFlexItem>
        ) : null}

        {detail.pattern_seed ? (
          <EuiFlexItem grow={false}>
            <Section
              title="Procedure clusters"
              subtitle="Pattern seed + clusters drawn from .soc-detection-patterns"
              testSubj="argusMutationDetailProcedureClustersSection"
            >
              <ProcedureClustersSection seed={detail.pattern_seed} />
            </Section>
          </EuiFlexItem>
        ) : null}

        {detail.coverage_delta ? (
          <EuiFlexItem grow={false}>
            <Section
              title="Coverage delta"
              subtitle="How this mutation moves corpus coverage if approved"
              testSubj="argusMutationDetailCoverageDeltaSection"
            >
              <CoverageDeltaSection delta={detail.coverage_delta} />
            </Section>
          </EuiFlexItem>
        ) : null}

        {detail.backtest ? (
          <EuiFlexItem grow={false}>
            <Section
              title="Backtest"
              subtitle={
                detail.verdict === 'blocked'
                  ? 'Cached preview from the synthesis step (no authoritative run)'
                  : 'Authoritative run from .soc-backtest-results'
              }
              testSubj="argusMutationDetailBacktestSection"
            >
              <BacktestBlock backtest={detail.backtest} />
            </Section>
          </EuiFlexItem>
        ) : null}

        {detail.outcome ? (
          <EuiFlexItem grow={false}>
            <Section
              title="Outcome"
              subtitle="From .soc-outcomes, joined by mutation_intent_id"
              testSubj="argusMutationDetailOutcomeSection"
            >
              <OutcomeBlock outcome={detail.outcome} />
            </Section>
          </EuiFlexItem>
        ) : null}

        <EuiFlexItem grow={false}>
          <Section
            title="Actor"
            subtitle="Which agent proposed this mutation"
            testSubj="argusMutationDetailActorSection"
          >
            <EuiDescriptionList
              type="responsiveColumn"
              compressed
              listItems={[
                {
                  title: 'Agent',
                  description: detail.actor.id ? <EuiCode>{detail.actor.id}</EuiCode> : '—',
                },
                { title: 'Trust tier', description: detail.actor.trust_tier ?? '—' },
                {
                  title: 'Confidence',
                  description:
                    detail.actor.confidence_score === null ||
                    detail.actor.confidence_score === undefined
                      ? '—'
                      : formatPercent(detail.actor.confidence_score),
                },
                {
                  title: 'Recent mutations (24h)',
                  description:
                    detail.actor.recent_mutations === null ||
                    detail.actor.recent_mutations === undefined
                      ? '—'
                      : detail.actor.recent_mutations.toLocaleString(),
                },
              ]}
            />
          </Section>
        </EuiFlexItem>

        {detail.advisory ? (
          <EuiFlexItem grow={false}>
            <Section
              title="Advisory"
              subtitle="Linked CVE / advisory this mutation is mitigating"
              testSubj="argusMutationDetailAdvisorySection"
            >
              <EuiDescriptionList
                type="responsiveColumn"
                compressed
                listItems={[
                  {
                    title: 'Advisory',
                    description: detail.advisory.advisory_id ? (
                      <EuiCode>{detail.advisory.advisory_id}</EuiCode>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    title: 'CVE',
                    description: detail.advisory.cve_id ? (
                      <EuiCode>{detail.advisory.cve_id}</EuiCode>
                    ) : (
                      '—'
                    ),
                  },
                  { title: 'Title', description: detail.advisory.title ?? '—' },
                  {
                    title: 'CVSS',
                    description:
                      detail.advisory.cvss === null || detail.advisory.cvss === undefined
                        ? '—'
                        : detail.advisory.cvss.toFixed(1),
                  },
                  {
                    title: 'Published',
                    description: formatTimestamp(detail.advisory.published_at),
                  },
                ]}
              />
            </Section>
          </EuiFlexItem>
        ) : null}

        <EuiFlexItem grow={false}>
          <Section
            title="Audit"
            subtitle="IDs for cross-referencing in the ledger"
            testSubj="argusMutationDetailAuditSection"
          >
            <EuiDescriptionList
              type="responsiveColumn"
              compressed
              listItems={[
                {
                  title: 'mutation_intent_id',
                  description: <EuiCode>{detail.audit.mutation_intent_id}</EuiCode>,
                },
                {
                  title: 'rule_id',
                  description: detail.audit.rule_id ? (
                    <EuiCode>{detail.audit.rule_id}</EuiCode>
                  ) : (
                    '—'
                  ),
                },
                {
                  title: 'advisory_id',
                  description: detail.audit.advisory_id ? (
                    <EuiCode>{detail.audit.advisory_id}</EuiCode>
                  ) : (
                    '—'
                  ),
                },
                {
                  title: 'recommendation_id',
                  description: detail.audit.recommendation_id ? (
                    <EuiCode>{detail.audit.recommendation_id}</EuiCode>
                  ) : (
                    '—'
                  ),
                },
              ]}
            />
          </Section>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const detail = state.status === 'success' ? state.data.detail : null;
  const showApprovalFooter =
    canApproveMutations && detail?.verdict === 'blocked' && Boolean(detail.mutation_intent_id);

  return (
    <EuiFlyout
      ownFocus
      onClose={onClose}
      size="m"
      aria-labelledby={flyoutTitleId}
      data-test-subj="argusMutationDetailFlyout"
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            {detail ? (
              verdictBadge(detail.verdict)
            ) : (
              <EuiBadge color="hollow">{'Loading'}</EuiBadge>
            )}
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="s">
              <h2 id={flyoutTitleId}>
                {detail?.title ?? detail?.label ?? detail?.rule_id ?? mutationIntentId}
              </h2>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
        {detail?.subtitle ? (
          <>
            <EuiSpacer size="xs" />
            <EuiText size="s" color="subdued">
              {detail.subtitle}
            </EuiText>
          </>
        ) : null}
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued">
          <code>{mutationIntentId}</code>
          {detail?.timestamp ? (
            <>
              {' · '}
              {formatTimestamp(detail.timestamp)}
            </>
          ) : null}
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {renderBody()}
        <EuiHorizontalRule margin="l" />
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              onClick={onClose}
              iconType="cross"
              data-test-subj="argusMutationDetailClose"
            >
              {'Close'}
            </EuiButtonEmpty>
          </EuiFlexItem>
          {decidedAction ? (
            <EuiFlexItem grow={false}>
              <EuiBadge color={decidedAction === 'approve' ? 'success' : 'danger'}>
                {decidedAction === 'approve' ? 'Approved' : 'Rejected'}
              </EuiBadge>
            </EuiFlexItem>
          ) : showApprovalFooter && detail ? (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    color="danger"
                    iconType="cross"
                    onClick={() => onReject?.(detail)}
                    data-test-subj="argusMutationDetailReject"
                  >
                    {'Reject'}
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    color="success"
                    iconType="check"
                    onClick={() => onApprove?.(detail)}
                    data-test-subj="argusMutationDetailApprove"
                  >
                    {'Approve'}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
