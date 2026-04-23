/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiSkeletonText,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import type {
  DecisionGraphNodeKind,
  ReasoningChainSubject,
  ReasoningStep,
  ReasoningStepType,
  TrustTier,
} from '@kbn/argus-console-common';
import type { ArgusHttp } from '../../hooks';
import { useReasoningChain } from '../../hooks';
import { DecisionGraphFlyout } from '../decision_graph_panel';
import { SubjectPicker } from '../subject_picker/subject_picker';

const REASONING_KINDS = [
  { value: 'alert' as const, label: 'Alert' },
  { value: 'run' as const, label: 'Run' },
] as const;

const STEP_ICON: Record<ReasoningStepType, string> = {
  thought: 'editorComment',
  tool_call: 'bolt',
  tool_result: 'check',
  decision: 'flag',
  recommendation: 'starFilled',
};

const STEP_BADGE_COLOR: Record<ReasoningStepType, string> = {
  thought: 'hollow',
  tool_call: 'primary',
  tool_result: 'success',
  decision: 'accent',
  recommendation: 'warning',
};

const TRUST_TIER_COLOR: Record<TrustTier, string> = {
  frontier: 'primary',
  trusted: 'success',
  probationary: 'warning',
  quarantined: 'danger',
  system: 'default',
};

export interface ReasoningDrilldownPanelProps {
  readonly http: ArgusHttp;
  readonly subject: ReasoningChainSubject | undefined;
  readonly onSubjectChange?: (subject: ReasoningChainSubject | undefined) => void;
  /**
   * When provided, the flyout renders an "Open full-screen explorer" footer
   * button that delegates back to the host console so it can switch tabs and
   * pre-seed the Decision Graph panel with the same root.
   */
  readonly onOpenDecisionGraphFullScreen?: (args: {
    readonly rootKind: DecisionGraphNodeKind;
    readonly rootId: string;
  }) => void;
}

export const ReasoningDrilldownPanel: React.FC<ReasoningDrilldownPanelProps> = ({
  http,
  subject,
  onSubjectChange,
  onOpenDecisionGraphFullScreen,
}) => {
  const state = useReasoningChain({ http, subject });
  const [graphRoot, setGraphRoot] = useState<
    { kind: DecisionGraphNodeKind; id: string } | undefined
  >(undefined);

  const onShowDecisionGraph = (step: ReasoningStep): void => {
    // A reasoning step drills into the graph rooted at the reasoning run.
    // The flyout then lets the operator click any neighboring node to see
    // its details, and re-root to a related rule/actor/technique via the
    // full-screen explorer.
    setGraphRoot({ kind: 'reasoning', id: step.run_id });
  };

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="argusConsoleReasoningDrilldownPanel">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{'Reasoning drill-down'}</h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {subject
              ? `Subject: ${subject.kind}:${subject.id}`
              : 'Select an alert or run to inspect the reasoning chain.'}
          </EuiText>
        </EuiFlexItem>
        {state.status === 'success' && state.data.chain ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{`run ${state.data.chain.run_id}`}</EuiBadge>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>

      {onSubjectChange ? (
        <>
          <EuiSpacer size="s" />
          <SubjectPicker
            kinds={REASONING_KINDS}
            value={subject}
            placeholder="alert-id or run-id"
            onApply={onSubjectChange}
            testSubj="argusConsoleReasoningSubject"
          />
        </>
      ) : null}

      <EuiSpacer size="m" />

      {state.status === 'idle' ? (
        <EuiEmptyPrompt
          iconType="apmTrace"
          title={<h2>{'No subject selected'}</h2>}
          body={
            <EuiText>
              {
                'Open an alert flyout and click “Show ARGUS reasoning”, or pick an event from the activity feed.'
              }
            </EuiText>
          }
        />
      ) : null}

      {state.status === 'loading' ? <EuiSkeletonText lines={6} /> : null}

      {state.status === 'error' ? (
        <EuiCallOut color="danger" title="Unable to load reasoning chain">
          {state.error.message}
        </EuiCallOut>
      ) : null}

      {state.status === 'success' && state.data.reason_code !== 'ok' ? (
        <EuiCallOut color="warning" title="No reasoning chain available">
          {state.data.reason_code === 'no_trace'
            ? 'No reasoning trace has been recorded for this subject yet.'
            : state.data.reason_code === 'not_authorized'
            ? 'You are not authorized to view this chain.'
            : 'No run was found for this subject.'}
        </EuiCallOut>
      ) : null}

      {state.status === 'success' && state.data.chain ? (
        <div style={{ borderLeft: '2px solid #D3DAE6', paddingLeft: 16 }}>
          {state.data.chain.steps.map((step) => (
            <ReasoningStepCard
              key={`${step.run_id}:${step.step_index}`}
              step={step}
              onShowDecisionGraph={onShowDecisionGraph}
            />
          ))}
        </div>
      ) : null}

      {graphRoot ? (
        <DecisionGraphFlyout
          http={http}
          rootKind={graphRoot.kind}
          rootId={graphRoot.id}
          onClose={() => setGraphRoot(undefined)}
          onOpenFullScreen={
            onOpenDecisionGraphFullScreen
              ? (args) => {
                  setGraphRoot(undefined);
                  onOpenDecisionGraphFullScreen(args);
                }
              : undefined
          }
        />
      ) : null}
    </EuiPanel>
  );
};

const ReasoningStepCard: React.FC<{
  readonly step: ReasoningStep;
  readonly onShowDecisionGraph: (step: ReasoningStep) => void;
}> = ({ step, onShowDecisionGraph }) => {
  return (
    <EuiPanel
      hasBorder
      hasShadow={false}
      paddingSize="s"
      style={{ marginBottom: 12 }}
      data-test-subj={`argusConsoleReasoningDrilldownStep-${step.step_index}`}
    >
      <EuiFlexGroup alignItems="flexStart" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type={STEP_ICON[step.step_type]} size="l" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiBadge color={STEP_BADGE_COLOR[step.step_type]}>{step.step_type}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {`step ${step.step_index}`}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {step.timestamp}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                <EuiIcon type="user" size="s" />
                {` ${step.actor_id}`}
              </EuiText>
            </EuiFlexItem>
            {step.actor_trust_tier_at_decision ? (
              <EuiFlexItem grow={false}>
                <EuiToolTip content="Actor trust tier at decision time">
                  <EuiBadge color={TRUST_TIER_COLOR[step.actor_trust_tier_at_decision]}>
                    {step.actor_trust_tier_at_decision}
                  </EuiBadge>
                </EuiToolTip>
              </EuiFlexItem>
            ) : null}
            {typeof step.confidence === 'number' ? (
              <EuiFlexItem grow={false}>
                <ConfidenceBadge confidence={step.confidence} delta={step.confidence_delta} />
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>

          <EuiSpacer size="xs" />

          <EuiText size="s">
            <strong>{step.title}</strong>
          </EuiText>
          {step.body ? (
            <EuiText size="s" color="subdued">
              {step.body}
            </EuiText>
          ) : null}

          {step.tool_name ? (
            <EuiText size="xs" color="subdued">
              {'tool: '}
              <code>{step.tool_name}</code>
            </EuiText>
          ) : null}

          <EuiSpacer size="xs" />
          <EuiButtonEmpty
            size="xs"
            iconType="graphApp"
            onClick={() => onShowDecisionGraph(step)}
            data-test-subj={`argusConsoleReasoningStepShowDecisionGraph-${step.step_index}`}
          >
            {i18n.translate(
              'securitySolutionPackages.argusConsole.decisionGraph.showDecisionGraph',
              { defaultMessage: 'Show decision graph' }
            )}
          </EuiButtonEmpty>

          {step.injection_surface_flags && step.injection_surface_flags.length > 0 ? (
            <>
              <EuiSpacer size="xs" />
              {step.injection_surface_flags.map((flag, idx) => (
                <EuiCallOut
                  key={`${step.step_index}-flag-${idx}`}
                  color={flag.severity === 'error' ? 'danger' : 'warning'}
                  size="s"
                  title={`injection-surface: ${flag.code}`}
                  data-test-subj={`argusConsoleReasoningDrilldownFlag-${step.step_index}-${idx}`}
                >
                  {flag.reason}
                </EuiCallOut>
              ))}
            </>
          ) : null}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

const ConfidenceBadge: React.FC<{
  readonly confidence: number;
  readonly delta?: number;
}> = ({ confidence, delta }) => {
  const confPct = Math.round(confidence * 100);
  const color = confPct >= 80 ? 'success' : confPct >= 50 ? 'warning' : 'danger';

  const deltaText =
    typeof delta === 'number' ? ` (${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%)` : '';

  return (
    <EuiToolTip content={deltaText ? `delta vs previous step${deltaText}` : 'step confidence'}>
      <EuiBadge color={color}>{`conf ${confPct}%${deltaText}`}</EuiBadge>
    </EuiToolTip>
  );
};
