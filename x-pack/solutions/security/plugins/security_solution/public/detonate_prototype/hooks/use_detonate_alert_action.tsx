/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — "Detonate file" alert action.
 *
 * The sourcing ladder (D11), as menu items, cheapest rung first:
 *
 *   1. "View detonation report" — a completed run for this hash already
 *      exists; opening its result flyout costs nothing.
 *   2. "Detonate file" — opens the submit modal (the same `SubmitModal` the
 *      Detonate page uses), prefilled with the hash. The modal is where the
 *      confirm-before-VM-spent lives; a second submit path here would be a
 *      second thing to keep in step with the service contract. The caller
 *      renders `detonateModal`, and on success the result opens as a new
 *      session, replacing the alert flyout.
 *
 * The report opens as a new session as well.
 *
 * The items are absent, rather than disabled, when they cannot apply: a
 * disabled "Detonate file" on an alert about a network connection is noise in
 * a menu analysts read under time pressure.
 */

import type { ReactElement } from 'react';
import React, { useCallback, useMemo, useState } from 'react';
import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';

import { useIsExperimentalFeatureEnabled } from '../../common/hooks/use_experimental_features';
import { useFlyoutApi } from '../../flyout_v2/use_flyout_api';
import {
  DETONATE_FILE_ACTION_ID,
  DETONATE_VIEW_REPORT_ACTION_ID,
} from '../../common/constants/action_ids';
import type { DetonateTask } from '../../../common/detonate_prototype';
import { SubmitModal } from '../components/submit_modal';
import { DETONATE_FILE_ACTION, DETONATE_VIEW_REPORT_ACTION } from '../translations';
import { getDetonatableHash } from './detonatable_hash';
import { useCompletedDetonationByHash } from './use_detonate';

const getStringField = (hit: DataTableRecord, field: string): string | undefined => {
  const value = getFieldValue(hit, field);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export interface UseDetonateAlertActionParams {
  /** The document the flyout is showing. */
  hit: DataTableRecord;
  /** Closes the Take action popover before opening a flyout. */
  closePopover: () => void;
}

export interface UseDetonateAlertActionResult {
  detonateActionItems: EuiContextMenuPanelItemDescriptor[];
  /** The submit modal while open, otherwise null. Render it outside the popover. */
  detonateModal: ReactElement | null;
}

export const useDetonateAlertAction = ({
  hit,
  closePopover,
}: UseDetonateAlertActionParams): UseDetonateAlertActionResult => {
  const isEnabled = useIsExperimentalFeatureEnabled('detonatePrototypeEnabled');
  const { openDetonationFlyout } = useFlyoutApi();
  const [isModalVisible, setIsModalVisible] = useState(false);

  const hash = useMemo(() => getDetonatableHash(hit), [hit]);
  const documentId = hit.raw._id ?? '';
  const hostName = getStringField(hit, 'host.name');
  const userName = getStringField(hit, 'user.name');
  const filePath = getStringField(hit, 'file.path') ?? getStringField(hit, 'process.executable');

  // Rung 1: a completed report for this hash already on record.
  const { completedRun } = useCompletedDetonationByHash(isEnabled ? hash : undefined);

  const onClick = useCallback(() => {
    if (!hash) {
      return;
    }
    closePopover();
    setIsModalVisible(true);
  }, [closePopover, hash]);

  const closeModal = useCallback(() => setIsModalVisible(false), []);

  const openResult = useCallback(
    (taskId: string) => {
      setIsModalVisible(false);
      openDetonationFlyout({ taskId });
    },
    [openDetonationFlyout]
  );

  const onSubmitted = useCallback((task: DetonateTask) => openResult(task.id), [openResult]);

  // The tag is what makes the run findable from the alert it came from.
  const initialTags = useMemo(() => (documentId ? [`alert:${documentId}`] : []), [documentId]);
  const initialOrigin = useMemo(
    () => ({
      ...(documentId ? { alert_ids: [documentId] } : {}),
      ...(hostName ? { host_name: hostName } : {}),
      ...(userName ? { user_name: userName } : {}),
      ...(filePath ? { file_path: filePath } : {}),
    }),
    [documentId, filePath, hostName, userName]
  );

  const viewReport = useCallback(() => {
    if (!completedRun) {
      return;
    }
    closePopover();
    openDetonationFlyout({ taskId: completedRun.id });
  }, [closePopover, completedRun, openDetonationFlyout]);

  const detonateActionItems = useMemo<EuiContextMenuPanelItemDescriptor[]>(() => {
    if (!isEnabled || !hash) {
      return [];
    }
    const items: EuiContextMenuPanelItemDescriptor[] = [];
    if (completedRun) {
      items.push({
        'data-test-subj': DETONATE_VIEW_REPORT_ACTION_ID,
        key: DETONATE_VIEW_REPORT_ACTION_ID,
        name: DETONATE_VIEW_REPORT_ACTION,
        onClick: viewReport,
      });
    }
    items.push({
      'data-test-subj': DETONATE_FILE_ACTION_ID,
      key: DETONATE_FILE_ACTION_ID,
      name: DETONATE_FILE_ACTION,
      onClick,
    });
    return items;
  }, [completedRun, hash, isEnabled, onClick, viewReport]);

  const detonateModal =
    isEnabled && hash && isModalVisible ? (
      <SubmitModal
        initialHash={hash}
        initialTags={initialTags}
        initialOrigin={initialOrigin}
        source="alert_flyout"
        onClose={closeModal}
        onSubmitted={onSubmitted}
        onViewTask={openResult}
      />
    ) : null;

  return { detonateActionItems, detonateModal };
};
