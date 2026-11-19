/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The Overview tab: its sections, their order, and what each says when it has
 * nothing to show.
 */

import { encode } from '@kbn/rison';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';

import type { DetonateTask, DetonationRecord } from '../../../common/detonate_prototype';
import { downloadBlob } from '../../common/utils/download_blob';
import { useCanAttachToCase } from '../../cases/attachments/hooks/use_can_attach_to_case';
import {
  DETONATION_AI_SUMMARY_FALLBACK_TEST_ID,
  DETONATION_AI_SUMMARY_LIMITATIONS_TEST_ID,
  DETONATION_AI_SUMMARY_TEST_ID,
  DETONATION_BEHAVIOR_TEST_ID,
  DETONATION_BEHAVIOR_UNAVAILABLE_TEST_ID,
  DETONATION_HIGHLIGHTED_FIELDS_LIST_TEST_ID,
  DETONATION_HIGHLIGHTED_FIELDS_TEST_ID,
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
  DETONATION_NETWORK_TEST_ID,
  DETONATION_NETWORK_UNAVAILABLE_TEST_ID,
  DETONATION_OVERVIEW_FORK_ONLY_TEST_ID,
  DETONATION_OVERVIEW_QUEUED_NOTE_TEST_ID,
  DETONATION_PROGRESS_AGENT_ID_TEST_ID,
  DETONATION_PROGRESS_DURATION_TEST_ID,
  DETONATION_PROGRESS_TEST_ID,
  DETONATION_PROGRESS_WAITING_TEST_ID,
  DETONATION_RUN_DETAILS_TEST_ID,
  DETONATION_SANDBOX_ALERTS_EMPTY_TEST_ID,
  DETONATION_SANDBOX_ALERTS_TEST_ID,
} from '../../flyout_v2/detonation/main/test_ids';
import {
  useCompletedDetonationHistoryByHash,
  useDetonationRecord,
  useDetonationTask,
  useDetonationTaskUpdates,
} from '../hooks/use_detonate';
import { ProgressSection } from '../../flyout_v2/detonation/main/components/progress_section';
import { SUBMIT_MODAL_LIMITATIONS } from '../translations';
import { useUserPrivileges } from '../../common/components/user_privileges';
import { useNavigateTo } from '../../common/lib/kibana';
import { DETAIL_FAILURE_TEST_ID, DetonationResult } from './detonation_result';

const mockStorageGet = jest.fn();
const mockStorageSet = jest.fn();
const mockOpenCaseModal = jest.fn();
const mockNavigateTo = jest.fn();

jest.mock('../hooks/use_detonate');
jest.mock('../../common/utils/download_blob', () => ({ downloadBlob: jest.fn() }));
jest.mock('../../cases/attachments/hooks/use_can_attach_to_case');
jest.mock('../../common/components/user_privileges');
jest.mock('../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      storage: { get: mockStorageGet, set: mockStorageSet },
      cases: {
        hooks: { useCasesAddToExistingCaseModal: () => ({ open: mockOpenCaseModal }) },
      },
    },
  }),
  useNavigateTo: () => ({ navigateTo: mockNavigateTo }),
}));
jest.mock('../../flyout_v2/document/main/components/document_summary_section', () => ({
  DocumentSummarySection: ({ 'data-test-subj': testSubj }: { 'data-test-subj': string }) => (
    <div data-test-subj={testSubj} />
  ),
}));
jest.mock('./worker_timeline', () => ({
  WorkerTimeline: () => <div data-test-subj="workerTimeline" />,
}));
jest.mock('./run_history', () => ({ RunHistory: () => <div data-test-subj="runHistory" /> }));
jest.mock('./behavior_diff_card', () => ({
  BehaviorDiffCard: () => <div data-test-subj="behaviorDiff" />,
}));
jest.mock('./alert_groups', () => ({
  DetectionAlertGroups: ({ testSubj, total }: { testSubj: string; total?: number }) => (
    <div data-test-subj={testSubj}>
      <span data-test-subj={`${testSubj}-count`}>{total ?? 0}</span>
    </div>
  ),
  EndpointAlertGroups: ({ testSubj, total }: { testSubj: string; total?: number }) => (
    <div data-test-subj={testSubj}>
      <span data-test-subj={`${testSubj}-count`}>{total ?? 0}</span>
    </div>
  ),
}));

const SHA = 'a'.repeat(64);

const createTask = (overrides: Partial<DetonateTask> = {}): DetonateTask => ({
  id: 'task-1',
  created_at: '2026-01-01T00:00:00.000Z',
  tags: [],
  agent_version: '8.0.0',
  telemetry_cluster_version: '8.1.0',
  last_worker_name: 'detonate.workers.make_summary',
  last_worker_status: 'success',
  sample_hash: SHA,
  sample_filename: 'invoice.exe',
  vm_os_family: 'windows',
  vm_architecture: 'aarch64',
  vm_has_internet: true,
  exec_wait_secs: 30,
  pre_exec_commands: [],
  exec_commands: [],
  production_endpoint_alert_groups: [],
  diagnostic_endpoint_alert_groups: [],
  production_detection_alert_groups: [],
  ...overrides,
});

const running = (overrides: Partial<DetonateTask> = {}) =>
  createTask({
    last_worker_name: 'detonate.workers.start_vm',
    last_worker_status: 'started',
    ...overrides,
  });

const queued = (overrides: Partial<DetonateTask> = {}) =>
  createTask({
    last_worker_name: 'detonate.workers.prepare_task_data',
    last_worker_status: 'started',
    ...overrides,
  });

jest.mocked(useUserPrivileges).mockReturnValue({
  rulesPrivileges: { rules: { edit: true } },
} as never);

const renderResult = (
  task: DetonateTask,
  {
    record,
    recordLoading = false,
    recordError = false,
    recordFetching = false,
    refetch = jest.fn(),
  }: {
    record?: Partial<DetonationRecord>;
    recordLoading?: boolean;
    recordError?: boolean;
    recordFetching?: boolean;
    refetch?: jest.Mock;
  } = {}
) => {
  jest.mocked(useDetonationTask).mockReturnValue({ data: task, isLoading: false } as never);
  jest.mocked(useCompletedDetonationHistoryByHash).mockReturnValue({ completedRuns: [] } as never);
  jest.mocked(useDetonationRecord).mockReturnValue({
    data: record,
    isLoading: recordLoading,
    isError: recordError,
    isFetching: recordFetching,
    refetch,
  } as never);
  return render(
    <I18nProvider>
      <DetonationResult taskId={task.id} />
    </I18nProvider>
  );
};

const withIndicators = (): Partial<DetonationRecord> => ({
  'detonate.iocs.domains': ['evil.example'],
  'detonate.iocs.ips': ['10.0.0.1'],
  'detonate.iocs.file_hashes': ['b'.repeat(64)],
});

const expand = (testId: string) => fireEvent.click(screen.getByTestId(`${testId}Header`));

const readBlob = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

describe('DetonationResult overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageGet.mockReturnValue(undefined);
    jest.mocked(useCanAttachToCase).mockReturnValue(true);
    jest.mocked(useUserPrivileges).mockReturnValue({
      rulesPrivileges: { rules: { edit: true } },
    } as never);
    jest
      .mocked(useDetonationTaskUpdates)
      .mockReturnValue({ data: undefined } as ReturnType<typeof useDetonationTaskUpdates>);
  });

  it('lists the sections in the epic order, the fork-only blocks last', () => {
    const { container } = renderResult(createTask(), { record: withIndicators() });

    const expected = [
      DETONATION_AI_SUMMARY_TEST_ID,
      `${DETONATION_PROGRESS_TEST_ID}Header`,
      `${DETONATION_HIGHLIGHTED_FIELDS_TEST_ID}Header`,
      `${DETONATION_SANDBOX_ALERTS_TEST_ID}Header`,
      `${DETONATION_BEHAVIOR_TEST_ID}Header`,
      `${DETONATION_NETWORK_TEST_ID}Header`,
      `${DETONATION_INDICATORS_TEST_ID}Header`,
      `${DETONATION_RUN_DETAILS_TEST_ID}Header`,
      DETONATION_OVERVIEW_FORK_ONLY_TEST_ID,
    ];
    const present = Array.from(container.querySelectorAll('[data-test-subj]')).map((element) =>
      element.getAttribute('data-test-subj')
    );

    expect(present.filter((id) => expected.includes(id as string))).toEqual(expected);
  });

  describe('queued run', () => {
    it('shows the waiting text and one note instead of the later sections', () => {
      renderResult(queued());

      expect(screen.getByTestId(DETONATION_PROGRESS_WAITING_TEST_ID)).toHaveTextContent(
        'Waiting for a VM'
      );
      expect(screen.getByTestId(DETONATION_OVERVIEW_QUEUED_NOTE_TEST_ID)).toBeInTheDocument();
      expect(screen.queryByTestId(`${DETONATION_HIGHLIGHTED_FIELDS_TEST_ID}Header`)).toBeNull();
      expect(screen.queryByTestId(`${DETONATION_SANDBOX_ALERTS_TEST_ID}Header`)).toBeNull();
      expect(screen.queryByTestId(`${DETONATION_INDICATORS_TEST_ID}Header`)).toBeNull();
      expect(screen.queryByTestId(`${DETONATION_RUN_DETAILS_TEST_ID}Header`)).toBeNull();
      expect(screen.queryByTestId(DETONATION_OVERVIEW_FORK_ONLY_TEST_ID)).toBeNull();
    });

    it('treats a run with no worker update yet as queued', () => {
      renderResult(
        queued({ last_worker_name: undefined as never, last_worker_status: undefined as never })
      );

      expect(screen.getByTestId(DETONATION_OVERVIEW_QUEUED_NOTE_TEST_ID)).toBeInTheDocument();
    });

    it('drops the note once the VM is starting', () => {
      renderResult(running());

      expect(screen.queryByTestId(DETONATION_OVERVIEW_QUEUED_NOTE_TEST_ID)).toBeNull();
      expect(screen.queryByTestId(DETONATION_PROGRESS_WAITING_TEST_ID)).toBeNull();
      expect(screen.getByTestId(`${DETONATION_SANDBOX_ALERTS_TEST_ID}Header`)).toBeInTheDocument();
    });
  });

  describe('AI summary', () => {
    it('renders the shared summary and a fallback line from the verdict', () => {
      renderResult(
        createTask({
          production_endpoint_alerts_count: 1,
          production_endpoint_alert_groups: [{ event_code: 'proc-1', alerts_count: 1 }],
        } as Partial<DetonateTask>)
      );

      expect(screen.getByTestId(DETONATION_AI_SUMMARY_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId(DETONATION_AI_SUMMARY_FALLBACK_TEST_ID)).toHaveTextContent(
        /malicious/i
      );
    });

    it('renders a benign fallback line for a finished run with no alerts', () => {
      renderResult(createTask());

      expect(screen.getByTestId(DETONATION_AI_SUMMARY_FALLBACK_TEST_ID)).toHaveTextContent(
        /benign/i
      );
      expect(screen.getByTestId(DETONATION_AI_SUMMARY_FALLBACK_TEST_ID)).not.toHaveTextContent(
        /Detonate: malicious/i
      );
    });

    it('renders an inconclusive fallback line for a run with diagnostic alerts only', () => {
      renderResult(
        createTask({
          diagnostic_endpoint_alerts_count: 3,
          diagnostic_endpoint_alert_groups: [{ event_code: 'diag-1', alerts_count: 3 }],
        } as Partial<DetonateTask>)
      );

      expect(screen.getByTestId(DETONATION_AI_SUMMARY_FALLBACK_TEST_ID)).toHaveTextContent(
        /inconclusive/i
      );
    });

    // Epic #20877 §Copy: the Limitations notice appears in the modal and the inconclusive summary.
    it('shows the Limitations notice for an inconclusive run only', () => {
      renderResult(
        createTask({
          diagnostic_endpoint_alerts_count: 3,
          diagnostic_endpoint_alert_groups: [{ event_code: 'diag-1', alerts_count: 3 }],
        } as Partial<DetonateTask>)
      );

      expect(screen.getByTestId(DETONATION_AI_SUMMARY_LIMITATIONS_TEST_ID)).toHaveTextContent(
        SUBMIT_MODAL_LIMITATIONS
      );
    });

    it('does not show the Limitations notice for a benign run', () => {
      renderResult(createTask());

      expect(screen.queryByTestId(DETONATION_AI_SUMMARY_LIMITATIONS_TEST_ID)).toBeNull();
      expect(document.body).not.toHaveTextContent(SUBMIT_MODAL_LIMITATIONS);
    });

    it('does not show the Limitations notice for a malicious run', () => {
      renderResult(
        createTask({
          production_endpoint_alerts_count: 1,
          production_endpoint_alert_groups: [{ event_code: 'proc-1', alerts_count: 1 }],
        } as Partial<DetonateTask>)
      );

      expect(screen.queryByTestId(DETONATION_AI_SUMMARY_LIMITATIONS_TEST_ID)).toBeNull();
      expect(document.body).not.toHaveTextContent(SUBMIT_MODAL_LIMITATIONS);
    });

    it('still renders a fallback line while the run has no verdict', () => {
      renderResult(running());

      expect(screen.getByTestId(DETONATION_AI_SUMMARY_FALLBACK_TEST_ID)).not.toBeEmptyDOMElement();
    });
  });

  describe('Detonation progress', () => {
    it('is open while the run is going and shows the sandbox agent id once the VM started', () => {
      renderResult(running({ elastic_agent_id: 'agent-123' }));

      expect(screen.getByTestId('workerTimeline')).toBeInTheDocument();
      expect(screen.getByTestId(DETONATION_PROGRESS_AGENT_ID_TEST_ID)).toHaveTextContent(
        'agent-123'
      );
    });

    it('stays open while the run is going even when storage holds a folded state', () => {
      mockStorageGet.mockReturnValue({ progress: false });
      renderResult(running());

      expect(screen.getByTestId('workerTimeline')).toBeInTheDocument();
    });

    it('hides the agent id before the VM has started', () => {
      renderResult(queued({ elastic_agent_id: 'agent-123' }));

      expect(screen.queryByTestId(DETONATION_PROGRESS_AGENT_ID_TEST_ID)).toBeNull();
    });

    it('is folded once the run is over and carries the run time in its header', () => {
      jest.mocked(useDetonationTaskUpdates).mockReturnValue({
        data: [{ timestamp: '2026-01-01T00:02:05.000Z' }],
      } as ReturnType<typeof useDetonationTaskUpdates>);
      renderResult(createTask());

      expect(screen.queryByTestId('workerTimeline')).toBeNull();
      expect(screen.getByTestId(DETONATION_PROGRESS_DURATION_TEST_ID)).toHaveTextContent('2m 05s');
    });

    it('folds when the run goes from running to complete', () => {
      const view = render(
        <I18nProvider>
          <ProgressSection task={running()} />
        </I18nProvider>
      );
      expect(screen.getByTestId('workerTimeline')).toBeInTheDocument();

      view.rerender(
        <I18nProvider>
          <ProgressSection task={createTask()} />
        </I18nProvider>
      );

      expect(screen.queryByTestId('workerTimeline')).toBeNull();
    });
  });

  describe('Highlighted fields', () => {
    it('lists the file, the sandbox and the indicators of a finished run', () => {
      renderResult(createTask({ elastic_agent_id: 'agent-123' }), { record: withIndicators() });

      const list = screen.getByTestId(DETONATION_HIGHLIGHTED_FIELDS_LIST_TEST_ID);
      expect(list).toHaveTextContent(SHA);
      expect(list).toHaveTextContent('invoice.exe');
      expect(list).toHaveTextContent('windows');
      expect(list).toHaveTextContent('aarch64');
      expect(list).toHaveTextContent('agent-123');
      expect(list).toHaveTextContent('evil.example');
      expect(list).toHaveTextContent('10.0.0.1');
    });

    it('leaves the sandbox agent id empty before the VM has started', () => {
      // Task preparation is done but the VM was not asked for yet, so the run is not queued.
      renderResult(queued({ last_worker_status: 'success', elastic_agent_id: 'agent-123' }));

      expect(screen.getByTestId(DETONATION_HIGHLIGHTED_FIELDS_LIST_TEST_ID)).not.toHaveTextContent(
        'agent-123'
      );
    });

    it('says the indicators wait for the run while it is going', () => {
      renderResult(running());

      expect(screen.getByTestId(DETONATION_HIGHLIGHTED_FIELDS_LIST_TEST_ID)).toHaveTextContent(
        'when the run completes'
      );
    });

    it('says the indicators could not be read when reading the record failed', () => {
      renderResult(createTask(), { recordError: true });

      const list = screen.getByTestId(DETONATION_HIGHLIGHTED_FIELDS_LIST_TEST_ID);
      expect(list).toHaveTextContent('Could not be read');
      expect(list).not.toHaveTextContent('not read: no alert');
    });

    it('says the indicators were not read when the record has none', () => {
      renderResult(createTask(), { record: {} });

      expect(screen.getByTestId(DETONATION_HIGHLIGHTED_FIELDS_LIST_TEST_ID)).toHaveTextContent(
        'Not read'
      );
    });
  });

  describe('Sandbox alerts', () => {
    it('keeps the count test ids the live spec reads', () => {
      renderResult(
        createTask({
          production_endpoint_alerts_count: 3,
          production_detection_alerts_count: 2,
        } as Partial<DetonateTask>)
      );

      expect(
        screen.getByTestId('detonatePrototypeProductionEndpointAlerts-count')
      ).toHaveTextContent('3');
      expect(
        screen.getByTestId('detonatePrototypeProductionDetectionAlerts-count')
      ).toHaveTextContent('2');
      expect(screen.queryByTestId(DETONATION_SANDBOX_ALERTS_EMPTY_TEST_ID)).toBeNull();
    });

    it('says alerts may still arrive while the run is going', () => {
      renderResult(running());

      expect(screen.getByTestId(DETONATION_SANDBOX_ALERTS_EMPTY_TEST_ID)).toHaveTextContent(
        /No alerts yet/
      );
    });

    // Epic #20877 §Copy: the response statement is not shown; pending product answer (P-14).
    it('does not show the "We observed {N} sandbox SIEM alerts" statement (pending product answer)', () => {
      renderResult(
        createTask({
          production_endpoint_alerts_count: 3,
          production_detection_alerts_count: 2,
        } as Partial<DetonateTask>)
      );

      expect(document.body).not.toHaveTextContent(/We observed/);
    });

    it('says the sandbox raised none once the run is over', () => {
      renderResult(createTask());

      expect(screen.getByTestId(DETONATION_SANDBOX_ALERTS_EMPTY_TEST_ID)).toHaveTextContent(
        'The sandbox raised no alerts for this run.'
      );
    });
  });

  describe('Behavior and Network', () => {
    it('both say they are not available yet', () => {
      renderResult(createTask());
      expand(DETONATION_BEHAVIOR_TEST_ID);
      expand(DETONATION_NETWORK_TEST_ID);

      expect(screen.getByTestId(DETONATION_BEHAVIOR_UNAVAILABLE_TEST_ID)).toHaveTextContent(
        'Not available yet'
      );
      expect(screen.getByTestId(DETONATION_NETWORK_UNAVAILABLE_TEST_ID)).toHaveTextContent(
        'Not available yet'
      );
    });
  });

  describe('Indicators', () => {
    it('waits for the record while the run is going', () => {
      renderResult(running());

      expect(screen.getByTestId(DETONATION_INDICATORS_PENDING_TEST_ID)).toBeInTheDocument();
    });

    it('waits while the record of a finished run is loading', () => {
      renderResult(createTask(), { recordLoading: true });

      expect(screen.getByTestId(DETONATION_INDICATORS_PENDING_TEST_ID)).toBeInTheDocument();
    });

    it('shows an error with a retry, not "not read", when the record could not be read', () => {
      const refetch = jest.fn();
      renderResult(createTask(), { recordError: true, refetch });

      expect(screen.getByTestId(DETONATION_INDICATORS_ERROR_TEST_ID)).toBeInTheDocument();
      expect(screen.queryByTestId(DETONATION_INDICATORS_NOT_READ_TEST_ID)).toBeNull();

      fireEvent.click(screen.getByTestId(DETONATION_INDICATORS_RETRY_TEST_ID));
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(refetch).toHaveBeenCalledWith();
    });

    it('disables the retry and shows it loading while the record is refetching', () => {
      renderResult(createTask(), { recordError: true, recordFetching: true });

      const retry = screen.getByTestId(DETONATION_INDICATORS_RETRY_TEST_ID);
      expect(retry).toBeDisabled();
      expect(retry.querySelector('.euiLoadingSpinner')).not.toBeNull();
    });

    it('says "not read" when the record has no indicator arrays', () => {
      renderResult(createTask(), { record: {} });

      expect(screen.getByTestId(DETONATION_INDICATORS_NOT_READ_TEST_ID)).toBeInTheDocument();
      expect(screen.queryByTestId(DETONATION_INDICATORS_EMPTY_TEST_ID)).toBeNull();
    });

    it('says "none" when the arrays are present and empty', () => {
      renderResult(createTask(), {
        record: {
          'detonate.iocs.domains': [],
          'detonate.iocs.ips': [],
          'detonate.iocs.file_hashes': [],
        },
      });

      expect(screen.getByTestId(DETONATION_INDICATORS_EMPTY_TEST_ID)).toBeInTheDocument();
      expect(screen.queryByTestId(DETONATION_INDICATORS_NOT_READ_TEST_ID)).toBeNull();
    });

    it('lists type and value for each indicator', () => {
      renderResult(createTask(), { record: withIndicators() });

      const table = screen.getByTestId(DETONATION_INDICATORS_TABLE_TEST_ID);
      expect(table).toHaveTextContent('evil.example');
      expect(table).toHaveTextContent('10.0.0.1');
      expect(table).toHaveTextContent('b'.repeat(64));
    });

    it('downloads a STIX bundle named after the run', async () => {
      renderResult(createTask(), { record: withIndicators() });
      fireEvent.click(screen.getByTestId(DETONATION_INDICATORS_EXPORT_STIX_TEST_ID));

      expect(downloadBlob).toHaveBeenCalledTimes(1);
      const [blob, filename] = jest.mocked(downloadBlob).mock.calls[0];
      expect(filename).toBe('detonation-task-1-indicators.stix.json');
      const bundle = JSON.parse(await readBlob(blob));
      expect(bundle.type).toBe('bundle');
      expect(bundle.objects.map((object: { pattern: string }) => object.pattern)).toContain(
        "[domain-name:value = 'evil.example']"
      );
    });

    it('disables the STIX export when no indicator can be expressed in STIX', () => {
      renderResult(createTask(), { record: { 'detonate.iocs.file_hashes': ['abc123'] } });

      const button = screen.getByTestId(DETONATION_INDICATORS_EXPORT_STIX_TEST_ID);
      expect(screen.getByTestId(DETONATION_INDICATORS_TABLE_TEST_ID)).toHaveTextContent('abc123');
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(downloadBlob).not.toHaveBeenCalled();
    });

    it('opens the add-to-case modal with one comment listing the indicators', () => {
      renderResult(createTask(), { record: withIndicators() });
      fireEvent.click(screen.getByTestId(DETONATION_INDICATORS_ADD_TO_CASE_TEST_ID));

      expect(mockOpenCaseModal).toHaveBeenCalledTimes(1);
      const { getAttachments } = mockOpenCaseModal.mock.calls[0][0];
      const [attachment] = getAttachments();
      expect(attachment.data.content).toContain('evil.example');
      expect(attachment.data.content).toContain('task-1');
    });

    it('hides add to case without cases permission', () => {
      jest.mocked(useCanAttachToCase).mockReturnValue(false);
      renderResult(createTask(), { record: withIndicators() });

      expect(screen.queryByTestId(DETONATION_INDICATORS_ADD_TO_CASE_TEST_ID)).toBeNull();
      expect(screen.getByTestId(DETONATION_INDICATORS_EXPORT_STIX_TEST_ID)).toBeInTheDocument();
    });

    it('navigates to rule creation and is disabled without rule-create privilege', () => {
      const { unmount } = renderResult(createTask(), { record: withIndicators() });

      fireEvent.click(screen.getByTestId(DETONATION_INDICATORS_CREATE_RULE_TEST_ID));
      expect(useNavigateTo().navigateTo).toHaveBeenCalledWith({
        deepLinkId: 'rules-create',
        path: `?createRuleFromDetonation=${encode({
          indicators: [
            { type: 'domain', value: 'evil.example' },
            { type: 'ip', value: '10.0.0.1' },
            { type: 'file_hash', value: 'b'.repeat(64) },
          ],
        })}`,
      });

      unmount();
      jest.mocked(useUserPrivileges).mockReturnValue({
        rulesPrivileges: { rules: { edit: false } },
      } as never);
      renderResult(createTask(), { record: withIndicators() });
      const button = screen.getByTestId(DETONATION_INDICATORS_CREATE_RULE_TEST_ID);
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(useNavigateTo().navigateTo).not.toHaveBeenCalledTimes(2);
    });
  });

  describe('Run details', () => {
    it('lists the run, its environment and its tags', () => {
      renderResult(createTask({ tags: ['alert:abc'], sample_source: 'malwarebazaar' }));
      expand(DETONATION_RUN_DETAILS_TEST_ID);

      const details = screen.getByTestId('detonatePrototypeDetails');
      expect(details).toHaveTextContent('task-1');
      expect(details).toHaveTextContent(SHA);
      expect(details).toHaveTextContent('windows · aarch64 · ');
      expect(details).toHaveTextContent('8.0.0');
      expect(details).toHaveTextContent('8.1.0');
      expect(details).toHaveTextContent('malwarebazaar');
      expect(details).toHaveTextContent('alert:abc');
    });

    it('does not list the space tag', () => {
      renderResult(createTask({ tags: ['space:default', 'alert:abc'] }));
      expand(DETONATION_RUN_DETAILS_TEST_ID);

      const details = screen.getByTestId('detonatePrototypeDetails');
      expect(details).toHaveTextContent('alert:abc');
      expect(details).not.toHaveTextContent('space:default');
    });

    it('leaves out the architecture when the run has none', () => {
      renderResult(createTask({ vm_architecture: undefined }));
      expand(DETONATION_RUN_DETAILS_TEST_ID);

      expect(screen.getByTestId('detonatePrototypeDetails')).not.toHaveTextContent('aarch64');
      expect(screen.getByTestId('detonatePrototypeDetails')).toHaveTextContent('windows');
    });

    it('prefers the source and submitter of the stored record', () => {
      renderResult(createTask({ sample_source: 'malwarebazaar' }), {
        record: { 'detonate.source': 'workflow', 'detonate.submitter': 'analyst-1' },
      });
      expand(DETONATION_RUN_DETAILS_TEST_ID);

      const details = screen.getByTestId('detonatePrototypeDetails');
      expect(details).toHaveTextContent('workflow');
      expect(details).toHaveTextContent('analyst-1');
    });
  });

  describe('failure and fork-only blocks', () => {
    it('keeps the failure callout above the sections', () => {
      renderResult(
        createTask({
          last_worker_name: 'detonate.workers.start_vm',
          last_worker_status: 'failure',
          last_worker_status_details: 'no capacity',
        })
      );

      const callout = screen.getByTestId(DETAIL_FAILURE_TEST_ID);
      expect(callout).toHaveTextContent('no capacity');
      const summary = screen.getByTestId(DETONATION_AI_SUMMARY_TEST_ID);
      expect(callout.compareDocumentPosition(summary)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('shows run history and the behaviour diff after the sections for a finished run', () => {
      renderResult(createTask());

      const forkOnly = screen.getByTestId(DETONATION_OVERVIEW_FORK_ONLY_TEST_ID);
      expect(forkOnly).toContainElement(screen.getByTestId('runHistory'));
      expect(forkOnly).toContainElement(screen.getByTestId('behaviorDiff'));
    });
  });
});
