/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — "Detonate file" alert action.
 *
 * The action does not submit. It carries the hash the analyst is already
 * looking at over to the submission form, which is the only place a detonation
 * is started from; a second submit path here would be a second thing to keep
 * in step with the service contract.
 *
 * The item is absent, rather than disabled, when there is no hash to carry:
 * a disabled "Detonate file" on an alert about a network connection is noise
 * in a menu analysts read under time pressure.
 */

import { useCallback, useMemo } from 'react';
import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';

import { useNavigateTo } from '../../common/lib/kibana';
import { useIsExperimentalFeatureEnabled } from '../../common/hooks/use_experimental_features';
import { SecurityPageName } from '../../app/types';
import { DETONATE_FILE_ACTION_ID } from '../../common/constants/action_ids';
import { DETONATE_FILE_ACTION } from '../translations';

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

/**
 * Query string the submission form reads to pre-fill itself. Built here so
 * the action and the page cannot disagree about the parameter names.
 */
export const buildDetonatePrefillPath = ({
  hash,
  tags,
}: {
  hash: string;
  tags: string[];
}): string => {
  const params = new URLSearchParams({ sample_hash: hash });
  for (const tag of tags) {
    params.append('tags', tag);
  }
  return `?${params.toString()}`;
};

export interface UseDetonateAlertActionParams {
  /** The document the flyout is showing. */
  hit: DataTableRecord;
  /** Closes the Take action popover before navigating away from it. */
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
  const { navigateTo } = useNavigateTo();

  const hash = useMemo(() => getDetonatableHash(hit), [hit]);
  const documentId = hit.raw._id ?? '';

  const onClick = useCallback(() => {
    if (!hash) {
      return;
    }
    closePopover();
    navigateTo({
      deepLinkId: SecurityPageName.detonatePrototype,
      // The tag is what makes the run findable from the alert it came from.
      path: buildDetonatePrefillPath({
        hash,
        tags: documentId ? [`alert:${documentId}`] : [],
      }),
    });
  }, [closePopover, documentId, hash, navigateTo]);

  const detonateActionItems = useMemo<EuiContextMenuPanelItemDescriptor[]>(() => {
    if (!isEnabled || !hash) {
      return [];
    }
    return [
      {
        'data-test-subj': DETONATE_FILE_ACTION_ID,
        key: DETONATE_FILE_ACTION_ID,
        name: DETONATE_FILE_ACTION,
        onClick,
      },
    ];
  }, [hash, isEnabled, onClick]);

  return { detonateActionItems };
};
