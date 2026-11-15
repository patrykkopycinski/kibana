/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiDescriptionList, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import type { EuiDescriptionListProps } from '@elastic/eui';
import { FormattedRelative } from '@kbn/i18n-react';
import { SPACE_TAG_PREFIX } from '../../../../../common/detonate_prototype';
import type { DetonateTask, DetonationRecord } from '../../../../../common/detonate_prototype';
import * as i18n from '../../../../detonate_prototype/translations';
import { DETONATION_RUN_DETAILS_TEST_ID } from '../test_ids';
import { OverviewSection } from './overview_section';

interface RunDetailsSectionProps {
  task: DetonateTask;
  record?: DetonationRecord;
}

const details = (
  task: DetonateTask,
  record: DetonationRecord | undefined
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
    { title: i18n.OVERVIEW_DETAIL_AGENT_VERSION, description: task.agent_version },
    { title: i18n.OVERVIEW_DETAIL_TELEMETRY_CLUSTER, description: task.telemetry_cluster_version },
    {
      title: i18n.OVERVIEW_DETAIL_SUBMITTED,
      description: <FormattedRelative value={new Date(task.created_at)} />,
    },
  ];
  if (source) items.push({ title: i18n.OVERVIEW_DETAIL_SOURCE, description: source });
  if (submitter) items.push({ title: i18n.OVERVIEW_DETAIL_SUBMITTER, description: submitter });
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
export const RunDetailsSection = ({ task, record }: RunDetailsSectionProps) => (
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
      listItems={details(task, record)}
      data-test-subj="detonatePrototypeDetails"
    />
  </OverviewSection>
);
