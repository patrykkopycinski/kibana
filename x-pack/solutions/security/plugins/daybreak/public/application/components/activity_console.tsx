/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useProposals } from '../hooks/use_proposals';
import { useWorkflows } from '../hooks/use_workflows';

interface ActivityEvent {
  id: string;
  timestamp: string;
  type: 'workflow' | 'proposal';
  action: string;
  title: string;
}

export const ActivityConsole: React.FC = () => {
  const { proposals, isLoading: proposalsLoading } = useProposals();
  const { workflows, isLoading: workflowsLoading } = useWorkflows();
  const isLoading = proposalsLoading || workflowsLoading;

  const events = React.useMemo<ActivityEvent[]>(() => {
    const workflowEvents: ActivityEvent[] = workflows.flatMap((workflow) =>
      (workflow.auditTrail ?? []).map((event, index) => ({
        id: `${workflow.id}-audit-${index}`,
        timestamp: event.timestamp,
        type: 'workflow' as const,
        action: event.action,
        title: workflow.name,
      }))
    );
    const proposalEvents: ActivityEvent[] = proposals.flatMap((proposal) =>
      (proposal.decisionHistory ?? []).map((entry, index) => ({
        id: `${proposal.id}-decision-${index}`,
        timestamp: entry.timestamp,
        type: 'proposal' as const,
        action: `${entry.fromStatus} → ${entry.toStatus}`,
        title: proposal.title,
      }))
    );
    return [...workflowEvents, ...proposalEvents].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [proposals, workflows]);

  if (isLoading) return <EuiLoadingSpinner size="m" />;

  return (
    <section data-test-subj="daybreakActivityConsole">
      <EuiText className="daybreakEyebrow" size="xs">
        ACTIVITY FEED
      </EuiText>
      <EuiSpacer size="s" />
      <EuiTitle size="s">
        <h2>Recent events</h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      {events.length === 0 ? (
        <EuiEmptyPrompt
          title={<h3>No activity yet</h3>}
          body={<p>Run workflows, create watches, or transition proposals to populate the feed.</p>}
        />
      ) : (
        <EuiFlexGroup direction="column" gutterSize="s" data-test-subj="daybreakActivityList">
          {events.slice(0, 50).map((event) => (
            <EuiFlexItem key={event.id} grow={false}>
              <EuiPanel hasBorder paddingSize="s">
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={event.type === 'workflow' ? 'primary' : 'warning'}>
                      {event.type}
                    </EuiBadge>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="s">
                      <strong>{event.title}</strong>
                    </EuiText>
                    <EuiText size="xs" color="subdued">
                      {event.action}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      {new Date(event.timestamp).toLocaleString()}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPanel>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      )}
    </section>
  );
};
