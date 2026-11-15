/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import { getTabsDisplayed } from './tabs';

jest.mock('../../document/main/tabs/table_tab', () => ({
  TableTab: ({ hit }: { hit: { id: string } }) => <div data-test-subj="tableTab">{hit.id}</div>,
}));
jest.mock('../../../detonate_prototype/components/detonation_result', () => ({
  DetonationResult: () => null,
}));
jest.mock('./session_tab', () => ({ SessionTab: () => null }));
jest.mock('../../shared/components/json_tab', () => ({ JsonTab: () => null }));
jest.mock('../../shared/components/cell_actions', () => ({ cellActionRenderer: jest.fn() }));

const task = {
  id: 'task-1',
  created_at: '2026-10-27T10:00:00Z',
  sample_filename: 'invoice.pdf',
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  tags: [],
} as unknown as DetonateTask;

describe('getTabsDisplayed', () => {
  it('lists Overview, Table, Session and JSON in order', () => {
    const tabs = getTabsDisplayed({ taskId: 'task-1', task });

    expect(tabs.map(({ id }) => id)).toEqual(['overview', 'table', 'session', 'json']);
  });

  it('renders the shared Table tab with a record built from the run', () => {
    const tabs = getTabsDisplayed({ taskId: 'task-1', task });
    const table = tabs.find(({ id }) => id === 'table');

    render(<>{table?.content}</>);

    expect(screen.getByTestId('tableTab')).toHaveTextContent('task-1');
  });

  it('shows a spinner in the Table tab until the run has loaded', () => {
    const tabs = getTabsDisplayed({ taskId: 'task-1', task: undefined });
    const table = tabs.find(({ id }) => id === 'table');

    render(<>{table?.content}</>);

    expect(screen.queryByTestId('tableTab')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
