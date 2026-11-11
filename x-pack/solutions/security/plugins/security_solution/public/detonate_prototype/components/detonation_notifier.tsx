/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — completion notification.
 *
 * A detonation runs for minutes, and the analyst who started it leaves the
 * page (the whole point of an async submit); without this there is no signal
 * when the run finishes.
 *
 * Design: submit hooks register the new task id in a module-level store, and
 * the `DetonationNotifier` (mounted once, inside the Security app root)
 * renders one hidden watcher per tracked id. The store is module state, not
 * React context, because detonations are submitted from two React roots: this
 * app and the flyout overlay root where the alert action's submit form
 * renders — a context in one root can never reach a provider in the other.
 * The watcher reuses `useDetonationTask`, so the poll rule ("stop when the
 * run reaches its terminal worker, never before") is written once.
 *
 * Which run the analyst is looking at is also store state: the detonation
 * flyout registers its task id while visible, so an open run does not toast
 * about itself — the flyout the analyst is looking at IS the notification.
 */

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { useToasts } from '../../common/lib/kibana';
import { useDetonationFlyoutApi } from '../../flyout_v2/detonation/use_detonation_flyout_api';
import { useDetonationTask } from '../hooks/use_detonate';
import { isDetonationComplete, isDetonationFailed } from '../../../common/detonate_prototype';
import * as i18n from '../translations';

export const DETONATION_NOTIFIER_TEST_ID = 'detonatePrototypeNotifier';

interface DetonationTrackerSnapshot {
  /** Every in-flight run submitted this session, oldest first. */
  readonly trackedTaskIds: readonly string[];
  /** Task id of the detonation flyout currently visible, if any. */
  readonly visibleTaskId?: string;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let snapshot: DetonationTrackerSnapshot = { trackedTaskIds: [] };

const emit = (): void => {
  for (const listener of listeners) listener();
};

/**
 * Cross-root tracking state for detonation runs. Kept module-level: the
 * submit form can render in the flyout overlay root while the notifier (and
 * its watchers) mount in the Security app root.
 */
export const detonationTrackerStore = {
  /** Remember an in-flight run so its completion can be surfaced. */
  track: (taskId: string): void => {
    if (snapshot.trackedTaskIds.includes(taskId)) return;
    snapshot = { ...snapshot, trackedTaskIds: [...snapshot.trackedTaskIds, taskId] };
    emit();
  },
  /** Mark a run as the one on screen (flyout mounted). */
  setVisible: (taskId: string): void => {
    if (snapshot.visibleTaskId === taskId) return;
    snapshot = { ...snapshot, visibleTaskId: taskId };
    emit();
  },
  /** Drop the on-screen mark (flyout unmounted). */
  clearVisible: (taskId: string): void => {
    if (snapshot.visibleTaskId !== taskId) return;
    snapshot = { ...snapshot, visibleTaskId: undefined };
    emit();
  },
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): DetonationTrackerSnapshot => snapshot,
  /** Test-only: module state would otherwise leak between test cases. */
  __resetForTests: (): void => {
    snapshot = { trackedTaskIds: [] };
    emit();
  },
};

/** Register a submitted task id; the notifier picks it up and polls it. */
export const useTrackDetonation = () => detonationTrackerStore.track;

const useDetonationTracker = (): DetonationTrackerSnapshot =>
  useSyncExternalStore(detonationTrackerStore.subscribe, detonationTrackerStore.getSnapshot);

/** One in-flight run. Renders nothing; its job is the poll and the toast. */
const DetonationWatcher = ({
  taskId,
  visibleTaskId,
}: {
  taskId: string;
  visibleTaskId?: string;
}) => {
  const { data: task } = useDetonationTask(taskId);
  const toasts = useToasts();
  const { openDetonationFlyout } = useDetonationFlyoutApi();
  /** Toasts fire from an effect, once per run, never for the open flyout. */
  const notified = useRef(false);

  const done = task !== undefined && isDetonationComplete(task);

  useEffect(() => {
    if (!done || notified.current || !task) return;
    // A run whose flyout is open completes in front of the analyst: the
    // flyout is the notification. Consume the completion silently so closing
    // the flyout afterwards does not replay it as a toast.
    if (taskId === visibleTaskId) {
      notified.current = true;
      return;
    }
    notified.current = true;

    const sample = task.sample_filename ?? task.sample_hash ?? taskId;
    if (isDetonationFailed(task)) {
      toasts.addWarning({
        title: i18n.NOTIFY_FAILED_TITLE(sample),
        text: `${task.last_worker_name.replace('detonate.workers.', '')}${
          task.last_worker_status_details ? `: ${task.last_worker_status_details}` : ''
        }`,
        toastLifeTimeMs: 60_000,
        'data-test-subj': `${DETONATION_NOTIFIER_TEST_ID}-warning-${taskId}`,
      });
      return;
    }

    toasts.addSuccess({
      title: i18n.NOTIFY_COMPLETE_TITLE(sample),
      text: i18n.NOTIFY_COMPLETE_TEXT,
      toastLifeTimeMs: 60_000,
      onClick: () => openDetonationFlyout({ taskId }),
      'data-test-subj': `${DETONATION_NOTIFIER_TEST_ID}-success-${taskId}`,
    });
  }, [done, openDetonationFlyout, task, taskId, toasts, visibleTaskId]);

  return null;
};

/**
 * Mounts watchers for every tracked in-flight run. Mounted once inside the
 * Security app root (alive across route changes and while any flyout is
 * open). Run ids live in the module store, so submissions from the flyout
 * overlay root reach these watchers without sharing a React tree.
 */
export const DetonationNotifier = ({ children }: { children?: ReactNode }) => {
  const { trackedTaskIds, visibleTaskId } = useDetonationTracker();

  return (
    <>
      {trackedTaskIds.map((id) => (
        <DetonationWatcher key={id} taskId={id} visibleTaskId={visibleTaskId} />
      ))}
      {children}
    </>
  );
};
