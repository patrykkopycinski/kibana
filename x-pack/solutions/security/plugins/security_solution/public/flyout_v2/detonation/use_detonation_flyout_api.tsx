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
import {
  FLYOUT_SESSION_KIND,
  FLYOUT_SURFACE,
  FLYOUT_TOOL,
  FLYOUT_TYPE,
} from '../../common/lib/telemetry';
import type { DetonateTask } from '../../../common/detonate_prototype';
import {
  useDefaultDocumentFlyoutProperties,
  useDefaultToolsFlyoutProperties,
} from '../shared/hooks/use_default_flyout_properties';
import { useOpenFlyout } from '../shared/hooks/use_open_flyout';
import { buildFlyoutNavTitle } from '../shared/utils/build_flyout_nav_title';
import {
  DETONATION_TITLE,
  NOTES_TITLE,
  SESSION_VIEW_TITLE,
  formatFlyoutTitle,
} from '../shared/constants/flyout_titles';
import { useFlyoutSessionContext } from '../session_context';
import { PaginationStoreProvider } from '../document/pagination/context';
import { createPaginationStore } from '../document/pagination/store';
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

const DetonationSessionView = lazy(() =>
  import('./tools/session_view').then((m) => ({ default: m.DetonationSessionView }))
);
const DetonationNotes = lazy(() =>
  import('./tools/notes').then((m) => ({ default: m.DetonationNotes }))
);

export interface OpenDetonationFlyoutParams {
  /** Id of the detonation run to show. */
  taskId: string;
  /** Which UI trigger opened this flyout, when known. */
  origin?: FlyoutOrigin;
  /**
   * The runs the Detonations table shows, in its current sort, with `taskId` among them. Adds
   * previous/next paging to the flyout header; omitted, the flyout has none.
   */
  pagination?: DetonationFlyoutPagination;
}

export interface DetonationFlyoutPagination {
  /** Run ids in table order. */
  taskIds: readonly string[];
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
  /** Opens Session View over the run's recorded process events as a child of the result. */
  openDetonationSessionView: (params: OpenDetonationSessionViewParams) => void;
  /** Opens Notes for the run as a child of the result. */
  openDetonationNotes: (params: OpenDetonationNotesParams) => void;
}

export interface OpenDetonationSessionViewParams {
  /** The detonation run; its filename (or id) titles the child menu entry. */
  task: DetonateTask;
  /** Which UI trigger opened the tool, when known. */
  origin?: FlyoutOrigin;
}

export interface OpenDetonationNotesParams {
  /** The detonation run; its id is the notes' document id. */
  task: DetonateTask;
  /** Which UI trigger opened the tool, when known. */
  origin?: FlyoutOrigin;
}

/**
 * The flyout body, inside a pagination store when the table handed over its rows. Unlike the
 * alerts flyout (`usePaginatedFlyout`), the table does not own the store: a run is fetched by id,
 * so paging reopens the flyout on the neighbouring id with the same row list instead of swapping a
 * document held in the table.
 */
const withPagination = (
  params: OpenDetonationFlyoutParams,
  reopen: (params: OpenDetonationFlyoutParams) => void
): ReactNode => {
  const details = <DetonationDetails taskId={params.taskId} />;
  const { pagination } = params;
  const index = pagination ? pagination.taskIds.indexOf(params.taskId) : -1;
  if (!pagination || index < 0) return details;

  const store = createPaginationStore();
  store.setState({
    flyoutDocumentIndex: index,
    totalDocumentCount: pagination.taskIds.length,
    flyoutDocumentId: params.taskId,
    openDocumentFlyoutImpl: (documentIndex) => {
      const taskId = pagination.taskIds[documentIndex];
      if (taskId) reopen({ ...params, taskId });
    },
  });
  return <PaginationStoreProvider value={store}>{details}</PaginationStoreProvider>;
};

/**
 * Developer-facing API to open the detonation result flyout, in the same
 * mindset as `useIocFlyoutApi`. Must be used within the Security Solution app shell.
 */
export const useDetonationFlyoutApi = (): DetonationFlyoutApi => {
  const { session: sessionMode, historyKey } = useFlyoutSessionContext();
  const defaultDocumentFlyoutProperties = useDefaultDocumentFlyoutProperties();
  const defaultToolsFlyoutProperties = useDefaultToolsFlyoutProperties();
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
        withPagination(params, openDetonationFlyout),
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

  /**
   * Opens a tool as a child of the result. Unlike the alert flyout's tools (`openChildFlyout` in
   * `use_shared_tools_flyout_api`), the tool is not written to the URL: the `sessionView` and
   * `notes` descriptors are keyed on a document id and index, which a run is not, and restoring
   * one would open the alert-document tool on a `detonate-tasks` id. With no URL write there is no
   * `onClose` to build: a close must not touch the result's entry in the stack.
   * Epic #20877 §5 deviates here, pending product answer: a refresh restores the result only.
   */
  const openToolAsChild = useCallback(
    (
      children: ReactNode,
      title: string,
      tool: typeof FLYOUT_TOOL.SESSION_VIEW | typeof FLYOUT_TOOL.NOTES,
      origin?: FlyoutOrigin
    ) => {
      const properties: OverlaySystemFlyoutOpenOptions = {
        ...defaultToolsFlyoutProperties,
        historyKey,
        session: FLYOUT_SESSION_KIND.INHERIT,
        title: buildFlyoutNavTitle(title),
      };
      openFlyout(
        children,
        properties,
        {
          surface: FLYOUT_SURFACE.TOOL,
          tool,
          flyoutType: FLYOUT_TYPE.DETONATION,
          session: FLYOUT_SESSION_KIND.INHERIT,
          origin,
        },
        FLYOUT_SESSION_KIND.INHERIT
      );
    },
    [openFlyout, defaultToolsFlyoutProperties, historyKey]
  );

  const openDetonationSessionView = useCallback(
    ({ task, origin }: OpenDetonationSessionViewParams) =>
      openToolAsChild(
        <DetonationSessionView taskId={task.id} />,
        formatFlyoutTitle(SESSION_VIEW_TITLE, task.sample_filename ?? task.id),
        FLYOUT_TOOL.SESSION_VIEW,
        origin
      ),
    [openToolAsChild]
  );

  const openDetonationNotes = useCallback(
    ({ task, origin }: OpenDetonationNotesParams) =>
      openToolAsChild(
        <DetonationNotes task={task} />,
        formatFlyoutTitle(NOTES_TITLE, task.sample_filename ?? task.id),
        FLYOUT_TOOL.NOTES,
        origin
      ),
    [openToolAsChild]
  );

  return useMemo(
    () => ({
      openDetonationFlyout,
      openDetonationFlyoutAsChild,
      openDetonationSessionView,
      openDetonationNotes,
    }),
    [
      openDetonationFlyout,
      openDetonationFlyoutAsChild,
      openDetonationSessionView,
      openDetonationNotes,
    ]
  );
};
