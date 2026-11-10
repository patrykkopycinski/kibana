/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { lazy, useCallback, useMemo } from 'react';
import type { OverlaySystemFlyoutOpenOptions } from '@kbn/core-overlays-browser';
import type { FlyoutOrigin, FlyoutSessionKind } from '../../common/lib/telemetry';
import { FLYOUT_SESSION_KIND, FLYOUT_SURFACE, FLYOUT_TYPE } from '../../common/lib/telemetry';
import { useDefaultDocumentFlyoutProperties } from '../shared/hooks/use_default_flyout_properties';
import { useOpenFlyout } from '../shared/hooks/use_open_flyout';
import { buildFlyoutNavTitle } from '../shared/utils/build_flyout_nav_title';
import {
  DETONATION_SUBMIT_TITLE,
  DETONATION_TITLE,
  formatFlyoutTitle,
} from '../shared/constants/flyout_titles';
import { useFlyoutSessionContext } from '../session_context';
import { useFlyoutV2UrlWriter } from '../shared/url_state/flyout_v2_url_writer';
import {
  FLYOUT_DESCRIPTOR_KIND,
  urlParamKeyForHistoryKey,
} from '../shared/url_state/flyout_v2_url_param';

// Lazy-loaded so consumers of this hook don't statically pull the detonation flyout graph into
// their bundle; the chunks only load when a flyout is actually opened.
const DetonationDetails = lazy(() =>
  import('./main').then((m) => ({ default: m.DetonationDetails }))
);
const DetonationSubmit = lazy(() =>
  import('./submit').then((m) => ({ default: m.DetonationSubmit }))
);

export interface OpenDetonationFlyoutParams {
  /** Id of the detonation run to show. */
  taskId: string;
  /** Which UI trigger opened this flyout, when known. */
  origin?: FlyoutOrigin;
}

export interface OpenDetonationSubmitParams {
  /** Hash to prefill in the submit form. */
  hash?: string;
  /** Tags to prefill in the submit form, e.g. the `alert:<id>` link back to an alert. */
  tags?: string[];
  /** Which UI trigger opened this flyout, when known. */
  origin?: FlyoutOrigin;
}

export interface DetonationFlyoutApi {
  /**
   * Opens the detonation result flyout as a new, top-level flyout (starting a fresh session).
   */
  openDetonationFlyout: (params: OpenDetonationFlyoutParams) => void;
  /**
   * Opens the detonation result flyout as a child of the currently open flyout (so the analyst
   * stays on it, e.g. an alert).
   */
  openDetonationFlyoutAsChild: (params: OpenDetonationFlyoutParams) => void;
  /**
   * Opens the detonation submit form as a child of the currently open flyout. Once the run was
   * accepted, the child is replaced by that run's detonation result child.
   *
   * Not URL-restorable: no descriptor is written for it (a submit form has no state worth
   * restoring), so the URL keeps describing the parent flyout until the result child opens.
   */
  openDetonationSubmitAsChild: (params?: OpenDetonationSubmitParams) => void;
}

/**
 * Developer-facing API to open the detonation result flyout and its submit child, in the same
 * mindset as `useIocFlyoutApi`. Must be used within the Security Solution app shell.
 */
export const useDetonationFlyoutApi = (): DetonationFlyoutApi => {
  const { session: sessionMode, historyKey } = useFlyoutSessionContext();
  const defaultDocumentFlyoutProperties = useDefaultDocumentFlyoutProperties();
  const openFlyout = useOpenFlyout();
  const urlParamKey = urlParamKeyForHistoryKey(historyKey);
  const { writeOnOpen, buildOnClose, readRootDescriptor } = useFlyoutV2UrlWriter(
    urlParamKey,
    historyKey
  );

  const open = useCallback(
    (
      children: ReactNode,
      session: FlyoutSessionKind,
      title: OverlaySystemFlyoutOpenOptions['title'],
      onClose: (() => void) | undefined,
      origin?: FlyoutOrigin
    ) => {
      const properties: OverlaySystemFlyoutOpenOptions = {
        ...defaultDocumentFlyoutProperties,
        historyKey,
        session,
        title,
        onClose,
      };
      openFlyout(
        children,
        properties,
        { surface: FLYOUT_SURFACE.FLYOUT, flyoutType: FLYOUT_TYPE.DETONATION, session, origin },
        session === FLYOUT_SESSION_KIND.INHERIT ? FLYOUT_SESSION_KIND.INHERIT : sessionMode
      );
    },
    [openFlyout, defaultDocumentFlyoutProperties, historyKey, sessionMode]
  );

  const getTitle = useCallback(
    ({ taskId }: OpenDetonationFlyoutParams) => formatFlyoutTitle(DETONATION_TITLE, taskId),
    []
  );

  const openDetonationFlyout = useCallback(
    (params: OpenDetonationFlyoutParams) => {
      writeOnOpen({ kind: FLYOUT_DESCRIPTOR_KIND.detonation, taskId: params.taskId });
      const onClose = buildOnClose(null);
      open(
        <DetonationDetails taskId={params.taskId} />,
        sessionMode,
        getTitle(params),
        onClose,
        params.origin
      );
    },
    [open, sessionMode, getTitle, writeOnOpen, buildOnClose]
  );

  const openDetonationFlyoutAsChild = useCallback(
    (params: OpenDetonationFlyoutParams) => {
      const parentDescriptor = readRootDescriptor();
      writeOnOpen({ kind: FLYOUT_DESCRIPTOR_KIND.detonation, taskId: params.taskId }, 'inherit');
      const onClose = buildOnClose(parentDescriptor);
      open(
        <DetonationDetails taskId={params.taskId} />,
        FLYOUT_SESSION_KIND.INHERIT,
        buildFlyoutNavTitle(getTitle(params)),
        onClose,
        params.origin
      );
    },
    [open, getTitle, readRootDescriptor, writeOnOpen, buildOnClose]
  );

  const openDetonationSubmitAsChild = useCallback(
    ({ hash, tags, origin }: OpenDetonationSubmitParams = {}) => {
      open(
        <DetonationSubmit
          initialHash={hash}
          initialTags={tags}
          onSubmitted={(task) => openDetonationFlyoutAsChild({ taskId: task.id, origin })}
        />,
        FLYOUT_SESSION_KIND.INHERIT,
        buildFlyoutNavTitle(DETONATION_SUBMIT_TITLE),
        undefined,
        origin
      );
    },
    [open, openDetonationFlyoutAsChild]
  );

  return useMemo(
    () => ({ openDetonationFlyout, openDetonationFlyoutAsChild, openDetonationSubmitAsChild }),
    [openDetonationFlyout, openDetonationFlyoutAsChild, openDetonationSubmitAsChild]
  );
};
