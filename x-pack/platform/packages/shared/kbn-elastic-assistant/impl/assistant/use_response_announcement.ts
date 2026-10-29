/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useState } from 'react';
import type { ClientMessage } from '../assistant_context/types';

interface Props {
  conversationId: string | undefined;
  /** The conversation the send in progress created for a new chat's first message. */
  createdConversationId: string | undefined;
  isLoadingChatSend: boolean;
  /** True while the streaming reply is being received. It outlives a conversation switch. */
  isStreaming: boolean;
  lastMessage: ClientMessage | undefined;
  /** Counts the new chats opened so far. An unsaved new chat has the id '', like the one it replaces. */
  newChatCount: number;
}

/**
 * Decides when the screen reader status treats the assistant as generating, and whether the
 * latest reply belongs to a turn the user started in the conversation they are looking at.
 *
 * - A turn starts when sending or regenerating starts loading.
 * - It is dropped when the user switches conversation or starts a new chat, so a stale
 *   streaming flag or another conversation's last reply is never announced. A new chat opened
 *   while another unsaved new chat is sending keeps the id '', so it is told apart by the count
 *   of new chats. The conversation a send creates for a new chat's first message changes the id
 *   from '' to the created id, and the first conversation loads from undefined; neither is a
 *   switch.
 * - A send that finishes after the user left its chat can bring that chat back on screen. The
 *   turn stays dropped: the user chose to leave, so nothing is announced for it.
 * - It counts as generating from send until the stream ends, including the moments after the
 *   send request returned and before the reply reports it is streaming, so the heartbeat does not
 *   restart mid-turn.
 * - A stopped stream ends the turn without a reply, so nothing is announced. Errors reported by
 *   the server are stored as the reply and are announced once the conversation is refetched.
 *   If reading the stream itself fails and the server stored no reply, the thread shows
 *   "Failed to load response" and no reply text exists to read, so nothing is announced.
 */
export const useResponseAnnouncement = ({
  conversationId,
  createdConversationId,
  isLoadingChatSend,
  isStreaming,
  lastMessage,
  newChatCount,
}: Props): { isGenerating: boolean; isTurnActive: boolean } => {
  const [isTurnActive, setIsTurnActive] = useState(false);
  const [hasStreamStarted, setHasStreamStarted] = useState(false);
  const [previousConversationId, setPreviousConversationId] = useState(conversationId);
  const [previousNewChatCount, setPreviousNewChatCount] = useState(newChatCount);
  const [wasLoadingChatSend, setWasLoadingChatSend] = useState(false);

  // derived during render, not in an effect, so no render sees the new conversation with the old turn
  if (previousConversationId !== conversationId) {
    setPreviousConversationId(conversationId);
    // only the id the send itself created is exempt: opening any other conversation from a new
    // chat is a switch, even while its first message is still sending. A send clears the created
    // id when it starts, so an id left from an earlier send cannot exempt a later switch.
    const isInitialLoadOrFirstMessage =
      previousConversationId === undefined ||
      (previousConversationId === '' &&
        conversationId !== undefined &&
        conversationId === createdConversationId);
    if (!isInitialLoadOrFirstMessage) {
      setIsTurnActive(false);
    }
  }

  // a new chat replaces the one on screen even though both are unsaved and share the id ''
  if (previousNewChatCount !== newChatCount) {
    setPreviousNewChatCount(newChatCount);
    setIsTurnActive(false);
  }

  // also derived during render: the turn is active in the very render that starts sending, so the
  // generating status begins with the send and the heartbeat is not delayed by an effect
  if (wasLoadingChatSend !== isLoadingChatSend) {
    setWasLoadingChatSend(isLoadingChatSend);
    if (isLoadingChatSend) {
      setIsTurnActive(true);
      setHasStreamStarted(false);
    }
  }

  useEffect(() => {
    if (isTurnActive && isStreaming) {
      setHasStreamStarted(true);
    }
  }, [isTurnActive, isStreaming]);

  const isReplyAwaitingStream =
    lastMessage?.role === 'assistant' && !lastMessage.content && lastMessage.reader != null;

  return {
    isTurnActive,
    // every term is gated by the turn: a send that is still in flight when the user switches
    // conversation belongs to the conversation they left
    isGenerating:
      isTurnActive &&
      (isLoadingChatSend || isStreaming || (isReplyAwaitingStream && !hasStreamStarted)),
  };
};
