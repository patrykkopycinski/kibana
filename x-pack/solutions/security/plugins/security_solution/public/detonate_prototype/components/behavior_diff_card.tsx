/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — behavior diff against the previous run of the sample
 * (N2). Per-category chips over the two runs' sandbox telemetry: what this run
 * did that the previous one did not. The first run of a sample renders the
 * honest empty state, not a zero-delta table.
 */

import React from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import { useRunDiff } from '../hooks/use_detonate';
import { useFlyoutApi } from '../../flyout_v2/use_flyout_api';
import * as i18n from '../translations';

export const BEHAVIOR_DIFF_TEST_ID = 'detonatePrototypeBehaviorDiff';

interface BehaviorDiffCardProps {
  taskId: string;
}

const deltaBadgeColor = (delta: number): 'success' | 'danger' | 'hollow' =>
  delta > 0 ? 'danger' : delta < 0 ? 'success' : 'hollow';

const formatDelta = (delta: number): string => (delta > 0 ? `+${delta}` : `${delta}`);

export const BehaviorDiffCard = React.memo<BehaviorDiffCardProps>(({ taskId }) => {
  const { data } = useRunDiff(taskId);
  const { openDetonationFlyout } = useFlyoutApi();

  if (!data) return null;

  // Only the empty shape carries `reason`; the full result never does.
  if ('reason' in data) {
    return (
      <EuiPanel hasBorder data-test-subj={BEHAVIOR_DIFF_TEST_ID}>
        <EuiTitle size="xs">
          <h3>{i18n.BEHAVIOR_DIFF_TITLE}</h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          {i18n.BEHAVIOR_DIFF_EMPTY}
        </EuiText>
      </EuiPanel>
    );
  }

  const { delta, against_task_id: againstTaskId, comparable } = data;

  return (
    <EuiPanel hasBorder data-test-subj={BEHAVIOR_DIFF_TEST_ID}>
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{i18n.BEHAVIOR_DIFF_TITLE}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiLink
            onClick={() => openDetonationFlyout({ taskId: againstTaskId })}
            data-test-subj={`${BEHAVIOR_DIFF_TEST_ID}-priorLink`}
          >
            {i18n.BEHAVIOR_DIFF_PRIOR_LINK(againstTaskId.slice(0, 8))}
          </EuiLink>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      {!comparable && (
        <>
          <EuiText size="s" color="subdued">
            {i18n.BEHAVIOR_DIFF_NOT_COMPARABLE}
          </EuiText>
          <EuiSpacer size="s" />
        </>
      )}
      {delta.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18n.BEHAVIOR_DIFF_NO_CHANGE}
        </EuiText>
      ) : (
        <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
          {delta.map(({ category, current: c, prior: p, delta: d }) => (
            <EuiFlexItem key={category} grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiBadge
                    color={deltaBadgeColor(d)}
                    data-test-subj={`${BEHAVIOR_DIFF_TEST_ID}-chip-${category}`}
                  >{`${category} ${formatDelta(d)}`}</EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">{`${c} now · ${p} before`}</EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      )}
    </EuiPanel>
  );
});

BehaviorDiffCard.displayName = 'BehaviorDiffCard';
