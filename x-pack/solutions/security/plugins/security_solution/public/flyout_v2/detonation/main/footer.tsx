/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  copyToClipboard,
  EuiButton,
  EuiConfirmModal,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiText,
} from '@elastic/eui';
import { AttachmentType } from '@kbn/agent-builder-common/attachments';
import { COMMENT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import type { CreateExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import {
  DETONATE_MAX_EXEC_WAIT_SECS,
  SPACE_TAG_PREFIX,
  deriveDetonateVerdict,
  isDetonationComplete,
  isDetonationFailed,
} from '../../../../common/detonate_prototype';
import type { DetonateTask, DetonateVmOsFamily } from '../../../../common/detonate_prototype';
import { SecurityPageName } from '../../../../common/constants';
import { useCanAttachToCase } from '../../../cases/attachments/hooks/use_can_attach_to_case';
import { useUserPrivileges } from '../../../common/components/user_privileges';
import { useAppToasts } from '../../../common/hooks/use_app_toasts';
import { useKibana } from '../../../common/lib/kibana';
import { useAppUrl } from '../../../common/lib/kibana/hooks';
import { NewAgentBuilderAttachment } from '../../../agent_builder/components/new_agent_builder_attachment';
import { useAgentBuilderAttachment } from '../../../agent_builder/hooks/use_agent_builder_attachment';
import { useAgentBuilderAvailability } from '../../../agent_builder/hooks/use_agent_builder_availability';
import { SubmitModal } from '../../../detonate_prototype/components/submit_modal';
import { useDetonationRecord } from '../../../detonate_prototype/hooks/use_detonate';
import * as i18n from '../../../detonate_prototype/translations';
import { BlocklistsApiClient } from '../../../management/pages/blocklist/services';
import { useFlyoutApi } from '../../use_flyout_api';
import {
  encodeFlyoutV2UrlParam,
  FLYOUT_V2_URL_PARAM,
} from '../../shared/url_state/flyout_v2_url_param';
import { buildIndicatorsComment, getDetonationIndicators } from './utils/detonation_indicators';
import {
  DETONATION_FOOTER_ADD_TO_CASE_TEST_ID,
  DETONATION_FOOTER_BLOCK_CONFIRM_TEST_ID,
  DETONATION_FOOTER_BLOCK_HASH_TEST_ID,
  DETONATION_FOOTER_FAILED_NOTE_TEST_ID,
  DETONATION_FOOTER_RERUN_TEST_ID,
  DETONATION_FOOTER_SHARE_LINK_TEST_ID,
  DETONATION_FOOTER_TAKE_ACTION_TEST_ID,
  DETONATION_FOOTER_TEST_ID,
} from './test_ids';

/** The blocklist artifact is compiled per OS; the sandbox's `darwin` is the artifact's `macos`. */
const BLOCKLIST_OS_BY_VM_OS: Readonly<Record<DetonateVmOsFamily, 'linux' | 'windows' | 'macos'>> = {
  linux: 'linux',
  windows: 'windows',
  darwin: 'macos',
};

export interface FooterProps {
  /**
   * The detonation run the flyout shows.
   */
  task: DetonateTask;
}

/**
 * Footer of the detonation result flyout: Add to chat, Re-run and a Take action menu.
 *
 * Not built here, on purpose:
 * - "View VM logs": the submit/task contract has no VM log source to link to.
 * - The partial-telemetry link on a failed run: the task's telemetry metadata has no public
 *   fetch, and adding a server route is out of scope for this footer.
 * - The prevalence lookup and the evasion-check list: they belong to later phases.
 */
export const Footer = memo(({ task }: FooterProps) => {
  const { http, cases } = useKibana().services;
  const { addSuccess, addError } = useAppToasts();
  const { getAppUrl } = useAppUrl();
  const { openDetonationFlyout } = useFlyoutApi();
  const canAttachToCase = useCanAttachToCase();
  const { endpointPrivileges } = useUserPrivileges();
  const canWriteBlocklist = Boolean(endpointPrivileges?.canWriteBlocklist);
  const { isAgentChatExperienceEnabled } = useAgentBuilderAvailability();

  const taskId = task.id;
  const complete = isDetonationComplete(task);
  const failed = isDetonationFailed(task);
  const conclusion = useMemo(() => deriveDetonateVerdict(task), [task]);
  const inconclusive = conclusion.status === 'complete' && conclusion.verdict === 'inconclusive';
  const needsLongerTimeout = failed || inconclusive;

  const { data: record } = useDetonationRecord(taskId, complete);
  const indicators = useMemo(() => getDetonationIndicators(record), [record]);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isRerunOpen, setIsRerunOpen] = useState(false);
  const [isBlockConfirmOpen, setIsBlockConfirmOpen] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);

  const closePopover = useCallback(() => setIsPopoverOpen(false), []);
  const togglePopover = useCallback(() => setIsPopoverOpen((open) => !open), []);

  // Add to chat. The assistant has no detonation attachment type, so the run goes in as text.
  const chatContent = useMemo(
    () =>
      JSON.stringify({
        task_id: taskId,
        sha256: task.sample_hash,
        verdict: conclusion.status === 'complete' ? conclusion.verdict : conclusion.status,
        evidence: conclusion.evidence,
        alerts: {
          total: conclusion.total_alerts_count,
          production_endpoint: task.production_endpoint_alerts_count ?? 0,
          diagnostic_endpoint: task.diagnostic_endpoint_alerts_count ?? 0,
          production_detection: task.production_detection_alerts_count ?? 0,
        },
        indicators: indicators.rows,
      }),
    [taskId, task, conclusion, indicators.rows]
  );
  const { openAgentBuilderFlyout } = useAgentBuilderAttachment({
    attachmentType: AttachmentType.text,
    attachmentData: { content: chatContent },
    attachmentPrompt: i18n.FOOTER_ADD_TO_CHAT_PROMPT,
    attachmentDescription: i18n.FOOTER_ADD_TO_CHAT_DESCRIPTION(taskId),
  });

  // Re-run. A failed or inconclusive run is most often a timeout, so the pre-filled wait is
  // doubled; the cap is the connector's, so the form never offers a wait it would clamp.
  const rerunInitialTags = useMemo(
    () => task.tags.filter((tag) => !tag.startsWith(SPACE_TAG_PREFIX)),
    [task.tags]
  );
  const rerunExecWaitSecs = needsLongerTimeout
    ? Math.min(task.exec_wait_secs * 2, DETONATE_MAX_EXEC_WAIT_SECS)
    : task.exec_wait_secs;
  const closeRerun = useCallback(() => setIsRerunOpen(false), []);
  const openRun = useCallback(
    (id: string) => {
      setIsRerunOpen(false);
      openDetonationFlyout({ taskId: id });
    },
    [openDetonationFlyout]
  );
  const onRerunSubmitted = useCallback((newTask: DetonateTask) => openRun(newTask.id), [openRun]);

  // Add to case: the same path and permission gate as the indicators section.
  const caseModal = cases.hooks.useCasesAddToExistingCaseModal({
    onClose: () => {},
    onSuccess: () => {},
  });
  const onAddToCase = useCallback(() => {
    closePopover();
    caseModal.open({
      getAttachments: () => [
        {
          type: COMMENT_ATTACHMENT_TYPE,
          data: { content: buildIndicatorsComment(taskId, indicators.rows) },
        },
      ],
    });
  }, [caseModal, closePopover, taskId, indicators.rows]);

  // Share link: the app home restores the flyout from this URL param.
  const onShareLink = useCallback(() => {
    closePopover();
    const params = new URLSearchParams();
    params.set(FLYOUT_V2_URL_PARAM, encodeFlyoutV2UrlParam([{ kind: 'detonation', taskId }]));
    const path = getAppUrl({
      deepLinkId: SecurityPageName.detonatePrototype,
      path: `?${params.toString()}`,
    });
    copyToClipboard(`${window.location.origin}${path}`);
    addSuccess(i18n.FOOTER_SHARE_LINK_COPIED);
  }, [addSuccess, closePopover, getAppUrl, taskId]);

  // Block hash: needs the blocklist write privilege and an explicit confirmation.
  const hash = task.sample_hash ?? '';
  const blockDisabledReason = !canWriteBlocklist
    ? i18n.FOOTER_BLOCK_HASH_NO_PRIVILEGE
    : !hash
    ? i18n.FOOTER_BLOCK_HASH_NO_HASH
    : undefined;
  const onBlockHash = useCallback(() => {
    closePopover();
    setIsBlockConfirmOpen(true);
  }, [closePopover]);
  const closeBlockConfirm = useCallback(() => setIsBlockConfirmOpen(false), []);
  const confirmBlockHash = useCallback(async () => {
    setIsBlocking(true);
    try {
      const item = {
        description: i18n.FOOTER_BLOCK_HASH_DESCRIPTION(taskId),
        entries: [
          {
            field: 'file.hash.*',
            operator: 'included',
            type: 'match_any',
            value: [hash],
          },
        ],
        list_id: 'endpoint_blocklists',
        name: i18n.FOOTER_BLOCK_HASH_NAME(hash),
        namespace_type: 'agnostic',
        os_types: [BLOCKLIST_OS_BY_VM_OS[task.vm_os_family ?? 'windows']],
        tags: ['policy:all'],
        type: 'simple',
      } as unknown as CreateExceptionListItemSchema;
      await BlocklistsApiClient.getInstance(http).create(item);
      addSuccess(i18n.FOOTER_BLOCK_HASH_SUCCESS);
    } catch (error) {
      addError(error instanceof Error ? error : new Error(String(error)), {
        title: i18n.FOOTER_BLOCK_HASH_ERROR,
      });
    } finally {
      setIsBlocking(false);
      setIsBlockConfirmOpen(false);
    }
  }, [addError, addSuccess, hash, http, task.vm_os_family, taskId]);

  const menuItems = useMemo(() => {
    const items = [];
    if (canAttachToCase) {
      items.push(
        <EuiContextMenuItem
          key="addToCase"
          icon="casesApp"
          onClick={onAddToCase}
          data-test-subj={DETONATION_FOOTER_ADD_TO_CASE_TEST_ID}
        >
          {i18n.FOOTER_ADD_TO_CASE}
        </EuiContextMenuItem>
      );
    }
    items.push(
      <EuiContextMenuItem
        key="shareLink"
        icon="link"
        onClick={onShareLink}
        data-test-subj={DETONATION_FOOTER_SHARE_LINK_TEST_ID}
      >
        {i18n.FOOTER_SHARE_LINK}
      </EuiContextMenuItem>,
      <EuiContextMenuItem
        key="blockHash"
        icon="crossInCircle"
        disabled={Boolean(blockDisabledReason)}
        toolTipContent={blockDisabledReason}
        onClick={onBlockHash}
        data-test-subj={DETONATION_FOOTER_BLOCK_HASH_TEST_ID}
      >
        {i18n.FOOTER_BLOCK_HASH}
      </EuiContextMenuItem>
    );
    return items;
  }, [blockDisabledReason, canAttachToCase, onAddToCase, onBlockHash, onShareLink]);

  const takeActionButton = (
    <EuiButton
      fill
      iconType="chevronSingleDown"
      iconSide="right"
      onClick={togglePopover}
      data-test-subj={DETONATION_FOOTER_TAKE_ACTION_TEST_ID}
    >
      {i18n.FOOTER_TAKE_ACTION}
    </EuiButton>
  );

  return (
    <>
      <EuiFlexGroup
        justifyContent="flexEnd"
        alignItems="center"
        data-test-subj={DETONATION_FOOTER_TEST_ID}
      >
        {failed && (
          <EuiFlexItem data-test-subj={DETONATION_FOOTER_FAILED_NOTE_TEST_ID}>
            <EuiText size="s" color="danger">
              {task.last_worker_status_details ||
                i18n.FOOTER_FAILED_NOTE_FALLBACK(task.last_worker_name)}
            </EuiText>
          </EuiFlexItem>
        )}
        {isAgentChatExperienceEnabled && (
          // No `telemetry`: the add-to-chat pathway union has no detonation value to report.
          <EuiFlexItem grow={false}>
            <NewAgentBuilderAttachment onClick={openAgentBuilderFlyout} />
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiButton
            onClick={() => setIsRerunOpen(true)}
            data-test-subj={DETONATION_FOOTER_RERUN_TEST_ID}
          >
            {needsLongerTimeout ? i18n.FOOTER_RERUN_LONGER_TIMEOUT : i18n.FOOTER_RERUN}
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiPopover
            id="DetonationFlyoutTakeActionPanel"
            aria-label={i18n.FOOTER_TAKE_ACTION}
            button={takeActionButton}
            isOpen={isPopoverOpen}
            closePopover={closePopover}
            panelPaddingSize="none"
            anchorPosition="downLeft"
            repositionOnScroll
          >
            <EuiContextMenuPanel items={menuItems} />
          </EuiPopover>
        </EuiFlexItem>
      </EuiFlexGroup>
      {isRerunOpen && (
        <SubmitModal
          initialHash={task.sample_hash}
          initialTags={rerunInitialTags}
          initialOsFamily={task.vm_os_family}
          initialExecWaitSecs={rerunExecWaitSecs}
          // `DetonateSubmitSource` has no flyout value; a re-run is a plain submit.
          source="detonate_page"
          onClose={closeRerun}
          onSubmitted={onRerunSubmitted}
          onViewTask={openRun}
        />
      )}
      {isBlockConfirmOpen && (
        <EuiConfirmModal
          title={i18n.FOOTER_BLOCK_HASH_CONFIRM_TITLE}
          aria-label={i18n.FOOTER_BLOCK_HASH_CONFIRM_TITLE}
          confirmButtonText={i18n.FOOTER_BLOCK_HASH_CONFIRM}
          cancelButtonText={i18n.FOOTER_BLOCK_HASH_CANCEL}
          buttonColor="danger"
          isLoading={isBlocking}
          onCancel={closeBlockConfirm}
          onConfirm={confirmBlockHash}
          data-test-subj={DETONATION_FOOTER_BLOCK_CONFIRM_TEST_ID}
        >
          <p>{i18n.FOOTER_BLOCK_HASH_CONFIRM_BODY(hash)}</p>
        </EuiConfirmModal>
      )}
    </>
  );
});

Footer.displayName = 'Footer';
