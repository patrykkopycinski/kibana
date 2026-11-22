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
  DETONATE_DEFAULT_EXEC_WAIT_SECS,
  DETONATE_MAX_EXEC_WAIT_SECS,
  DETONATE_WORKER_LABELS,
  SPACE_TAG_PREFIX,
  deriveDetonateVerdict,
  isDetonationComplete,
  isDetonationFailed,
  parseAlertTags,
} from '../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../common/detonate_prototype';
import type { ConditionEntry } from '../../../../common/endpoint/types';
import { SecurityPageName, APP_PATH, TRUSTED_APPS_PATH } from '../../../../common/constants';
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
  DETONATION_FOOTER_CREATE_EXCEPTION_TEST_ID,
  DETONATION_FOOTER_FAILED_NOTE_TEST_ID,
  DETONATION_FOOTER_RERUN_TEST_ID,
  DETONATION_FOOTER_SHARE_LINK_TEST_ID,
  DETONATION_FOOTER_TAKE_ACTION_MENU_TEST_ID,
  DETONATION_FOOTER_TAKE_ACTION_TEST_ID,
  DETONATION_FOOTER_TEST_ID,
} from './test_ids';

/** The blocklist artifact is compiled per OS, and a sha256 is valid on every one of them. */
const BLOCKLIST_OS_LABELS = {
  windows: 'Windows',
  linux: 'Linux',
  macos: 'macOS',
} as const;
type BlocklistOs = keyof typeof BLOCKLIST_OS_LABELS;
const BLOCKLIST_OSES = Object.keys(BLOCKLIST_OS_LABELS) as BlocklistOs[];

/** The most indicator rows the assistant gets, so a noisy run cannot flood its context. */
const MAX_CHAT_INDICATORS = 100;

const isConflictError = (error: unknown): boolean => {
  // The lists route answers through buildSiemResponse, whose body is snake_case.
  const { body, response } = (error ?? {}) as {
    body?: { status_code?: number };
    response?: { status?: number };
  };
  return response?.status === 409 || body?.status_code === 409;
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
 * Epic #20877 §State inventory: not built here, pending product answer (pinned in footer.test.tsx):
 * - "View VM logs" (failed): the submit/task contract has no VM log source to link to.
 * - Prevalence lookup and the evasion checks observed (inconclusive): the contract carries neither.
 *
 * Also not built here:
 * - The partial-telemetry link on a failed run: the task's telemetry metadata has no public
 *   fetch, and adding a server route is out of scope for this footer.
 */
export const Footer = memo(({ task }: FooterProps) => {
  const {
    http,
    cases,
    application: { navigateToUrl },
  } = useKibana().services;
  const { addSuccess, addError, addInfo, addWarning } = useAppToasts();
  const { getAppUrl } = useAppUrl();
  const { openDetonationFlyout } = useFlyoutApi();
  const canAttachToCase = useCanAttachToCase();
  const { endpointPrivileges } = useUserPrivileges();
  const canWriteBlocklist = Boolean(endpointPrivileges?.canWriteBlocklist);
  // The entry is tagged `policy:all`, a global artifact the server gates separately.
  const canManageGlobalArtifacts = Boolean(endpointPrivileges?.canManageGlobalArtifacts);
  const { isAgentChatExperienceEnabled } = useAgentBuilderAvailability();

  const taskId = task.id;
  const complete = isDetonationComplete(task);
  const failed = isDetonationFailed(task);
  const conclusion = useMemo(() => deriveDetonateVerdict(task), [task]);
  const inconclusive = conclusion.status === 'complete' && conclusion.verdict === 'inconclusive';
  // The exception offer mirrors the blocklist gate: only a finished, benign run that came
  // from an alert, and only for users who may write trusted applications.
  const hasOriginAlerts = parseAlertTags(task.tags).length > 0;
  const showCreateException =
    complete &&
    conclusion.verdict === 'benign' &&
    hasOriginAlerts &&
    Boolean(endpointPrivileges?.canWriteTrustedApplications);
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
        indicators_total: indicators.rows.length,
        indicators_truncated: indicators.rows.length > MAX_CHAT_INDICATORS,
        indicators: indicators.rows.slice(0, MAX_CHAT_INDICATORS),
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
  // doubled from the wait the run actually used; the cap is the connector's, so the form never
  // offers a wait it would clamp.
  const rerunInitialTags = useMemo(
    () => task.tags.filter((tag) => !tag.startsWith(SPACE_TAG_PREFIX)),
    [task.tags]
  );
  // Older run records can lack the field even though the type says it is always set.
  const currentExecWaitSecs = task.exec_wait_secs as number | undefined;
  // A 0 or missing wait means the service applied its default.
  const effectiveExecWaitSecs = currentExecWaitSecs || DETONATE_DEFAULT_EXEC_WAIT_SECS;
  const rerunExecWaitSecs = needsLongerTimeout
    ? Math.min(effectiveExecWaitSecs * 2, DETONATE_MAX_EXEC_WAIT_SECS)
    : currentExecWaitSecs;
  // At the cap the pre-filled wait is the current one, so "longer" would be a false promise.
  const offersLongerTimeout =
    needsLongerTimeout && effectiveExecWaitSecs < DETONATE_MAX_EXEC_WAIT_SECS;
  const closeRerun = useCallback(() => setIsRerunOpen(false), []);
  const openRun = useCallback(
    (id: string) => {
      setIsRerunOpen(false);
      openDetonationFlyout({ taskId: id });
    },
    [openDetonationFlyout]
  );
  const onRerunSubmitted = useCallback((newTask: DetonateTask) => openRun(newTask.id), [openRun]);

  // Add to case: the same path and permission gate as the indicators section. With no indicator
  // rows the comment would carry only its header, so the item is disabled.
  const hasIndicators = indicators.rows.length > 0;
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
    const url = getAppUrl({
      deepLinkId: SecurityPageName.detonatePrototype,
      path: `?${params.toString()}`,
      absolute: true,
    });
    if (copyToClipboard(url)) {
      addSuccess(i18n.FOOTER_SHARE_LINK_COPIED);
    } else {
      addWarning(i18n.FOOTER_SHARE_LINK_COPY_FAILED);
    }
  }, [addSuccess, addWarning, closePopover, getAppUrl, taskId]);

  const hash = task.sample_hash ?? '';

  // Trusted-app exception for the sample: opens the Trusted apps create flyout. Default follows
  // the incompatible-antivirus insight link (plain URL, no prefill); pending product confirmation.
  // The artifact flyout's location.state prefill only applies to real workflow insights (a truthy
  // insight id also marks a remediation on save), so the hash is copied to the clipboard instead.
  const onCreateException = useCallback(() => {
    closePopover();
    if (hash && copyToClipboard(hash)) {
      addInfo(i18n.FOOTER_CREATE_EXCEPTION_HASH_COPIED);
    } else {
      addWarning(i18n.FOOTER_CREATE_EXCEPTION_HASH_COPY_FAILED);
    }
    navigateToUrl(`${APP_PATH}${TRUSTED_APPS_PATH}?show=create`);
  }, [addInfo, addWarning, closePopover, hash, navigateToUrl]);

  // Block hash: needs both blocklist privileges and an explicit confirmation.
  const blockDisabledReason = !canWriteBlocklist
    ? i18n.FOOTER_BLOCK_HASH_NO_PRIVILEGE
    : !canManageGlobalArtifacts
    ? i18n.FOOTER_BLOCK_HASH_NO_GLOBAL_PRIVILEGE
    : !hash
    ? i18n.FOOTER_BLOCK_HASH_NO_HASH
    : undefined;
  const onBlockHash = useCallback(() => {
    closePopover();
    setIsBlockConfirmOpen(true);
  }, [closePopover]);
  const closeBlockConfirm = useCallback(() => setIsBlockConfirmOpen(false), []);
  const blockHashOnEveryOs = useCallback(async () => {
    const client = BlocklistsApiClient.getInstance(http);
    const conditionEntries: ConditionEntry[] = [
      { field: 'file.hash.*', operator: 'included', type: 'match_any', value: [hash] },
    ];
    // One entry per OS; a fixed `item_id` makes a repeat block a conflict rather than a duplicate.
    const results = await Promise.allSettled(
      BLOCKLIST_OSES.map((os) => {
        const item: CreateExceptionListItemSchema = {
          description: i18n.FOOTER_BLOCK_HASH_DESCRIPTION(taskId),
          entries: conditionEntries as CreateExceptionListItemSchema['entries'],
          item_id: `detonate-block-${hash}-${os}`,
          list_id: 'endpoint_blocklists',
          name: i18n.FOOTER_BLOCK_HASH_NAME(hash),
          namespace_type: 'agnostic',
          os_types: [os],
          tags: ['policy:all'],
          type: 'simple',
        };
        return client.create(item);
      })
    );

    const created: BlocklistOs[] = [];
    const alreadyBlocked: BlocklistOs[] = [];
    const failedOses: BlocklistOs[] = [];
    let firstError: unknown;
    results.forEach((result, index) => {
      const os = BLOCKLIST_OSES[index];
      if (result.status === 'fulfilled') {
        created.push(os);
      } else if (isConflictError(result.reason)) {
        alreadyBlocked.push(os);
      } else {
        failedOses.push(os);
        firstError = firstError ?? result.reason;
      }
    });
    const names = (oses: BlocklistOs[]) => oses.map((os) => BLOCKLIST_OS_LABELS[os]).join(', ');

    if (failedOses.length > 0 && created.length + alreadyBlocked.length === 0) {
      addError(firstError instanceof Error ? firstError : new Error(String(firstError)), {
        title: i18n.FOOTER_BLOCK_HASH_ERROR,
        toastMessage: i18n.FOOTER_BLOCK_HASH_PARTIAL(names(failedOses)),
      });
    } else if (failedOses.length > 0) {
      addWarning(i18n.FOOTER_BLOCK_HASH_PARTIAL(names(failedOses)));
      if (created.length > 0) {
        addSuccess(i18n.FOOTER_BLOCK_HASH_PARTIAL_SUCCESS(names(created)));
      }
      if (alreadyBlocked.length > 0) {
        addInfo(i18n.FOOTER_BLOCK_HASH_ALREADY_BLOCKED(names(alreadyBlocked)));
      }
    } else {
      if (created.length > 0) {
        addSuccess(i18n.FOOTER_BLOCK_HASH_SUCCESS);
      }
      if (alreadyBlocked.length > 0) {
        addInfo(i18n.FOOTER_BLOCK_HASH_ALREADY_BLOCKED(names(alreadyBlocked)));
      }
    }
  }, [addError, addInfo, addSuccess, addWarning, hash, http, taskId]);
  const confirmBlockHash = useCallback(async () => {
    setIsBlocking(true);
    try {
      await blockHashOnEveryOs();
    } catch (error) {
      addError(error instanceof Error ? error : new Error(String(error)), {
        title: i18n.FOOTER_BLOCK_HASH_ERROR,
      });
    } finally {
      setIsBlocking(false);
      setIsBlockConfirmOpen(false);
    }
  }, [addError, blockHashOnEveryOs]);

  const menuItems = useMemo(() => {
    const items = [];
    if (canAttachToCase) {
      items.push(
        <EuiContextMenuItem
          key="addToCase"
          icon="casesApp"
          onClick={onAddToCase}
          disabled={!hasIndicators}
          hasAriaDisabled
          toolTipContent={hasIndicators ? undefined : i18n.FOOTER_ADD_TO_CASE_NO_INDICATORS}
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
        icon="crossCircle"
        disabled={Boolean(blockDisabledReason)}
        hasAriaDisabled
        toolTipContent={blockDisabledReason}
        onClick={onBlockHash}
        data-test-subj={DETONATION_FOOTER_BLOCK_HASH_TEST_ID}
      >
        {i18n.FOOTER_BLOCK_HASH}
      </EuiContextMenuItem>
    );
    if (showCreateException) {
      items.push(
        <EuiContextMenuItem
          key="createException"
          icon="plusCircle"
          onClick={onCreateException}
          data-test-subj={DETONATION_FOOTER_CREATE_EXCEPTION_TEST_ID}
        >
          {i18n.FOOTER_CREATE_EXCEPTION}
        </EuiContextMenuItem>
      );
    }
    return items;
  }, [
    blockDisabledReason,
    canAttachToCase,
    hasIndicators,
    onAddToCase,
    onBlockHash,
    onCreateException,
    onShareLink,
    showCreateException,
  ]);

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
                i18n.FOOTER_FAILED_NOTE_FALLBACK(
                  DETONATE_WORKER_LABELS[task.last_worker_name] ?? task.last_worker_name
                )}
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
            {offersLongerTimeout ? i18n.FOOTER_RERUN_LONGER_TIMEOUT : i18n.FOOTER_RERUN}
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
            <EuiContextMenuPanel
              items={menuItems}
              data-test-subj={DETONATION_FOOTER_TAKE_ACTION_MENU_TEST_ID}
            />
          </EuiPopover>
        </EuiFlexItem>
      </EuiFlexGroup>
      {isRerunOpen && (
        <SubmitModal
          initialHash={task.sample_hash ?? undefined}
          initialTags={rerunInitialTags}
          initialOsFamily={task.vm_os_family ?? undefined}
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
