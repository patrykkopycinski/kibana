/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { DetonateTask, DetonationRecord } from '../../../../../common/detonate_prototype';
import { useKibana } from '../../../../common/lib/kibana';
import {
  DETONATION_RUN_DETAILS_CONVERSATION_LINK_TEST_ID,
  DETONATION_RUN_DETAILS_TEST_ID,
  DETONATION_RUN_DETAILS_WORKFLOW_LINK_TEST_ID,
} from '../test_ids';
import { RunDetailsSection } from './run_details_section';

jest.mock('../../../../common/lib/kibana');

const defaultGetUrlForApp = (appId: string, { path }: { path: string }) => `/app/${appId}${path}`;
const getUrlForApp = jest.fn(defaultGetUrlForApp);

const task = {
  id: 'task-1',
  sample_hash: 'a'.repeat(64),
  vm_os_family: 'windows',
  vm_has_internet: false,
  tags: [],
  agent_version: '8.0.0',
  telemetry_cluster_version: '8.1.0',
  created_at: '2026-01-01T00:00:00.000Z',
} as unknown as DetonateTask;

const renderSection = (record?: Partial<DetonationRecord>) => {
  render(
    <I18nProvider>
      <RunDetailsSection task={task} record={record as DetonationRecord | undefined} />
    </I18nProvider>
  );
  fireEvent.click(screen.getByTestId(`${DETONATION_RUN_DETAILS_TEST_ID}Header`));
};

describe('<RunDetailsSection />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks keeps implementations, so a throwing one would leak into later tests.
    getUrlForApp.mockImplementation(defaultGetUrlForApp);
    jest.mocked(useKibana).mockReturnValue({
      services: {
        application: { getUrlForApp },
        storage: { get: jest.fn(() => undefined), set: jest.fn() },
      },
    } as unknown as ReturnType<typeof useKibana>);
  });

  it('links the workflow execution when the record has the workflow and execution ids', () => {
    renderSection({
      'detonate.workflow.id': 'wf 1',
      'detonate.workflow.execution_id': 'exec-1',
    });

    expect(screen.getByTestId(DETONATION_RUN_DETAILS_WORKFLOW_LINK_TEST_ID)).toHaveAttribute(
      'href',
      '/app/workflows/wf%201?tab=executions&executionId=exec-1'
    );
  });

  it('shows the plain execution id when the record has no workflow id', () => {
    renderSection({ 'detonate.workflow.execution_id': 'exec-1' });

    expect(screen.queryByTestId(DETONATION_RUN_DETAILS_WORKFLOW_LINK_TEST_ID)).toBeNull();
    expect(screen.getByTestId('detonatePrototypeDetails')).toHaveTextContent('exec-1');
  });

  it('links the conversation through the Agent Builder app', () => {
    renderSection({ 'detonate.conversation_id': 'conv/1' });

    expect(screen.getByTestId(DETONATION_RUN_DETAILS_CONVERSATION_LINK_TEST_ID)).toHaveAttribute(
      'href',
      '/app/agent_builder/conversations/conv%2F1'
    );
  });

  it('shows the plain ids when the target app is not registered', () => {
    getUrlForApp.mockImplementation(() => {
      throw new Error('unknown app');
    });
    renderSection({
      'detonate.workflow.id': 'wf-1',
      'detonate.workflow.execution_id': 'exec-1',
      'detonate.conversation_id': 'conv-1',
    });

    expect(screen.queryByTestId(DETONATION_RUN_DETAILS_WORKFLOW_LINK_TEST_ID)).toBeNull();
    expect(screen.queryByTestId(DETONATION_RUN_DETAILS_CONVERSATION_LINK_TEST_ID)).toBeNull();
    expect(screen.getByTestId('detonatePrototypeDetails')).toHaveTextContent('exec-1');
    expect(screen.getByTestId('detonatePrototypeDetails')).toHaveTextContent('conv-1');
  });

  it('lists no workflow or conversation rows for a run without them', () => {
    renderSection();

    expect(screen.getByTestId('detonatePrototypeDetails')).not.toHaveTextContent('Workflow run');
    expect(screen.getByTestId('detonatePrototypeDetails')).not.toHaveTextContent('Conversation');
  });
});
