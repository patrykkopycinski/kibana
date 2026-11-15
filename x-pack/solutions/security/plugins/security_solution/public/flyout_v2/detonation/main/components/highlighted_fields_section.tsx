/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiDescriptionList } from '@elastic/eui';
import type { EuiDescriptionListProps } from '@elastic/eui';
import type { DetonateTask } from '../../../../../common/detonate_prototype';
import * as i18n from '../../../../detonate_prototype/translations';
import {
  DETONATION_HIGHLIGHTED_FIELDS_LIST_TEST_ID,
  DETONATION_HIGHLIGHTED_FIELDS_TEST_ID,
} from '../test_ids';
import type { DetonationIndicators, IndicatorType } from '../utils/detonation_indicators';
import { isDetonationVmStarted } from '../utils/detonation_vm_started';
import { OverviewSection } from './overview_section';

const SHOWN_INDICATORS = 3;

interface HighlightedFieldsSectionProps {
  task: DetonateTask;
  indicators: DetonationIndicators;
  /** True until the run is over and its record has been read. */
  pending: boolean;
  /** True when reading the run's record failed. */
  recordError: boolean;
}

/** A few indicators of the given types, with a count of the rest. */
const indicatorSummary = (
  { state, rows }: DetonationIndicators,
  types: IndicatorType[],
  pending: boolean,
  recordError: boolean
): string => {
  if (pending) return i18n.OVERVIEW_PENDING_UNTIL_COMPLETE;
  if (recordError) return i18n.OVERVIEW_RECORD_ERROR_FIELD;
  if (state === 'not_read') return i18n.OVERVIEW_NOT_READ;
  const values = rows.filter(({ type }) => types.includes(type)).map(({ value }) => value);
  if (!values.length) return i18n.OVERVIEW_NONE_FOUND;
  const shown = values.slice(0, SHOWN_INDICATORS).join(', ');
  return values.length > SHOWN_INDICATORS
    ? i18n.OVERVIEW_INDICATORS_SHOWN_WITH_MORE({
        shown,
        count: values.length - SHOWN_INDICATORS,
      })
    : shown;
};

export const HighlightedFieldsSection = ({
  task,
  indicators,
  pending,
  recordError,
}: HighlightedFieldsSectionProps) => {
  // Process and registry fields are left out: the run has no data for them until sandbox telemetry exists.
  const listItems: EuiDescriptionListProps['listItems'] = [
    { title: i18n.OVERVIEW_FIELD_SHA256, description: task.sample_hash ?? i18n.META_EMPTY },
    { title: i18n.OVERVIEW_FIELD_FILE_NAME, description: task.sample_filename ?? i18n.META_EMPTY },
    { title: i18n.OVERVIEW_FIELD_OS, description: task.vm_os_family ?? i18n.META_EMPTY },
    {
      title: i18n.OVERVIEW_FIELD_ARCHITECTURE,
      description: task.vm_architecture ?? i18n.META_EMPTY,
    },
    {
      title: i18n.OVERVIEW_FIELD_INTERNET,
      description: task.vm_has_internet ? i18n.OVERVIEW_INTERNET_ON : i18n.OVERVIEW_INTERNET_OFF,
    },
    {
      title: i18n.OVERVIEW_SANDBOX_AGENT_ID,
      // Only meaningful once the VM has been asked for, as in the progress section.
      description: (isDetonationVmStarted(task) && task.elastic_agent_id) || i18n.META_EMPTY,
    },
    {
      title: i18n.OVERVIEW_FIELD_NETWORK_INDICATORS,
      description: indicatorSummary(indicators, ['domain', 'ip'], pending, recordError),
    },
    {
      title: i18n.OVERVIEW_FIELD_FILE_INDICATORS,
      description: indicatorSummary(indicators, ['file_hash'], pending, recordError),
    },
  ];

  return (
    <OverviewSection
      sectionId="highlightedfields"
      title={i18n.OVERVIEW_HIGHLIGHTED_FIELDS_TITLE}
      defaultExpanded
      data-test-subj={DETONATION_HIGHLIGHTED_FIELDS_TEST_ID}
    >
      <EuiDescriptionList
        compressed
        type="column"
        columnWidths={[1, 3]}
        listItems={listItems}
        data-test-subj={DETONATION_HIGHLIGHTED_FIELDS_LIST_TEST_ID}
      />
    </OverviewSection>
  );
};
