/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiDescriptionList, EuiFlexGroup, EuiFlexItem, EuiLink } from '@elastic/eui';
import type { EuiDescriptionListProps } from '@elastic/eui';
import type { ApplicationStart } from '@kbn/core/public';
import { AGENTBUILDER_APP_ID } from '@kbn/agent-builder-plugin/public';
import { FormattedRelative } from '@kbn/i18n-react';
import { SPACE_TAG_PREFIX } from '../../../../../common/detonate_prototype';
import type { DetonateTask, DetonationRecord } from '../../../../../common/detonate_prototype';
import { useKibana } from '../../../../common/lib/kibana';
import * as i18n from '../../../../detonate_prototype/translations';
import {
  DETONATION_RUN_DETAILS_CONVERSATION_LINK_TEST_ID,
  DETONATION_RUN_DETAILS_TEST_ID,
  DETONATION_RUN_DETAILS_WORKFLOW_LINK_TEST_ID,
} from '../test_ids';
import { OverviewSection } from './overview_section';

interface RunDetailsSectionProps {
  task: DetonateTask;
  record?: DetonationRecord;
}

/** `getUrlForApp` throws when the target app is not registered; the link is then omitted. */
const appUrl = (application: ApplicationStart, appId: string, path: string): string | undefined => {
  try {
    return application.getUrlForApp(appId, { path });
  } catch {
    return undefined;
  }
};

const details = (
  task: DetonateTask,
  record: DetonationRecord | undefined,
  application: ApplicationStart
): EuiDescriptionListProps['listItems'] => {
  const environment = [
    task.vm_os_family,
    task.vm_architecture,
    task.vm_has_internet ? i18n.OVERVIEW_DETAIL_INTERNET_ON : i18n.OVERVIEW_DETAIL_INTERNET_OFF,
  ]
    .filter(Boolean)
    .join(' · ');
  // Source and submitter come from the stored record; the task only knows where
  // the sample was fetched from.
  const source = record?.['detonate.source'] ?? task.sample_source;
  const submitter = record?.['detonate.submitter'];

  const items: EuiDescriptionListProps['listItems'] = [
    { title: i18n.OVERVIEW_DETAIL_TASK_ID, description: task.id },
    { title: i18n.OVERVIEW_FIELD_SHA256, description: task.sample_hash ?? i18n.META_EMPTY },
    { title: i18n.OVERVIEW_DETAIL_ENVIRONMENT, description: environment },
    {
      title: i18n.OVERVIEW_DETAIL_AGENT_VERSION,
      description: task.agent_version || i18n.META_EMPTY,
    },
    {
      title: i18n.OVERVIEW_DETAIL_TELEMETRY_CLUSTER,
      description: task.telemetry_cluster_version || i18n.META_EMPTY,
    },
    {
      title: i18n.OVERVIEW_DETAIL_SUBMITTED,
      description: <FormattedRelative value={new Date(task.created_at)} />,
    },
  ];
  if (source) items.push({ title: i18n.OVERVIEW_DETAIL_SOURCE, description: source });
  if (submitter) items.push({ title: i18n.OVERVIEW_DETAIL_SUBMITTER, description: submitter });

  // Epic #20877 §7: the links live in the run details, not in the Workflows or chat UI; pending product answer.
  const executionId = record?.['detonate.workflow.execution_id'];
  const workflowId = record?.['detonate.workflow.id'];
  if (executionId) {
    const workflowUrl = workflowId
      ? appUrl(
          application,
          'workflows',
          `/${encodeURIComponent(workflowId)}?tab=executions&executionId=${encodeURIComponent(
            executionId
          )}`
        )
      : undefined;
    items.push({
      title: i18n.OVERVIEW_DETAIL_WORKFLOW_RUN,
      description: workflowUrl ? (
        <EuiLink
          href={workflowUrl}
          target="_blank"
          data-test-subj={DETONATION_RUN_DETAILS_WORKFLOW_LINK_TEST_ID}
        >
          {i18n.OVERVIEW_DETAIL_OPEN_WORKFLOW_RUN}
        </EuiLink>
      ) : (
        executionId
      ),
    });
  }
  const conversationId = record?.['detonate.conversation_id'];
  if (conversationId) {
    const conversationUrl = appUrl(
      application,
      AGENTBUILDER_APP_ID,
      `/conversations/${encodeURIComponent(conversationId)}`
    );
    items.push({
      title: i18n.OVERVIEW_DETAIL_CONVERSATION,
      description: conversationUrl ? (
        <EuiLink
          href={conversationUrl}
          target="_blank"
          data-test-subj={DETONATION_RUN_DETAILS_CONVERSATION_LINK_TEST_ID}
        >
          {i18n.OVERVIEW_DETAIL_OPEN_CONVERSATION}
        </EuiLink>
      ) : (
        conversationId
      ),
    });
  }
  // The space tag scopes the run to a space; it is bookkeeping, not a label the analyst set.
  const tags = task.tags.filter((tag) => !tag.startsWith(SPACE_TAG_PREFIX));
  if (tags.length) {
    items.push({
      title: i18n.OVERVIEW_DETAIL_TAGS,
      description: (
        <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
          {tags.map((tag) => (
            <EuiFlexItem grow={false} key={tag}>
              <EuiBadge color="hollow">{tag}</EuiBadge>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      ),
    });
  }
  return items;
};

/** Visibility is left out: runs have no visibility setting yet. */
export const RunDetailsSection = ({ task, record }: RunDetailsSectionProps) => {
  const { application } = useKibana().services;
  return (
    <OverviewSection
      sectionId="rundetails"
      title={i18n.OVERVIEW_RUN_DETAILS_TITLE}
      defaultExpanded={false}
      data-test-subj={DETONATION_RUN_DETAILS_TEST_ID}
    >
      <EuiDescriptionList
        compressed
        type="column"
        columnWidths={[1, 3]}
        listItems={details(task, record, application)}
        data-test-subj="detonatePrototypeDetails"
      />
    </OverviewSection>
  );
};
