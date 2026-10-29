/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core-http-browser';
import { useSendMessage } from '../use_send_message';
import { useConversation } from '../use_conversation';
import { emptyWelcomeConvo, welcomeConvo } from '../../mock/conversation';
import type { UseChatSendProps } from './use_chat_send';
import { useChatSend } from './use_chat_send';
import { waitFor, renderHook, act } from '@testing-library/react';
import { TestProviders } from '../../mock/test_providers/test_providers';
import { useAssistantContext } from '../../..';

jest.mock('../use_send_message');
jest.mock('../use_conversation');
jest.mock('../../..');

const setSelectedPromptContexts = jest.fn();
const sendMessage = jest.fn();
const removeLastMessage = jest.fn();
const clearConversation = jest.fn();
const setCurrentConversation = jest.fn();

export const testProps: UseChatSendProps = {
  selectedPromptContexts: {},
  currentConversation: { ...emptyWelcomeConvo, id: 'an-id' },
  http: {
    basePath: {
      basePath: '/mfg',
      serverBasePath: '/mfg',
    },
    anonymousPaths: {},
    externalUrl: {},
  } as unknown as HttpSetup,
  setSelectedPromptContexts,
  setCurrentConversation,
  refetchCurrentUserConversations: jest.fn(),
};
const robotMessage = { response: 'Response message from the robot', isError: false };
const reportAssistantMessageSent = jest.fn();
describe('use chat send', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSendMessage as jest.Mock).mockReturnValue({
      isLoading: false,
      sendMessage: sendMessage.mockReturnValue(robotMessage),
    });
    (useConversation as jest.Mock).mockReturnValue({
      removeLastMessage,
      clearConversation,
    });
    (useAssistantContext as jest.Mock).mockReturnValue({
      assistantTelemetry: {
        reportAssistantMessageSent,
      },
      assistantAvailability: {
        isAssistantEnabled: true,
      },
    });
  });
  it('handleOnChatCleared clears the conversation', async () => {
    (clearConversation as jest.Mock).mockReturnValueOnce(testProps.currentConversation);
    const { result } = renderHook(() => useChatSend(testProps), {
      wrapper: TestProviders,
    });
    await waitFor(() => new Promise((resolve) => resolve(null)));
    act(() => {
      result.current.handleOnChatCleared();
    });
    expect(clearConversation).toHaveBeenCalled();
    expect(result.current.userPrompt).toEqual('');
    expect(setSelectedPromptContexts).toHaveBeenCalledWith({});
    await waitFor(() => {
      expect(clearConversation).toHaveBeenCalledWith(testProps.currentConversation);
      expect(setCurrentConversation).toHaveBeenCalled();
    });
  });

  it('handleChatSend sends message with only provided prompt text and context already exists in convo history', async () => {
    const promptText = 'prompt text';
    const { result } = renderHook(
      () =>
        useChatSend({ ...testProps, currentConversation: { ...welcomeConvo, id: 'welcome-id' } }),
      {
        wrapper: TestProviders,
      }
    );

    result.current.handleChatSend(promptText);

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalled();
      const messages = setCurrentConversation.mock.calls[0][0].messages;
      expect(messages[messages.length - 1].content).toEqual(promptText);
    });
  });
  it('handleRegenerateResponse removes the last message of the conversation, resends the convo to GenAI, and appends the message received', async () => {
    const { result } = renderHook(
      () =>
        useChatSend({ ...testProps, currentConversation: { ...welcomeConvo, id: 'welcome-id' } }),
      {
        wrapper: TestProviders,
      }
    );

    await waitFor(() => new Promise((resolve) => resolve(null)));
    act(() => {
      result.current.handleRegenerateResponse();
    });
    expect(removeLastMessage).toHaveBeenCalledWith('welcome-id');

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalled();
      const messages = setCurrentConversation.mock.calls[1][0].messages;
      expect(messages[messages.length - 1].content).toEqual(robotMessage.response);
    });
  });
  it('handleRegenerateResponse reports loading until the new response is stored', async () => {
    let resolveSend: (value: unknown) => void = () => {};
    sendMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSend = resolve;
      })
    );
    const { result } = renderHook(
      () =>
        useChatSend({ ...testProps, currentConversation: { ...welcomeConvo, id: 'welcome-id' } }),
      {
        wrapper: TestProviders,
      }
    );
    expect(result.current.isLoading).toBe(false);

    act(() => {
      result.current.handleRegenerateResponse();
    });
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSend(robotMessage);
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('handleRegenerateResponse stops reporting loading when sending fails', async () => {
    sendMessage.mockRejectedValueOnce(new Error('send failed'));
    const { result } = renderHook(
      () =>
        useChatSend({ ...testProps, currentConversation: { ...welcomeConvo, id: 'welcome-id' } }),
      {
        wrapper: TestProviders,
      }
    );

    await act(async () => {
      try {
        await result.current.handleRegenerateResponse();
      } catch (e) {
        expect(e).toEqual(new Error('send failed'));
      }
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
  it('sends telemetry events for both user and assistant', async () => {
    const promptText = 'prompt text';
    const { result } = renderHook(() => useChatSend(testProps), {
      wrapper: TestProviders,
    });
    await waitFor(() => new Promise((resolve) => resolve(null)));
    act(() => {
      result.current.handleChatSend(promptText);
    });

    await waitFor(() => {
      expect(reportAssistantMessageSent).toHaveBeenNthCalledWith(1, {
        role: 'user',
        actionTypeId: '.gen-ai',
        model: undefined,
        provider: 'OpenAI',
        isEnabledKnowledgeBase: false,
      });
      expect(reportAssistantMessageSent).toHaveBeenNthCalledWith(2, {
        role: 'assistant',
        actionTypeId: '.gen-ai',
        model: undefined,
        provider: 'OpenAI',
        isEnabledKnowledgeBase: false,
      });
    });
  });
  it('retries getConversation up to 5 times if title is empty, and stops when title is found', async () => {
    const promptText = 'test prompt';
    const getConversationMock = jest.fn();
    // First 3 calls return empty title, 4th returns non-empty
    getConversationMock
      .mockResolvedValueOnce({ title: '' })
      .mockResolvedValueOnce({ title: '' })
      .mockResolvedValueOnce({ title: '' })
      .mockResolvedValueOnce({ title: 'Final Title' });
    (useConversation as jest.Mock).mockReturnValue({
      removeLastMessage,
      clearConversation,
      getConversation: getConversationMock,
      createConversation: jest.fn(),
    });
    const { result } = renderHook(
      () =>
        useChatSend({
          ...testProps,
          currentConversation: { ...emptyWelcomeConvo, id: 'convo-id', title: '' },
        }),
      { wrapper: TestProviders }
    );
    await act(async () => {
      await result.current.handleChatSend(promptText);
    });
    // Should call getConversation 4 times (until non-empty title)
    expect(getConversationMock).toHaveBeenCalledTimes(4);
    expect(getConversationMock).toHaveBeenLastCalledWith('convo-id');
  });

  it('exposes the id of the conversation a send created and clears it when the next send starts', async () => {
    const createConversation = jest.fn().mockResolvedValue({ ...welcomeConvo, id: 'created-id' });
    (useConversation as jest.Mock).mockReturnValue({
      removeLastMessage,
      clearConversation,
      createConversation,
      getConversation: jest.fn().mockResolvedValue({ ...welcomeConvo, id: 'created-id' }),
    });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useChatSend({ ...testProps, currentConversation: { ...emptyWelcomeConvo, id } }),
      { wrapper: TestProviders, initialProps: { id: '' } }
    );
    expect(result.current.createdConversationId).toBeUndefined();

    await act(async () => {
      await result.current.handleChatSend('first message');
    });
    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(result.current.createdConversationId).toBe('created-id');

    // a later send in an existing conversation does not create one
    rerender({ id: 'created-id' });
    await act(async () => {
      await result.current.handleChatSend('second message');
    });
    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(result.current.createdConversationId).toBeUndefined();
  });
});
