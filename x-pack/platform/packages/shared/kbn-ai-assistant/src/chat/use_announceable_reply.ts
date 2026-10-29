/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useState } from 'react';
import { ChatState } from '@kbn/observability-ai-assistant-plugin/public';

interface Props {
  chatState: ChatState;
  conversationId?: string;
  /** Text of the last message when it is a finished natural-language assistant reply. */
  lastReplyText?: string;
}

/**
 * Returns the reply the screen reader may read out, or undefined while it must stay silent.
 * A turn is read out only when it ends in one of these ways:
 *
 * - `Ready`: the reply is complete.
 * - `Error` with a reply that was never shown while streaming, which is the token limit
 *   explanation that takes the place of a reply. Any other error leaves the partial reply in the
 *   timeline; it is not read out because the error toast already announces the failure.
 *
 * `Aborted` stays silent: the user pressed Stop and knows the reply was cut short, and reading
 * the partial text aloud would be more noise than help.
 *
 * A turn is dropped when the user switches conversation or starts a new chat, so another
 * conversation's last reply is never read out. A conversation that only gets its id while its
 * first message is being answered is not a switch.
 */
export const useAnnounceableReply = ({
  chatState,
  conversationId,
  lastReplyText,
}: Props): string | undefined => {
  const isLoading = chatState === ChatState.Loading;
  const [previous, setPrevious] = useState({ chatState, conversationId });
  const [isTurnActive, setIsTurnActive] = useState(isLoading);
  const [isReplyAnnounceable, setIsReplyAnnounceable] = useState(false);
  const [streamedReplyText, setStreamedReplyText] = useState<string>();

  // everything below is derived during render, not in effects, so no render pairs the new
  // conversation or chat state with the previous turn
  if (isLoading && lastReplyText !== streamedReplyText) {
    setStreamedReplyText(lastReplyText);
  }

  if (previous.chatState !== chatState || previous.conversationId !== conversationId) {
    setPrevious({ chatState, conversationId });

    const isCreatingConversation = previous.conversationId === undefined && isLoading;
    const hasSwitched = previous.conversationId !== conversationId && !isCreatingConversation;
    const hasStarted = isLoading && previous.chatState !== ChatState.Loading;
    const hasEnded = !isLoading && previous.chatState === ChatState.Loading;

    if (hasSwitched) {
      setIsTurnActive(false);
      setIsReplyAnnounceable(false);
    } else if (hasStarted) {
      setIsTurnActive(true);
      setIsReplyAnnounceable(false);
      setStreamedReplyText(lastReplyText);
    } else if (hasEnded) {
      const isUnstreamedReply = lastReplyText !== undefined && lastReplyText !== streamedReplyText;
      setIsReplyAnnounceable(
        isTurnActive &&
          (chatState === ChatState.Ready || (chatState === ChatState.Error && isUnstreamedReply))
      );
    }
  }

  return isReplyAnnounceable ? lastReplyText : undefined;
};
