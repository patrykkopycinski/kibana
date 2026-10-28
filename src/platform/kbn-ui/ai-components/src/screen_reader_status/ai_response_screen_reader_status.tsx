/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/react';
import { euiScreenReaderOnly } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

// Intervals grow by 5s each announcement, capped at 30s.
// e.g. announcements fire at: 0s, 5s, 15s, 30s, 50s, 75s, 105s, 135s, ...
const INITIAL_INTERVAL_MS = 5_000;
const INTERVAL_INCREMENT_MS = 5_000;
const MAX_INTERVAL_MS = 30_000;

const DEFAULT_ASSISTANT_NAME = i18n.translate(
  'kbnUI.aiComponents.screenReaderStatus.assistantName',
  {
    defaultMessage: 'Assistant',
  }
);

// Each "still generating" announcement includes elapsed seconds so the text always
// changes, ensuring the live region detects a new DOM mutation on every update.
const useGeneratingAnnouncements = (isActive: boolean, assistantName: string) => {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!isActive) {
      return;
    }

    setAnnouncement(
      i18n.translate('kbnUI.aiComponents.screenReaderStatus.generatingAnnouncement', {
        defaultMessage: '{assistantName} is generating a response.',
        values: { assistantName },
      })
    );

    let elapsed = 0;
    let nextDelay = INITIAL_INTERVAL_MS;
    let timeoutId: number;

    const scheduleNext = () => {
      timeoutId = window.setTimeout(() => {
        elapsed += nextDelay;
        setAnnouncement(
          i18n.translate('kbnUI.aiComponents.screenReaderStatus.stillGeneratingAnnouncement', {
            defaultMessage:
              '{assistantName} is still generating a response. {elapsed} seconds elapsed.',
            values: { assistantName, elapsed: Math.round(elapsed / 1000) },
          })
        );
        nextDelay = Math.min(nextDelay + INTERVAL_INCREMENT_MS, MAX_INTERVAL_MS);
        scheduleNext();
      }, nextDelay);
    };

    scheduleNext();

    return () => {
      clearTimeout(timeoutId);
      setAnnouncement('');
    };
  }, [isActive, assistantName]);

  return announcement;
};

export interface AiResponseScreenReaderStatusProps {
  /** Whether the assistant is currently generating the latest response. */
  isLoading: boolean;
  /**
   * Text of the latest assistant response. Announced in full once, when `isLoading`
   * transitions from `true` to `false`. Do not pass messages from earlier turns.
   */
  responseMessage?: string;
  /** Name used in the announcements, e.g. "Agent". Defaults to a translated "Assistant". */
  assistantName?: string;
}

/**
 * Visually hidden live regions that announce assistant progress to screen readers:
 * a periodic "still generating" heartbeat while `isLoading` is true, then the full
 * response once loading ends. Mount it once per conversation, next to (not around)
 * the visible message list. The streamed text itself must not be a live region,
 * otherwise screen readers read every chunk.
 */
export const AiResponseScreenReaderStatus = ({
  isLoading,
  responseMessage,
  assistantName = DEFAULT_ASSISTANT_NAME,
}: AiResponseScreenReaderStatusProps) => {
  const announcement = useGeneratingAnnouncements(isLoading, assistantName);

  const wasLoading = useRef(false);
  const [shouldAnnounceResponse, setShouldAnnounceResponse] = useState(false);

  useEffect(() => {
    if (isLoading) {
      wasLoading.current = true;
      setShouldAnnounceResponse(false);
    } else if (wasLoading.current) {
      setShouldAnnounceResponse(true);
    }
  }, [isLoading]);

  return (
    <div
      css={css`
        ${euiScreenReaderOnly()}
      `}
    >
      {/* Generating region: content changes on every interval so VoiceOver detects a new mutation */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {/* Response region: transitions from empty to message text when loading completes */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {shouldAnnounceResponse && responseMessage
          ? i18n.translate('kbnUI.aiComponents.screenReaderStatus.assistantResponse', {
              defaultMessage: '{assistantName} said: {message}',
              values: { assistantName, message: responseMessage },
            })
          : ''}
      </div>
    </div>
  );
};
