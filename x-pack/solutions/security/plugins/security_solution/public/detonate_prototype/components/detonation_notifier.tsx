/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — completion notification.
 *
 * A detonation runs for minutes. The analyst who started it leaves the page
 * (the whole point of an async submit), and without this there is no signal
 * when the run finishes — they have to remember to come back and refresh.
 *
 * Design: the submit hooks register the new task id with the tracker, and the
 * `DetonationNotifier` (mounted once, above the routes) renders one hidden
 * watcher per tracked id. The watcher is `useDetonationTask` — the same hook
 * the detail page uses — so the poll rule ("stop when the run reaches its
 * terminal worker, never before") stays written once, and the notifier adds no
 * second opinion about when a run is done.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { useNavigateTo, useToasts } from '../../common/lib/kibana';
import { SecurityPageName } from '../../app/types';
import { useDetonationTask } from '../hooks/use_detonate';
import {
  DETONATE_PROTOTYPE_APP_PATH,
  isDetonationComplete,
  isDetonationFailed,
} from '../../../common/detonate_prototype';
import * as i18n from '../translations';

export const DETONATION_NOTIFIER_TEST_ID = 'detonatePrototypeNotifier';

interface TrackerContextValue {
  /** Remember an in-flight run so its completion can be surfaced. */
  track: (taskId: string) => void;
}

const TrackerContext = createContext<TrackerContextValue>({ track: () => undefined });

/** Register a submitted task id; the notifier picks it up and polls it. */
export const useTrackDetonation = () => useContext(TrackerContext).track;

/** One in-flight run. Renders nothing; its job is the poll and the toast. */
const DetonationWatcher = ({ taskId, activeTaskId }: { taskId: string; activeTaskId?: string }) => {
  const { data: task } = useDetonationTask(taskId);
  const toasts = useToasts();
  const { navigateTo } = useNavigateTo();
  /** Toasts fire from an effect, once per run, never for the open page. */
  const notified = useRef(false);

  const done = task !== undefined && isDetonationComplete(task) && taskId !== activeTaskId;

  useEffect(() => {
    if (!done || notified.current || !task) return;
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
      onClick: () => {
        navigateTo({
          deepLinkId: SecurityPageName.detonatePrototype,
          path: `${DETONATE_PROTOTYPE_APP_PATH}/${taskId}`,
        });
      },
      'data-test-subj': `${DETONATION_NOTIFIER_TEST_ID}-success-${taskId}`,
    });
  }, [done, navigateTo, task, taskId, toasts]);

  return null;
};

/**
 * The task page currently open (from the URL), so an open run does not toast
 * about itself — the page the analyst is looking at IS the notification.
 */
const useActiveTaskId = (): string | undefined => {
  const { pathname } = useLocation();
  const prefix = `${DETONATE_PROTOTYPE_APP_PATH}/`;
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : undefined;
};

/**
 * Mounts watchers for every tracked in-flight run. Task ids live in state (not
 * a ref) so adding a watcher is a render, not an effect race. The set only
 * grows within a session, bounded by how many runs the analyst starts; the
 * watcher for a completed run stops polling on its own (`useDetonationTask`
 * returns `false` from `refetchInterval` at the terminal worker).
 */
export const DetonationNotifier = ({ children }: { children?: ReactNode }) => {
  const [taskIds, setTaskIds] = useState<readonly string[]>([]);
  const activeTaskId = useActiveTaskId();

  const track = useCallback((taskId: string) => {
    setTaskIds((ids) => (ids.includes(taskId) ? ids : [...ids, taskId]));
  }, []);

  const tracker = useMemo(() => ({ track }), [track]);

  return (
    <TrackerContext.Provider value={tracker}>
      {taskIds.map((id) => (
        <DetonationWatcher key={id} taskId={id} activeTaskId={activeTaskId} />
      ))}
      {children}
    </TrackerContext.Provider>
  );
};
