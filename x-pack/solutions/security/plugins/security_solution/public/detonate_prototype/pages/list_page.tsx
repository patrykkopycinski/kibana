/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — list page.
 *
 * The submission form and the list of past runs live on the same page: the
 * analyst's next action after submitting is to watch the run, and splitting
 * them would make them navigate to find out what they just started.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  EuiBadge,
  EuiBasicTable,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPageHeader,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import type { EuiBasicTableColumn, Criteria } from '@elastic/eui';
import { KbnWarningCallout } from '@kbn/ui-callout';
import { FormattedRelative } from '@kbn/i18n-react';

import {
  DETONATE_PROTOTYPE_APP_PATH,
  totalDetonationAlerts,
} from '../../../common/detonate_prototype';
import type { DetonateTask } from '../../../common/detonate_prototype';
import { useDetonateHealthcheck, useDetonationTasks } from '../hooks/use_detonate';
import { DetonationStatusBadge } from '../components/detonation_status_badge';
import { SubmitForm } from '../components/submit_form';
import * as i18n from '../translations';

export const LIST_PAGE_TEST_ID = 'detonatePrototypeListPage';
export const RUNS_TABLE_TEST_ID = 'detonatePrototypeRunsTable';
export const SERVICE_UNAVAILABLE_TEST_ID = 'detonatePrototypeServiceUnavailable';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

/** What the analyst recognises a run by, in the order they would look for it. */
const sampleLabel = (task: DetonateTask): string =>
  task.sample_filename ?? task.sample_hash ?? task.sample_url ?? task.id;

const serviceErrorMessage = (error: unknown): string => {
  const body = (error as { body?: { message?: string } } | undefined)?.body;
  return body?.message ?? (error instanceof Error ? error.message : String(error));
};

export const DetonateListPage = React.memo(() => {
  const history = useHistory();
  const { search: locationSearch } = useLocation();
  const [search, setSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  /**
   * The alert action arrives here with the hash it extracted. Reading it from
   * the URL rather than from navigation state means the pre-filled form
   * survives a reload and can be shared with another analyst.
   */
  const prefill = useMemo(() => {
    const params = new URLSearchParams(locationSearch);
    return {
      hash: params.get('sample_hash') ?? undefined,
      tags: params.getAll('tags'),
    };
  }, [locationSearch]);

  const healthcheck = useDetonateHealthcheck();
  const { data, isLoading } = useDetonationTasks({
    ...(search ? { query_string: search } : {}),
    offset: pageIndex * pageSize,
    size: pageSize,
  });

  const goToTask = useCallback(
    (taskId: string) => history.push(`${DETONATE_PROTOTYPE_APP_PATH}/${taskId}`),
    [history]
  );

  const onTableChange = useCallback(({ page }: Criteria<DetonateTask>) => {
    if (page) {
      setPageIndex(page.index);
      setPageSize(page.size);
    }
  }, []);

  const onSearch = useCallback((value: string) => {
    setSearch(value);
    // A new query invalidates the current page number, not just its contents.
    setPageIndex(0);
  }, []);

  const columns: Array<EuiBasicTableColumn<DetonateTask>> = [
    {
      name: i18n.COLUMN_SAMPLE,
      render: (task: DetonateTask) => (
        <EuiLink onClick={() => goToTask(task.id)} data-test-subj={`${RUNS_TABLE_TEST_ID}-link`}>
          {sampleLabel(task)}
        </EuiLink>
      ),
    },
    {
      field: 'created_at',
      name: i18n.COLUMN_SUBMITTED,
      width: '160px',
      render: (createdAt: string) => <FormattedRelative value={new Date(createdAt)} />,
    },
    {
      name: i18n.COLUMN_PROGRESS,
      width: '140px',
      render: (task: DetonateTask) => <DetonationStatusBadge task={task} />,
    },
    {
      name: i18n.COLUMN_ALERTS,
      width: '90px',
      align: 'right',
      render: (task: DetonateTask) => (
        <span data-test-subj={`${RUNS_TABLE_TEST_ID}-alerts`}>{totalDetonationAlerts(task)}</span>
      ),
    },
    {
      field: 'tags',
      name: i18n.COLUMN_TAGS,
      render: (tags: string[]) => (
        <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
          {tags.map((tag) => (
            <EuiFlexItem grow={false} key={tag}>
              <EuiBadge color="hollow">{tag}</EuiBadge>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      ),
    },
  ];

  return (
    <div data-test-subj={LIST_PAGE_TEST_ID}>
      <EuiPageHeader
        pageTitle={i18n.DETONATE_PROTOTYPE}
        description={i18n.DETONATE_PROTOTYPE_DESCRIPTION}
      />
      <EuiSpacer size="l" />

      {healthcheck.isError && (
        <>
          <KbnWarningCallout
            announceOnMount
            title={i18n.SERVICE_UNAVAILABLE_TITLE}
            text={serviceErrorMessage(healthcheck.error)}
            data-test-subj={SERVICE_UNAVAILABLE_TEST_ID}
          />
          <EuiSpacer size="l" />
        </>
      )}

      <SubmitForm
        key={locationSearch}
        initialHash={prefill.hash}
        initialTags={prefill.tags}
        onSubmitted={(task) => goToTask(task.id)}
      />
      <EuiSpacer size="l" />

      <EuiPanel hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="m">
          <EuiFlexItem>
            <EuiText>
              <h2>{i18n.RUNS_TITLE}</h2>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFieldSearch
              placeholder={i18n.RUNS_SEARCH_PLACEHOLDER}
              incremental={false}
              onSearch={onSearch}
              data-test-subj="detonatePrototypeRunsSearch"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />

        <EuiBasicTable
          items={data?.tasks ?? []}
          columns={columns}
          loading={isLoading}
          tableCaption={i18n.RUNS_TITLE}
          tableLayout="auto"
          noItemsMessage={i18n.RUNS_EMPTY}
          data-test-subj={RUNS_TABLE_TEST_ID}
          pagination={{
            pageIndex,
            pageSize,
            totalItemCount: data?.total ?? 0,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
          }}
          onChange={onTableChange}
        />
      </EuiPanel>
    </div>
  );
});
DetonateListPage.displayName = 'DetonateListPage';

// eslint-disable-next-line import/no-default-export
export default DetonateListPage;
