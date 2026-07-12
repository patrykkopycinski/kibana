/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useProposals } from '../hooks/use_proposals';
import { useWatches } from '../hooks/use_watches';
import { useWorkflows } from '../hooks/use_workflows';

export const PerformanceConsole: React.FC = () => {
  const { proposals, isLoading: proposalsLoading } = useProposals();
  const { watches, isLoading: watchesLoading } = useWatches();
  const { workflows, isLoading: workflowsLoading } = useWorkflows();
  const isLoading = proposalsLoading || watchesLoading || workflowsLoading;

  const pendingDecisions = proposals.filter(
    (proposal) => !['approved', 'dismissed', 'escalated', 'deferred'].includes(proposal.status)
  ).length;
  const activeWatches = watches.filter((watch) => watch.status === 'active').length;
  const enabledWorkflows = workflows.filter((workflow) => workflow.enabled).length;
  const executedWorkflows = workflows.filter((workflow) => workflow.lastRunAt).length;

  if (isLoading) return <EuiLoadingSpinner size="m" />;

  return (
    <section data-test-subj="daybreakPerformanceConsole">
      <EuiText className="daybreakEyebrow" size="xs">
        PERFORMANCE
      </EuiText>
      <EuiSpacer size="s" />
      <EuiTitle size="s">
        <h2>Operational metrics</h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      {proposals.length === 0 && watches.length === 0 && workflows.length === 0 ? (
        <EuiEmptyPrompt
          title={<h3>No data yet</h3>}
          body={<p>Configure watches and workflows, then run them to see operational metrics.</p>}
        />
      ) : (
        <EuiFlexGroup gutterSize="m" responsive>
          <EuiFlexItem>
            <EuiPanel hasBorder paddingSize="m" data-test-subj="daybreakMetricProposals">
              <EuiStat title={proposals.length} description="Total proposals" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel hasBorder paddingSize="m" data-test-subj="daybreakMetricPending">
              <EuiStat title={pendingDecisions} description="Pending decisions" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel hasBorder paddingSize="m" data-test-subj="daybreakMetricWatches">
              <EuiStat title={activeWatches} description="Active watches" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel hasBorder paddingSize="m" data-test-subj="daybreakMetricWorkflows">
              <EuiStat title={enabledWorkflows} description="Enabled workflows" />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiPanel hasBorder paddingSize="m" data-test-subj="daybreakMetricExecuted">
              <EuiStat title={executedWorkflows} description="Workflows executed" />
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
    </section>
  );
};
