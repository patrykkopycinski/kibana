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
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useProposals } from '../hooks/use_proposals';
import { useWatches } from '../hooks/use_watches';
import { useWorkflows } from '../hooks/use_workflows';
import { useWorkerEvalRecords } from '../hooks/use_worker_eval_records';

export const PerformanceConsole: React.FC = () => {
  const { proposals, isLoading: proposalsLoading } = useProposals();
  const { watches, isLoading: watchesLoading } = useWatches();
  const { workflows, isLoading: workflowsLoading } = useWorkflows();
  const { records, isLoading: recordsLoading } = useWorkerEvalRecords();
  const isLoading = proposalsLoading || watchesLoading || workflowsLoading || recordsLoading;

  const pendingDecisions = proposals.filter(
    (proposal) => !['approved', 'dismissed', 'escalated', 'deferred'].includes(proposal.status)
  ).length;
  const activeWatches = watches.filter((watch) => watch.status === 'active').length;
  const enabledWorkflows = workflows.filter((workflow) => workflow.enabled).length;
  const executedWorkflows = workflows.filter((workflow) => workflow.lastRunAt).length;

  const totalEvalRuns = records.length;
  const passedEvalRuns = records.filter((record) => record.score === 1).length;
  const evalPassRate = totalEvalRuns > 0 ? Math.round((passedEvalRuns / totalEvalRuns) * 100) : 0;

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

      <EuiSpacer size="xl" />
      <EuiText className="daybreakEyebrow" size="xs">
        WORKER EVALUATION
      </EuiText>
      <EuiSpacer size="s" />
      <EuiTitle size="s">
        <h2>Live eval records</h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="m" responsive>
        <EuiFlexItem>
          <EuiPanel hasBorder paddingSize="m" data-test-subj="daybreakMetricEvalRuns">
            <EuiStat title={totalEvalRuns} description="Eval runs" />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasBorder paddingSize="m" data-test-subj="daybreakMetricEvalPassRate">
            <EuiStat title={`${evalPassRate}%`} description="Shape-match pass rate" />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {records.length === 0 ? (
        <EuiEmptyPrompt
          title={<h3>No eval records yet</h3>}
          body={<p>Run the alert-analysis worker against golden examples to populate this list.</p>}
        />
      ) : (
        <EuiFlexGroup direction="column" gutterSize="s" data-test-subj="daybreakEvalRecordsList">
          {records.map((record) => (
            <EuiFlexItem key={record.id} grow={false}>
              <EuiPanel hasBorder paddingSize="s">
                <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
                  <EuiFlexItem>
                    <EuiText size="s">
                      <strong>{record.runId}</strong>
                    </EuiText>
                    <EuiText size="xs" color="subdued">
                      {record.environment} · {record.dataset}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={record.score === 1 ? 'success' : 'danger'}>
                      {record.score === 1 ? 'match' : 'mismatch'}
                    </EuiBadge>
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
