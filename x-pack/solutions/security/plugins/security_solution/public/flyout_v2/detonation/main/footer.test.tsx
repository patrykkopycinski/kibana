/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { copyToClipboard } from '@elastic/eui';
import { I18nProvider } from '@kbn/i18n-react';
import { AttachmentType } from '@kbn/agent-builder-common/attachments';
import { COMMENT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { DETONATE_DEFAULT_EXEC_WAIT_SECS } from '../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import { useCanAttachToCase } from '../../../cases/attachments/hooks/use_can_attach_to_case';
import { useUserPrivileges } from '../../../common/components/user_privileges';
import { useAppToasts } from '../../../common/hooks/use_app_toasts';
import { useKibana } from '../../../common/lib/kibana';
import { useAgentBuilderAttachment } from '../../../agent_builder/hooks/use_agent_builder_attachment';
import { useAgentBuilderAvailability } from '../../../agent_builder/hooks/use_agent_builder_availability';
import { useDetonationRecord } from '../../../detonate_prototype/hooks/use_detonate';
import * as i18n from '../../../detonate_prototype/translations';
import { BlocklistsApiClient } from '../../../management/pages/blocklist/services';
import { useFlyoutApi } from '../../use_flyout_api';
import { createFlyoutApiMock } from '../../use_flyout_api.mock';
import {
  decodeFlyoutV2UrlParam,
  FLYOUT_V2_URL_PARAM,
} from '../../shared/url_state/flyout_v2_url_param';
import { Footer } from './footer';
import {
  DETONATION_FOOTER_ADD_TO_CASE_TEST_ID,
  DETONATION_FOOTER_BLOCK_CONFIRM_TEST_ID,
  DETONATION_FOOTER_BLOCK_HASH_TEST_ID,
  DETONATION_FOOTER_FAILED_NOTE_TEST_ID,
  DETONATION_FOOTER_RERUN_TEST_ID,
  DETONATION_FOOTER_SHARE_LINK_TEST_ID,
  DETONATION_FOOTER_TAKE_ACTION_TEST_ID,
} from './test_ids';

jest.mock('../../use_flyout_api');
jest.mock('../../../common/components/user_privileges');
jest.mock('../../../common/hooks/use_app_toasts');
jest.mock('../../../common/lib/kibana');
jest.mock('../../../cases/attachments/hooks/use_can_attach_to_case');
jest.mock('../../../agent_builder/hooks/use_agent_builder_attachment');
jest.mock('../../../agent_builder/hooks/use_agent_builder_availability');
jest.mock('../../../agent_builder/hooks/use_report_add_to_chat', () => ({
  useReportAddToChat: () => jest.fn(),
}));
jest.mock('../../../detonate_prototype/hooks/use_detonate');
jest.mock('../../../management/pages/blocklist/services');
jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  copyToClipboard: jest.fn(),
}));
jest.mock('../../../common/lib/kibana/hooks', () => ({
  useAppUrl: () => ({
    getAppUrl: ({ path, absolute }: { path?: string; absolute?: boolean } = {}) =>
      `${absolute ? 'http://localhost:5601' : ''}/app/security/detonate${path ?? ''}`,
  }),
}));

let mockSubmitModalProps: Record<string, unknown> | undefined;
jest.mock('../../../detonate_prototype/components/submit_modal', () => ({
  SubmitModal: (props: Record<string, unknown>) => {
    mockSubmitModalProps = props;
    return <div data-test-subj="mockSubmitModal" />;
  },
}));

const SHA256 = 'a'.repeat(64);

const makeTask = (overrides: Partial<DetonateTask> = {}): DetonateTask =>
  ({
    id: 'task-1',
    created_at: '2026-10-27T10:00:00Z',
    sample_filename: 'invoice.pdf',
    sample_hash: SHA256,
    exec_wait_secs: 300,
    vm_os_family: 'linux',
    production_endpoint_alert_groups: [{ event_code: 'proc-1', alerts_count: 2 }],
    diagnostic_endpoint_alert_groups: [],
    production_detection_alert_groups: [],
    production_endpoint_alerts_count: 2,
    last_worker_name: 'detonate.workers.make_summary',
    last_worker_status: 'success',
    tags: ['alert:doc-7', 'space:default', 'ransomware'],
    ...overrides,
  } as unknown as DetonateTask);

const failedTask = (overrides: Partial<DetonateTask> = {}) =>
  makeTask({
    last_worker_name: 'detonate.workers.start_vm',
    last_worker_status: 'failure',
    production_endpoint_alerts_count: 0,
    production_endpoint_alert_groups: [],
    ...overrides,
  });

// Diagnostic alerts alone are a finished run whose verdict is "inconclusive".
const inconclusiveTask = () =>
  makeTask({
    production_endpoint_alerts_count: 0,
    production_endpoint_alert_groups: [],
    diagnostic_endpoint_alerts_count: 3,
    diagnostic_endpoint_alert_groups: [{ event_code: 'diag-1', alerts_count: 3 }],
  } as Partial<DetonateTask>);

const mockAddSuccess = jest.fn();
const mockAddError = jest.fn();
const mockAddInfo = jest.fn();
const mockAddWarning = jest.fn();
const mockOpenCaseModal = jest.fn();
const mockOpenAgentBuilderFlyout = jest.fn();
const mockCreateBlocklist = jest.fn();

const setup = ({
  canAttachToCase = true,
  canWriteBlocklist = true,
  canManageGlobalArtifacts = true,
  chatAvailable = true,
}: {
  canAttachToCase?: boolean;
  canWriteBlocklist?: boolean;
  canManageGlobalArtifacts?: boolean;
  chatAvailable?: boolean;
} = {}) => {
  jest.mocked(useCanAttachToCase).mockReturnValue(canAttachToCase);
  jest.mocked(useUserPrivileges).mockReturnValue({
    endpointPrivileges: { canWriteBlocklist, canManageGlobalArtifacts },
  } as ReturnType<typeof useUserPrivileges>);
  jest.mocked(useAgentBuilderAvailability).mockReturnValue({
    hasAgentBuilderPrivilege: chatAvailable,
    isAgentChatExperienceEnabled: chatAvailable,
    hasValidAgentBuilderLicense: true,
  } as ReturnType<typeof useAgentBuilderAvailability>);
};

const renderFooter = (task: DetonateTask) =>
  render(
    <I18nProvider>
      <Footer task={task} />
    </I18nProvider>
  );

const openTakeAction = () =>
  fireEvent.click(screen.getByTestId(DETONATION_FOOTER_TAKE_ACTION_TEST_ID));

describe('<Footer />', () => {
  const flyoutApi = createFlyoutApiMock();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitModalProps = undefined;
    jest.mocked(useFlyoutApi).mockReturnValue(flyoutApi);
    jest.mocked(useAppToasts).mockReturnValue({
      addSuccess: mockAddSuccess,
      addError: mockAddError,
      addInfo: mockAddInfo,
      addWarning: mockAddWarning,
    } as unknown as ReturnType<typeof useAppToasts>);
    jest.mocked(useKibana).mockReturnValue({
      services: {
        http: { post: jest.fn() },
        cases: { hooks: { useCasesAddToExistingCaseModal: () => ({ open: mockOpenCaseModal }) } },
      },
    } as unknown as ReturnType<typeof useKibana>);
    jest.mocked(useAgentBuilderAttachment).mockReturnValue({
      openAgentBuilderFlyout: mockOpenAgentBuilderFlyout,
    } as unknown as ReturnType<typeof useAgentBuilderAttachment>);
    jest.mocked(useDetonationRecord).mockReturnValue({
      data: {
        'detonate.iocs.domains': ['evil.example'],
        'detonate.iocs.ips': ['10.0.0.9'],
        'detonate.iocs.file_hashes': [],
      },
    } as unknown as ReturnType<typeof useDetonationRecord>);
    jest.mocked(BlocklistsApiClient.getInstance).mockReturnValue({
      create: mockCreateBlocklist,
    } as unknown as BlocklistsApiClient);
    mockCreateBlocklist.mockResolvedValue({});
    jest.mocked(copyToClipboard).mockReturnValue(true);
    setup();
  });

  describe('re-run', () => {
    it('re-runs a finished run with its own hash, tags, OS and wait', () => {
      renderFooter(makeTask());

      expect(screen.getByTestId(DETONATION_FOOTER_RERUN_TEST_ID)).toHaveTextContent(
        i18n.FOOTER_RERUN
      );
      expect(screen.queryByTestId('mockSubmitModal')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId(DETONATION_FOOTER_RERUN_TEST_ID));

      expect(mockSubmitModalProps).toEqual(
        expect.objectContaining({
          initialHash: SHA256,
          // The space tag is the service's bookkeeping, not something to re-submit.
          initialTags: ['alert:doc-7', 'ransomware'],
          initialOsFamily: 'linux',
          initialExecWaitSecs: 300,
        })
      );
    });

    it.each([
      ['failed', failedTask({ exec_wait_secs: 300 } as Partial<DetonateTask>)],
      ['inconclusive', inconclusiveTask()],
    ])('offers a longer timeout, doubled, for a %s run', (_name, task) => {
      renderFooter(task);

      expect(screen.getByTestId(DETONATION_FOOTER_RERUN_TEST_ID)).toHaveTextContent(
        i18n.FOOTER_RERUN_LONGER_TIMEOUT
      );
      fireEvent.click(screen.getByTestId(DETONATION_FOOTER_RERUN_TEST_ID));
      expect(mockSubmitModalProps).toEqual(expect.objectContaining({ initialExecWaitSecs: 600 }));
    });

    it('never pre-fills a wait above the connector cap', () => {
      renderFooter(failedTask({ exec_wait_secs: 800 } as Partial<DetonateTask>));

      fireEvent.click(screen.getByTestId(DETONATION_FOOTER_RERUN_TEST_ID));
      expect(mockSubmitModalProps).toEqual(expect.objectContaining({ initialExecWaitSecs: 900 }));
    });

    it.each([
      ['0', 0],
      ['missing', undefined],
    ])('doubles the service default when the recorded wait is %s', (_name, wait) => {
      renderFooter(failedTask({ exec_wait_secs: wait } as unknown as Partial<DetonateTask>));

      fireEvent.click(screen.getByTestId(DETONATION_FOOTER_RERUN_TEST_ID));
      expect(mockSubmitModalProps).toEqual(expect.objectContaining({ initialExecWaitSecs: 120 }));
      expect(mockSubmitModalProps?.initialExecWaitSecs).toBeGreaterThan(
        DETONATE_DEFAULT_EXEC_WAIT_SECS
      );
    });

    it('opens the new run in the flyout once it was submitted', () => {
      renderFooter(makeTask());
      fireEvent.click(screen.getByTestId(DETONATION_FOOTER_RERUN_TEST_ID));

      act(() => {
        (mockSubmitModalProps?.onSubmitted as (task: DetonateTask) => void)(
          makeTask({ id: 'task-2' })
        );
      });

      expect(flyoutApi.openDetonationFlyout).toHaveBeenCalledWith({ taskId: 'task-2' });
    });
  });

  describe('failed note', () => {
    it('shows the worker status details of a failed run', () => {
      renderFooter(failedTask({ last_worker_status_details: 'VM never booted' }));

      expect(screen.getByTestId(DETONATION_FOOTER_FAILED_NOTE_TEST_ID)).toHaveTextContent(
        'VM never booted'
      );
    });

    it('falls back to naming the failed step when there are no details', () => {
      renderFooter(failedTask({ last_worker_status_details: undefined }));

      expect(screen.getByTestId(DETONATION_FOOTER_FAILED_NOTE_TEST_ID)).toHaveTextContent(
        i18n.FOOTER_FAILED_NOTE_FALLBACK('Running in the sandbox')
      );
    });

    it('shows no note for a run that did not fail', () => {
      renderFooter(makeTask());

      expect(screen.queryByTestId(DETONATION_FOOTER_FAILED_NOTE_TEST_ID)).not.toBeInTheDocument();
    });
  });

  describe('add to chat', () => {
    it('passes the run record to the assistant when it is available', () => {
      renderFooter(makeTask());

      const { attachmentType, attachmentData } =
        jest.mocked(useAgentBuilderAttachment).mock.calls[0][0];
      expect(attachmentType).toBe(AttachmentType.text);
      expect(JSON.parse((attachmentData as { content: string }).content)).toEqual({
        task_id: 'task-1',
        sha256: SHA256,
        verdict: 'malicious',
        evidence: expect.any(String),
        alerts: {
          total: 2,
          production_endpoint: 2,
          diagnostic_endpoint: 0,
          production_detection: 0,
        },
        indicators_total: 2,
        indicators_truncated: false,
        indicators: [
          { type: 'domain', value: 'evil.example' },
          { type: 'ip', value: '10.0.0.9' },
        ],
      });

      fireEvent.click(screen.getByTestId('newAgentBuilderAttachment'));
      expect(mockOpenAgentBuilderFlyout).toHaveBeenCalledTimes(1);
    });

    it('caps the indicator rows handed to the assistant and says so', () => {
      jest.mocked(useDetonationRecord).mockReturnValue({
        data: {
          'detonate.iocs.domains': Array.from({ length: 150 }, (_, i) => `d${i}.example`),
          'detonate.iocs.ips': [],
          'detonate.iocs.file_hashes': [],
        },
      } as unknown as ReturnType<typeof useDetonationRecord>);
      renderFooter(makeTask());

      const { attachmentData } = jest.mocked(useAgentBuilderAttachment).mock.calls[0][0];
      const payload = JSON.parse((attachmentData as { content: string }).content);
      expect(payload.indicators).toHaveLength(100);
      expect(payload.indicators_total).toBe(150);
      expect(payload.indicators_truncated).toBe(true);
    });

    it('reports the status instead of a verdict for a run that failed', () => {
      renderFooter(failedTask());

      const { attachmentData } = jest.mocked(useAgentBuilderAttachment).mock.calls[0][0];
      expect(JSON.parse((attachmentData as { content: string }).content).verdict).toBe('failed');
    });

    it('is hidden when the assistant is not available', () => {
      setup({ chatAvailable: false });
      renderFooter(makeTask());

      expect(screen.queryByTestId('newAgentBuilderAttachment')).not.toBeInTheDocument();
    });
  });

  describe('take action', () => {
    it('keeps the menu closed until Take action is clicked', () => {
      renderFooter(makeTask());

      expect(screen.queryByTestId(DETONATION_FOOTER_SHARE_LINK_TEST_ID)).not.toBeInTheDocument();
      openTakeAction();
      expect(screen.getByTestId(DETONATION_FOOTER_SHARE_LINK_TEST_ID)).toBeInTheDocument();
    });

    describe('add to case', () => {
      it('attaches the indicators comment to a case', () => {
        renderFooter(makeTask());
        openTakeAction();

        fireEvent.click(screen.getByTestId(DETONATION_FOOTER_ADD_TO_CASE_TEST_ID));

        expect(mockOpenCaseModal).toHaveBeenCalledTimes(1);
        const [{ getAttachments }] = mockOpenCaseModal.mock.calls[0];
        const [attachment] = getAttachments();
        expect(attachment.type).toBe(COMMENT_ATTACHMENT_TYPE);
        expect(attachment.data.content).toContain('task-1');
        expect(attachment.data.content).toContain('evil.example');
      });

      it.each([
        ['not read yet', undefined],
        [
          'empty',
          {
            'detonate.iocs.domains': [],
            'detonate.iocs.ips': [],
            'detonate.iocs.file_hashes': [],
          },
        ],
      ])('is disabled, with the reason, when the indicators are %s', (_name, data) => {
        jest.mocked(useDetonationRecord).mockReturnValue({
          data,
        } as unknown as ReturnType<typeof useDetonationRecord>);
        renderFooter(makeTask());
        openTakeAction();

        const item = screen.getByTestId(DETONATION_FOOTER_ADD_TO_CASE_TEST_ID);
        expect(item).toBeDisabled();
        fireEvent.click(item);
        expect(mockOpenCaseModal).not.toHaveBeenCalled();
      });

      it('shows why Add to case is disabled when there are no indicators', async () => {
        jest.mocked(useDetonationRecord).mockReturnValue({
          data: undefined,
        } as unknown as ReturnType<typeof useDetonationRecord>);
        renderFooter(makeTask());
        openTakeAction();

        fireEvent.mouseOver(screen.getByTestId(DETONATION_FOOTER_ADD_TO_CASE_TEST_ID));
        expect(await screen.findByText(i18n.FOOTER_ADD_TO_CASE_NO_INDICATORS)).toBeInTheDocument();
      });

      it('is hidden when the user cannot attach to a case', () => {
        setup({ canAttachToCase: false });
        renderFooter(makeTask());
        openTakeAction();

        expect(screen.getByTestId(DETONATION_FOOTER_SHARE_LINK_TEST_ID)).toBeInTheDocument();
        expect(screen.queryByTestId(DETONATION_FOOTER_ADD_TO_CASE_TEST_ID)).not.toBeInTheDocument();
      });
    });

    describe('share link', () => {
      it('copies the URL that reopens this run and confirms with a toast', () => {
        renderFooter(makeTask());
        openTakeAction();

        fireEvent.click(screen.getByTestId(DETONATION_FOOTER_SHARE_LINK_TEST_ID));

        expect(copyToClipboard).toHaveBeenCalledTimes(1);
        const url = new URL(jest.mocked(copyToClipboard).mock.calls[0][0]);
        expect(url.pathname).toBe('/app/security/detonate');
        expect(decodeFlyoutV2UrlParam(url.searchParams.get(FLYOUT_V2_URL_PARAM) ?? '')).toEqual([
          { kind: 'detonation', taskId: 'task-1' },
        ]);
        expect(url.origin).toBe('http://localhost:5601');
        expect(mockAddSuccess).toHaveBeenCalledWith(i18n.FOOTER_SHARE_LINK_COPIED);
      });

      it('warns instead of confirming when the clipboard write fails', () => {
        jest.mocked(copyToClipboard).mockReturnValue(false);
        renderFooter(makeTask());
        openTakeAction();

        fireEvent.click(screen.getByTestId(DETONATION_FOOTER_SHARE_LINK_TEST_ID));

        expect(mockAddWarning).toHaveBeenCalledWith(i18n.FOOTER_SHARE_LINK_COPY_FAILED);
        expect(mockAddSuccess).not.toHaveBeenCalled();
      });
    });

    describe('block hash', () => {
      it('is disabled, with the reason, when the user cannot write the blocklist', () => {
        setup({ canWriteBlocklist: false });
        renderFooter(makeTask());
        openTakeAction();

        const item = screen.getByTestId(DETONATION_FOOTER_BLOCK_HASH_TEST_ID);
        expect(item).toBeDisabled();
        fireEvent.click(item);
        expect(
          screen.queryByTestId(DETONATION_FOOTER_BLOCK_CONFIRM_TEST_ID)
        ).not.toBeInTheDocument();
        expect(mockCreateBlocklist).not.toHaveBeenCalled();
      });

      it('is disabled when the user lacks the global artifact privilege', () => {
        setup({ canManageGlobalArtifacts: false });
        renderFooter(makeTask());
        openTakeAction();

        const item = screen.getByTestId(DETONATION_FOOTER_BLOCK_HASH_TEST_ID);
        expect(item).toBeDisabled();
        fireEvent.click(item);
        expect(
          screen.queryByTestId(DETONATION_FOOTER_BLOCK_CONFIRM_TEST_ID)
        ).not.toBeInTheDocument();
        expect(mockCreateBlocklist).not.toHaveBeenCalled();
      });

      it('is disabled when the run has no hash', () => {
        renderFooter(makeTask({ sample_hash: undefined }));
        openTakeAction();

        expect(screen.getByTestId(DETONATION_FOOTER_BLOCK_HASH_TEST_ID)).toBeDisabled();
      });

      it('writes nothing until the confirmation is accepted', () => {
        renderFooter(makeTask());
        openTakeAction();
        fireEvent.click(screen.getByTestId(DETONATION_FOOTER_BLOCK_HASH_TEST_ID));

        expect(screen.getByTestId(DETONATION_FOOTER_BLOCK_CONFIRM_TEST_ID)).toBeInTheDocument();
        expect(mockCreateBlocklist).not.toHaveBeenCalled();

        fireEvent.click(screen.getByTestId('confirmModalCancelButton'));
        expect(mockCreateBlocklist).not.toHaveBeenCalled();
        expect(
          screen.queryByTestId(DETONATION_FOOTER_BLOCK_CONFIRM_TEST_ID)
        ).not.toBeInTheDocument();
      });

      it('names every OS in the confirmation', () => {
        renderFooter(makeTask());
        openTakeAction();
        fireEvent.click(screen.getByTestId(DETONATION_FOOTER_BLOCK_HASH_TEST_ID));

        const body = screen.getByTestId(DETONATION_FOOTER_BLOCK_CONFIRM_TEST_ID);
        expect(body).toHaveTextContent('Windows');
        expect(body).toHaveTextContent('macOS');
        expect(body).toHaveTextContent('Linux');
      });

      it('creates one entry per OS for the sha256 and confirms with one toast', async () => {
        renderFooter(makeTask({ vm_os_family: 'darwin' }));
        openTakeAction();
        fireEvent.click(screen.getByTestId(DETONATION_FOOTER_BLOCK_HASH_TEST_ID));
        fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

        await waitFor(() =>
          expect(mockAddSuccess).toHaveBeenCalledWith(i18n.FOOTER_BLOCK_HASH_SUCCESS)
        );
        expect(mockCreateBlocklist).toHaveBeenCalledTimes(3);
        ['windows', 'linux', 'macos'].forEach((os, index) => {
          expect(mockCreateBlocklist).toHaveBeenNthCalledWith(
            index + 1,
            expect.objectContaining({
              list_id: 'endpoint_blocklists',
              item_id: `detonate-block-${SHA256}-${os}`,
              entries: [
                { field: 'file.hash.*', operator: 'included', type: 'match_any', value: [SHA256] },
              ],
              os_types: [os],
              tags: ['policy:all'],
            })
          );
        });
        expect(mockAddSuccess).toHaveBeenCalledTimes(1);
        expect(
          screen.queryByTestId(DETONATION_FOOTER_BLOCK_CONFIRM_TEST_ID)
        ).not.toBeInTheDocument();
      });

      it('warns, naming the OS, when only some entries could be created', async () => {
        mockCreateBlocklist
          .mockResolvedValueOnce({})
          .mockRejectedValueOnce(new Error('boom'))
          .mockResolvedValueOnce({});
        renderFooter(makeTask());
        openTakeAction();
        fireEvent.click(screen.getByTestId(DETONATION_FOOTER_BLOCK_HASH_TEST_ID));
        fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

        await waitFor(() =>
          expect(mockAddWarning).toHaveBeenCalledWith(i18n.FOOTER_BLOCK_HASH_PARTIAL('Linux'))
        );
        expect(mockAddSuccess).not.toHaveBeenCalled();
        expect(mockAddError).not.toHaveBeenCalled();
      });

      it.each([
        [
          'the status of the response and the body',
          {
            name: 'HttpFetchError',
            response: { status: 409 },
            body: {
              message: `exception list item id: "detonate-block-${SHA256}-windows" already exists`,
              status_code: 409,
            },
          },
        ],
        ['only the status of the response', { response: { status: 409 } }],
        ['only the status_code of the body', { body: { status_code: 409 } }],
      ])('reports that the hash is already blocked on %s', async (_name, conflict) => {
        mockCreateBlocklist.mockRejectedValue(conflict);
        renderFooter(makeTask());
        openTakeAction();
        fireEvent.click(screen.getByTestId(DETONATION_FOOTER_BLOCK_HASH_TEST_ID));
        fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

        await waitFor(() =>
          expect(mockAddInfo).toHaveBeenCalledWith(
            i18n.FOOTER_BLOCK_HASH_ALREADY_BLOCKED('Windows, Linux, macOS')
          )
        );
        expect(mockAddSuccess).not.toHaveBeenCalled();
        expect(mockAddError).not.toHaveBeenCalled();
        expect(mockAddWarning).not.toHaveBeenCalled();
      });

      it('also says which OS was already blocked when another write fails', async () => {
        mockCreateBlocklist
          .mockRejectedValueOnce({ response: { status: 409 } })
          .mockRejectedValueOnce(new Error('boom'))
          .mockResolvedValueOnce({});
        renderFooter(makeTask());
        openTakeAction();
        fireEvent.click(screen.getByTestId(DETONATION_FOOTER_BLOCK_HASH_TEST_ID));
        fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

        await waitFor(() =>
          expect(mockAddWarning).toHaveBeenCalledWith(i18n.FOOTER_BLOCK_HASH_PARTIAL('Linux'))
        );
        expect(mockAddInfo).toHaveBeenCalledWith(i18n.FOOTER_BLOCK_HASH_ALREADY_BLOCKED('Windows'));
        expect(mockAddSuccess).not.toHaveBeenCalled();
        expect(mockAddError).not.toHaveBeenCalled();
      });

      it('reports a failed write on every OS with an error toast', async () => {
        const error = new Error('boom');
        mockCreateBlocklist.mockRejectedValue(error);
        renderFooter(makeTask());
        openTakeAction();
        fireEvent.click(screen.getByTestId(DETONATION_FOOTER_BLOCK_HASH_TEST_ID));
        fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

        await waitFor(() =>
          expect(mockAddError).toHaveBeenCalledWith(error, {
            title: i18n.FOOTER_BLOCK_HASH_ERROR,
            toastMessage: i18n.FOOTER_BLOCK_HASH_PARTIAL('Windows, Linux, macOS'),
          })
        );
        expect(mockAddSuccess).not.toHaveBeenCalled();
      });
    });
  });
});
