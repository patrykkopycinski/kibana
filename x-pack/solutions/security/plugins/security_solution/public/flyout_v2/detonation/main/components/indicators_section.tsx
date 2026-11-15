/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import {
  EuiBasicTable,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { COMMENT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { KbnDangerCallout } from '@kbn/ui-callout';
import { useKibana } from '../../../../common/lib/kibana';
import { downloadBlob } from '../../../../common/utils/download_blob';
import { useCanAttachToCase } from '../../../../cases/attachments/hooks/use_can_attach_to_case';
import * as i18n from '../../../../detonate_prototype/translations';
import {
  DETONATION_INDICATORS_ADD_TO_CASE_TEST_ID,
  DETONATION_INDICATORS_CREATE_RULE_TEST_ID,
  DETONATION_INDICATORS_EMPTY_TEST_ID,
  DETONATION_INDICATORS_ERROR_TEST_ID,
  DETONATION_INDICATORS_EXPORT_STIX_TEST_ID,
  DETONATION_INDICATORS_NOT_READ_TEST_ID,
  DETONATION_INDICATORS_PENDING_TEST_ID,
  DETONATION_INDICATORS_RETRY_TEST_ID,
  DETONATION_INDICATORS_TABLE_TEST_ID,
  DETONATION_INDICATORS_TEST_ID,
} from '../test_ids';
import { buildIndicatorsComment, buildStixBundle } from '../utils/detonation_indicators';
import type {
  DetonationIndicators,
  IndicatorRow,
  IndicatorType,
} from '../utils/detonation_indicators';
import { OverviewSection } from './overview_section';

const TYPE_LABEL: Record<IndicatorType, string> = {
  domain: i18n.OVERVIEW_INDICATOR_TYPE_DOMAIN,
  ip: i18n.OVERVIEW_INDICATOR_TYPE_IP,
  file_hash: i18n.OVERVIEW_INDICATOR_TYPE_FILE_HASH,
};

const COLUMNS: Array<EuiBasicTableColumn<IndicatorRow>> = [
  {
    field: 'type',
    name: i18n.OVERVIEW_INDICATOR_TYPE,
    width: '120px',
    render: (type: IndicatorType) => TYPE_LABEL[type],
  },
  { field: 'value', name: i18n.OVERVIEW_INDICATOR_VALUE, truncateText: true },
];

interface IndicatorsSectionProps {
  taskId: string;
  /** When the run was created; stamps the STIX export. */
  createdAt: string;
  indicators: DetonationIndicators;
  /** True until the run is over and its record has been read. */
  pending: boolean;
  /** True when reading the run's record failed. */
  recordError: boolean;
  onRetry: () => void;
  /** True while a retry of the record read is in flight. */
  retrying?: boolean;
}

export const IndicatorsSection = ({
  taskId,
  createdAt,
  indicators,
  pending,
  recordError,
  onRetry,
  retrying = false,
}: IndicatorsSectionProps) => {
  const { cases } = useKibana().services;
  const canAttachToCase = useCanAttachToCase();
  const { rows, state } = indicators;

  const caseModal = cases.hooks.useCasesAddToExistingCaseModal({
    onClose: () => {},
    onSuccess: () => {},
  });

  // One comment that lists every indicator: the case attachment types the
  // detonation flyout can use take text, not structured indicators.
  const onAddToCase = useCallback(() => {
    caseModal.open({
      getAttachments: () => [
        { type: COMMENT_ATTACHMENT_TYPE, data: { content: buildIndicatorsComment(taskId, rows) } },
      ],
    });
  }, [caseModal, taskId, rows]);

  const onExportStix = useCallback(() => {
    const bundle = buildStixBundle(taskId, rows, createdAt);
    downloadBlob(
      new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
      `detonation-${taskId}-indicators.stix.json`
    );
  }, [taskId, createdAt, rows]);

  let body: React.ReactNode;
  if (pending) {
    body = (
      <EuiText size="s" color="subdued" data-test-subj={DETONATION_INDICATORS_PENDING_TEST_ID}>
        {i18n.OVERVIEW_INDICATORS_PENDING}
      </EuiText>
    );
  } else if (recordError) {
    body = (
      <KbnDangerCallout
        size="s"
        title={i18n.OVERVIEW_RECORD_ERROR_TITLE}
        actionProps={{
          primary: {
            children: i18n.OVERVIEW_RECORD_ERROR_RETRY,
            onClick: onRetry,
            isLoading: retrying,
            'data-test-subj': DETONATION_INDICATORS_RETRY_TEST_ID,
          },
        }}
        data-test-subj={DETONATION_INDICATORS_ERROR_TEST_ID}
      />
    );
  } else if (state === 'not_read') {
    body = (
      <EuiText size="s" color="subdued" data-test-subj={DETONATION_INDICATORS_NOT_READ_TEST_ID}>
        {i18n.OVERVIEW_INDICATORS_NOT_READ}
      </EuiText>
    );
  } else if (state === 'none') {
    body = (
      <EuiText size="s" color="subdued" data-test-subj={DETONATION_INDICATORS_EMPTY_TEST_ID}>
        {i18n.OVERVIEW_INDICATORS_EMPTY}
      </EuiText>
    );
  } else {
    body = (
      <>
        <EuiBasicTable
          tableCaption={i18n.OVERVIEW_INDICATORS_TITLE}
          items={rows}
          columns={COLUMNS}
          data-test-subj={DETONATION_INDICATORS_TABLE_TEST_ID}
        />
        <EuiFlexGroup gutterSize="s" responsive={false} wrap>
          {canAttachToCase && (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                iconType="casesApp"
                onClick={onAddToCase}
                data-test-subj={DETONATION_INDICATORS_ADD_TO_CASE_TEST_ID}
              >
                {i18n.OVERVIEW_INDICATORS_ADD_TO_CASE}
              </EuiButtonEmpty>
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="s"
              iconType="download"
              onClick={onExportStix}
              data-test-subj={DETONATION_INDICATORS_EXPORT_STIX_TEST_ID}
            >
              {i18n.OVERVIEW_INDICATORS_EXPORT_STIX}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {/* Disabled: the rule needs a drafted rule body and an approval
                step that no client of the managed workflow can supply yet. */}
            <EuiToolTip content={i18n.OVERVIEW_INDICATORS_CREATE_RULE_TOOLTIP}>
              <EuiButtonEmpty
                size="s"
                iconType="plusCircle"
                isDisabled
                data-test-subj={DETONATION_INDICATORS_CREATE_RULE_TEST_ID}
              >
                {i18n.OVERVIEW_INDICATORS_CREATE_RULE}
              </EuiButtonEmpty>
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    );
  }

  return (
    <OverviewSection
      sectionId="indicators"
      title={i18n.OVERVIEW_INDICATORS_TITLE}
      defaultExpanded
      data-test-subj={DETONATION_INDICATORS_TEST_ID}
    >
      {body}
    </OverviewSection>
  );
};
