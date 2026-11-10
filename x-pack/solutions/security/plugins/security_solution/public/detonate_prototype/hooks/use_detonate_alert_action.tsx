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
 *   2. "Detonate file" — opens the submission form (the same `SubmitForm` the
 *      Detonate page uses) in a child flyout, prefilled with the hash. The form
 *      is where the confirm-before-VM-spent lives; a second submit path here
 *      would be a second thing to keep in step with the service contract.
 *
 * Both open as children of the alert flyout, so the analyst stays on the alert.
 *
 * The items are absent, rather than disabled, when they cannot apply: a
 * disabled "Detonate file" on an alert about a network connection is noise in
 * a menu analysts read under time pressure.
 */

import { useCallback, useMemo } from 'react';
import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';

import { useIsExperimentalFeatureEnabled } from '../../common/hooks/use_experimental_features';
import { useFlyoutApi } from '../../flyout_v2/use_flyout_api';
import {
  DETONATE_FILE_ACTION_ID,
  DETONATE_VIEW_REPORT_ACTION_ID,
} from '../../common/constants/action_ids';
import { DETONATE_FILE_ACTION, DETONATE_VIEW_REPORT_ACTION } from '../translations';
import { useCompletedDetonationByHash } from './use_detonate';

/**
 * Hash fields in the order the detonation service prefers them. SHA-256 first
 * because that is what the sample stores key on; the weaker digests are a
 * fallback for older endpoint documents that only carry them.
 */
const HASH_FIELDS = [
  'file.hash.sha256',
  'process.hash.sha256',
  'file.hash.sha1',
  'process.hash.sha1',
  'file.hash.md5',
  'process.hash.md5',
] as const;

/** First populated hash on the document, or undefined when it carries none. */
export const getDetonatableHash = (hit: DataTableRecord): string | undefined => {
  for (const field of HASH_FIELDS) {
    const value = getFieldValue(hit, field);
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
};

export interface UseDetonateAlertActionParams {
  /** The document the flyout is showing. */
  hit: DataTableRecord;
  /** Closes the Take action popover before opening a flyout. */
  closePopover: () => void;
}

export interface UseDetonateAlertActionResult {
  detonateActionItems: EuiContextMenuPanelItemDescriptor[];
}

export const useDetonateAlertAction = ({
  hit,
  closePopover,
}: UseDetonateAlertActionParams): UseDetonateAlertActionResult => {
  const isEnabled = useIsExperimentalFeatureEnabled('detonatePrototypeEnabled');
  const { openDetonationFlyoutAsChild, openDetonationSubmitAsChild } = useFlyoutApi();

  const hash = useMemo(() => getDetonatableHash(hit), [hit]);
  const documentId = hit.raw._id ?? '';

  // Rung 1: a completed report for this hash already on record.
  const { completedRun } = useCompletedDetonationByHash(isEnabled ? hash : undefined);

  const onClick = useCallback(() => {
    if (!hash) {
      return;
    }
    closePopover();
    openDetonationSubmitAsChild({
      hash,
      // The tag is what makes the run findable from the alert it came from.
      tags: documentId ? [`alert:${documentId}`] : [],
    });
  }, [closePopover, documentId, hash, openDetonationSubmitAsChild]);

  const viewReport = useCallback(() => {
    if (!completedRun) {
      return;
    }
    closePopover();
    openDetonationFlyoutAsChild({ taskId: completedRun.id });
  }, [closePopover, completedRun, openDetonationFlyoutAsChild]);

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

  return { detonateActionItems };
};
