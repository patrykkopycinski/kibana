/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { ChatState } from '@kbn/observability-ai-assistant-plugin/public';
import { useAnnounceableReply } from './use_announceable_reply';

describe('useAnnounceableReply', () => {
  type Props = Parameters<typeof useAnnounceableReply>[0];

  const setup = (initial: Props) => {
    const { result, rerender } = renderHook((props: Props) => useAnnounceableReply(props), {
      initialProps: initial,
    });
    return { result, update: (next: Props) => rerender(next) };
  };

  it('keeps the reply of a new conversation when it gets its id after the reply finished', () => {
    const { result, update } = setup({
      chatState: ChatState.Loading,
      conversationId: undefined,
      lastReplyText: 'The checkout service is slow.',
    });
    update({
      chatState: ChatState.Ready,
      conversationId: undefined,
      lastReplyText: 'The checkout service is slow.',
    });
    expect(result.current).toBe('The checkout service is slow.');

    update({
      chatState: ChatState.Ready,
      conversationId: 'created',
      lastReplyText: 'The checkout service is slow.',
    });

    expect(result.current).toBe('The checkout service is slow.');
  });

  it('keeps the reply when the id arrives in the same update that finishes it', () => {
    const { result, update } = setup({
      chatState: ChatState.Loading,
      conversationId: undefined,
      lastReplyText: 'The checkout service is slow.',
    });
    update({
      chatState: ChatState.Ready,
      conversationId: 'created',
      lastReplyText: 'The checkout service is slow.',
    });

    expect(result.current).toBe('The checkout service is slow.');
  });

  it('keeps the reply when the id arrives after an intermediate render without a conversation', () => {
    const { result, update } = setup({
      chatState: ChatState.Loading,
      conversationId: undefined,
      lastReplyText: 'The checkout service is slow.',
    });
    update({
      chatState: ChatState.Ready,
      conversationId: undefined,
      lastReplyText: 'The checkout service is slow.',
    });
    update({
      chatState: ChatState.Ready,
      conversationId: undefined,
      lastReplyText: 'The checkout service is slow.',
    });
    update({
      chatState: ChatState.Ready,
      conversationId: 'created',
      lastReplyText: 'The checkout service is slow.',
    });

    expect(result.current).toBe('The checkout service is slow.');
  });

  it('stays silent when a stored conversation gets its id while idle', () => {
    const { result, update } = setup({ chatState: ChatState.Ready, conversationId: undefined });
    update({
      chatState: ChatState.Ready,
      conversationId: 'stored',
      lastReplyText: 'An old reply.',
    });

    expect(result.current).toBeUndefined();
  });

  it('still drops the reply when the conversation changes from one id to another', () => {
    const { result, update } = setup({
      chatState: ChatState.Loading,
      conversationId: 'first',
      lastReplyText: 'First reply.',
    });
    update({ chatState: ChatState.Ready, conversationId: 'first', lastReplyText: 'First reply.' });
    expect(result.current).toBe('First reply.');

    update({ chatState: ChatState.Ready, conversationId: 'second', lastReplyText: 'Other.' });

    expect(result.current).toBeUndefined();
  });

  it('still drops the reply when the user starts a new chat', () => {
    const { result, update } = setup({
      chatState: ChatState.Loading,
      conversationId: 'first',
      lastReplyText: 'First reply.',
    });
    update({ chatState: ChatState.Ready, conversationId: 'first', lastReplyText: 'First reply.' });

    update({ chatState: ChatState.Ready, conversationId: undefined });

    expect(result.current).toBeUndefined();
  });
});
