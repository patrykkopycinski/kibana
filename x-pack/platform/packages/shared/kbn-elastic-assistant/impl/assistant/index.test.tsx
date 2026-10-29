/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ComponentProps } from 'react';
import React, { useEffect, useState } from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Assistant } from '.';
import { useLoadConnectors } from '@kbn/inference-connectors';
import type { UseLoadConnectorsResult } from '@kbn/inference-connectors';

import useLocalStorage from 'react-use/lib/useLocalStorage';
import useSessionStorage from 'react-use/lib/useSessionStorage';
import { QuickPrompts } from './quick_prompts/quick_prompts';
import { TestProviders } from '../mock/test_providers/test_providers';
import type { ClientMessage, GetAssistantMessages } from '../assistant_context/types';
import type { FetchCurrentUserConversations } from './api';
import { useFetchCurrentUserConversations } from './api';
import * as all from './chat_send/use_chat_send';
import { useConversation } from './use_conversation';
import * as sendMessageModule from './use_send_message';
import type { FetchAnonymizationFields } from './api/anonymization_fields/use_fetch_anonymization_fields';
import { useFetchAnonymizationFields } from './api/anonymization_fields/use_fetch_anonymization_fields';
import { welcomeConvo } from '../mock/conversation';
import {
  CONTENT_REFERENCES_VISIBLE_LOCAL_STORAGE_KEY,
  DEFAULT_KNOWLEDGE_BASE_SETTINGS,
  KNOWLEDGE_BASE_LOCAL_STORAGE_KEY,
  LAST_CONVERSATION_ID_LOCAL_STORAGE_KEY,
  LAST_SELECTED_CONVERSATION_LOCAL_STORAGE_KEY,
  SHOW_ANONYMIZED_VALUES_LOCAL_STORAGE_KEY,
  STREAMING_LOCAL_STORAGE_KEY,
} from '../assistant_context/constants';

jest.mock('@kbn/inference-connectors');
jest.mock('../connectorland/connector_setup');
jest.mock('react-use/lib/useLocalStorage');
jest.mock('react-use/lib/useSessionStorage');

jest.mock('./quick_prompts/quick_prompts', () => ({ QuickPrompts: jest.fn() }));
jest.mock('./api/conversations/use_fetch_current_user_conversations');
jest.mock('./api/anonymization_fields/use_fetch_anonymization_fields');

jest.mock('./use_conversation');
const apiConfig = { connectorId: '123' };
const fullWelcomeConversation = {
  ...welcomeConvo,
  id: 'welcome_id',
  apiConfig,
  isConversationOwner: true,
};
const fullSheepConversation = {
  ...welcomeConvo,
  id: 'electric_sheep_id',
  title: 'electric sheep',
  category: 'assistant',
  messages: [],
  replacements: {},
  apiConfig,
  updatedAt: '2024-10-10T22:07:44.915Z',
  isConversationOwner: true,
};

const mockData = {
  welcome_id: fullWelcomeConversation,
  electric_sheep_id: fullSheepConversation,
};

const { useChatSend: actualUseChatSend } = all;

const renderAssistant = async (
  extraProps = {},
  providerContext?: ComponentProps<typeof TestProviders>['providerContext']
) => {
  const chatSendSpy = jest.spyOn(all, 'useChatSend');
  const assistant = render(
    <TestProviders providerContext={providerContext}>
      <Assistant
        lastConversation={{ id: 'welcome_id' }}
        chatHistoryVisible={true}
        setChatHistoryVisible={jest.fn()}
        {...extraProps}
      />
    </TestProviders>
  );
  await waitFor(() => {
    // wait for conversation to mount before performing any tests
    expect(chatSendSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        currentConversation: expect.objectContaining({ apiConfig }),
      })
    );
  });
  return assistant;
};
const mockDeleteConvo = jest.fn();
const clearConversation = jest.fn();
const mockUseConversation = {
  clearConversation: clearConversation.mockResolvedValue(fullWelcomeConversation),
  getConversation: jest.fn().mockResolvedValue(fullWelcomeConversation),
  deleteConversation: mockDeleteConvo,
  setApiConfig: jest.fn().mockResolvedValue({}),
};

const mockAnonymizationFields: FetchAnonymizationFields = {
  refetch: jest.fn(),
  data: { page: 1, perPage: 20, total: 0, data: [] },
  isFetching: false,
  isError: false,
  isLoading: false,
  isFetched: true,
};

const refetchResults = jest.fn();
const defaultFetchUserConversations = {
  data: mockData,
  isLoading: false,
  refetch: refetchResults.mockResolvedValue({
    isLoading: false,
    data: {
      pages: [
        {
          page: 1,
          perPage: 28,
          total: 150,
          data: Object.values(mockData),
        },
      ],
    },
  }),
  isFetched: true,
  isFetching: false,
  setPaginationObserver: jest.fn(),
};
describe('Assistant', () => {
  let persistToLocalStorage: jest.Mock;
  let persistToSessionStorage: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    persistToLocalStorage = jest.fn();
    persistToSessionStorage = jest.fn();
    (useConversation as jest.Mock).mockReturnValue(mockUseConversation);

    jest.mocked(QuickPrompts).mockReturnValue(null);
    const connectors: unknown[] = [
      {
        id: 'hi',
        name: 'OpenAI connector',
        actionTypeId: '.gen-ai',
      },
    ];

    jest.mocked(useLoadConnectors).mockReturnValue({
      isFetched: true,
      isFetchedAfterMount: true,
      data: connectors,
    } as unknown as UseLoadConnectorsResult);

    jest
      .mocked(useFetchCurrentUserConversations)
      .mockReturnValue(defaultFetchUserConversations as unknown as FetchCurrentUserConversations);

    jest.mocked(useFetchAnonymizationFields).mockReturnValue(mockAnonymizationFields);

    const localStorageDefaults: Array<[string, unknown]> = [
      [LAST_SELECTED_CONVERSATION_LOCAL_STORAGE_KEY, mockData.welcome_id],
      [LAST_CONVERSATION_ID_LOCAL_STORAGE_KEY, mockData.welcome_id.id],
      [SHOW_ANONYMIZED_VALUES_LOCAL_STORAGE_KEY, false],
      [CONTENT_REFERENCES_VISIBLE_LOCAL_STORAGE_KEY, true],
      [STREAMING_LOCAL_STORAGE_KEY, true],
      [KNOWLEDGE_BASE_LOCAL_STORAGE_KEY, DEFAULT_KNOWLEDGE_BASE_SETTINGS],
    ];

    jest.mocked(useLocalStorage).mockImplementation((key, initialValue) => {
      const match = localStorageDefaults.find(([storageKey]) => key.includes(storageKey));
      const value = match ? match[1] : initialValue;
      return [value, persistToLocalStorage] as unknown as ReturnType<typeof useLocalStorage>;
    });

    jest
      .mocked(useSessionStorage)
      .mockReturnValue([undefined, persistToSessionStorage] as unknown as ReturnType<
        typeof useSessionStorage
      >);
  });

  describe('persistent storage', () => {
    it('should delete conversation when delete button is clicked', async () => {
      await renderAssistant();
      const openConversationMenu = screen.getAllByTestId('aiAssistantFlyoutNavigationToggle')[0];
      await act(async () => {
        fireEvent.click(openConversationMenu);
      });
      // selecting first conversation proves sort by updatedAt is working
      const contextMenuButton = screen.getAllByTestId('convo-context-menu-button')[0];
      await act(async () => {
        fireEvent.click(contextMenuButton);
      });
      const deleteButton = screen.getByTestId('convo-context-menu-item-delete');
      await act(async () => {
        fireEvent.click(deleteButton);
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      });

      await waitFor(() => {
        expect(mockDeleteConvo).toHaveBeenCalledWith(mockData.electric_sheep_id.id);
      });
    });
    it('should refetchCurrentUserConversations after clear chat history button click', async () => {
      const getConversation = jest.fn().mockResolvedValue(fullSheepConversation);
      (useConversation as jest.Mock).mockReturnValue({
        ...mockUseConversation,
        getConversation,
      });
      await renderAssistant();
      fireEvent.click(screen.getByTestId('conversation-settings-menu'));
      fireEvent.click(screen.getByTestId('clear-chat'));
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));
      await waitFor(() => {
        expect(clearConversation).toHaveBeenCalled();
        expect(refetchResults).toHaveBeenCalled();
      });
    });
  });

  describe('when selected conversation changes and some connectors are loaded', () => {
    it('should persist the conversation id to local storage', async () => {
      const getConversation = jest.fn().mockResolvedValue(fullSheepConversation);
      (useConversation as jest.Mock).mockReturnValue({
        ...mockUseConversation,
        getConversation,
      });
      await renderAssistant();

      expect(persistToLocalStorage).toHaveBeenCalled();

      expect(persistToLocalStorage).toHaveBeenLastCalledWith({ id: mockData.welcome_id.id });

      const previousConversationButton = (
        await screen.findAllByText(mockData.electric_sheep_id.title)
      )[0];
      expect(previousConversationButton).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(previousConversationButton);
      });

      expect(persistToLocalStorage).toHaveBeenLastCalledWith({ id: 'electric_sheep_id' });
    });

    it('should fetch current conversation when id has value', async () => {
      const getConversation = jest.fn().mockResolvedValue(fullSheepConversation);
      (useConversation as jest.Mock).mockReturnValue({
        ...mockUseConversation,
        getConversation,
      });
      jest.mocked(useFetchCurrentUserConversations).mockReturnValue({
        ...defaultFetchUserConversations,
        data: {
          ...mockData,
          electric_sheep_id: { ...mockData.electric_sheep_id, title: 'updated title' },
        },
        refetch: refetchResults.mockResolvedValue({
          isLoading: false,
          data: {
            pages: [
              {
                page: 1,
                perPage: 28,
                total: 150,
                data: [
                  mockData.welcome_id,
                  { ...mockData.electric_sheep_id, title: 'updated title' },
                ],
              },
            ],
          },
        }),
      } as unknown as FetchCurrentUserConversations);
      await renderAssistant();

      const previousConversationButton = await screen.findByText('updated title');
      await act(async () => {
        fireEvent.click(previousConversationButton);
      });

      expect(getConversation).toHaveBeenCalled();

      expect(persistToLocalStorage).toHaveBeenLastCalledWith({ id: 'electric_sheep_id' });
    });
  });

  describe('when no connectors are loaded', () => {
    it('should set welcome conversation id in local storage', async () => {
      await renderAssistant();

      expect(persistToLocalStorage).toHaveBeenCalled();
      expect(persistToLocalStorage).toHaveBeenLastCalledWith({ id: mockData.welcome_id.id });
    });
  });

  describe('when no connectors exist and user can create them', () => {
    it('enables header controls while chat stays disabled', async () => {
      const noConnectorConversation = {
        ...welcomeConvo,
        id: 'welcome_id',
        title: welcomeConvo.title,
        category: welcomeConvo.category,
        messages: welcomeConvo.messages,
        replacements: welcomeConvo.replacements,
        createdBy: welcomeConvo.createdBy,
        users: welcomeConvo.users,
        createdAt: welcomeConvo.createdAt,
        apiConfig: { ...welcomeConvo.apiConfig, connectorId: '' },
        isConversationOwner: true,
      };

      const noConnectorData = {
        welcome_id: noConnectorConversation,
      };

      jest.mocked(useLoadConnectors).mockReturnValue({
        isFetched: true,
        isFetchedAfterMount: true,
        data: [],
      } as unknown as UseLoadConnectorsResult);

      jest.mocked(useFetchCurrentUserConversations).mockReturnValue({
        ...defaultFetchUserConversations,
        data: noConnectorData,
      } as unknown as FetchCurrentUserConversations);

      render(
        <TestProviders>
          <Assistant
            lastConversation={{ id: 'welcome_id' }}
            chatHistoryVisible={true}
            setChatHistoryVisible={jest.fn()}
          />
        </TestProviders>
      );

      const addConnectorButton = await screen.findByTestId('addNewConnectorButton');
      expect(addConnectorButton).toBeEnabled();
      expect(screen.getByTestId('chat-context-menu')).toBeEnabled();
      expect(screen.getByTestId('prompt-textarea')).toBeDisabled();
    });
  });

  describe('when connectors exist', () => {
    it('shows the connector selector instead of add button', async () => {
      const connectors: unknown[] = [
        {
          id: 'connector-1',
          name: 'OpenAI connector',
          actionTypeId: '.gen-ai',
        },
      ];
      jest.mocked(useLoadConnectors).mockReturnValue({
        isFetched: true,
        isFetchedAfterMount: true,
        data: connectors,
      } as unknown as UseLoadConnectorsResult);

      await renderAssistant();

      expect(screen.queryByTestId('addNewConnectorButton')).not.toBeInTheDocument();
      expect(screen.getByTestId('connector-selector')).toBeEnabled();
    });
  });

  describe('screen reader announcements', () => {
    const userMessage: ClientMessage = {
      content: 'What happened?',
      role: 'user',
      timestamp: '2024-10-10T22:07:44.915Z',
    };
    const assistantMessage: ClientMessage = {
      content: 'A host was isolated.{reference(abcde)}',
      role: 'assistant',
      timestamp: '2024-10-10T22:07:46.915Z',
    };
    const getAnnouncements = () => screen.getAllByRole('status').map((el) => el.textContent);

    let setChatSendLoading: (isLoading: boolean) => void;
    let setCreatedConversationId: (id: string | undefined) => void;
    let chatSendSpy: jest.SpyInstance;
    let chatSendProps: Parameters<typeof actualUseChatSend>[0];

    const mockChatSendLoading = (initialIsLoading: boolean) => {
      chatSendSpy = jest.spyOn(all, 'useChatSend').mockImplementation((props) => {
        chatSendProps = props;
        const [isLoading, setIsLoading] = useState(initialIsLoading);
        const [createdConversationId, setCreatedId] = useState<string>();
        useEffect(() => {
          setChatSendLoading = setIsLoading;
          setCreatedConversationId = setCreatedId;
        }, []);
        return { ...actualUseChatSend(props), isLoading, createdConversationId };
      });
    };

    const mockConversationWithMessages = (messages: ClientMessage[]) => {
      const conversation = { ...fullWelcomeConversation, messages };
      jest.mocked(useFetchCurrentUserConversations).mockReturnValue({
        ...defaultFetchUserConversations,
        data: { ...mockData, welcome_id: conversation },
      } as unknown as FetchCurrentUserConversations);
      (useConversation as jest.Mock).mockReturnValue({
        ...mockUseConversation,
        getConversation: jest.fn().mockResolvedValue(conversation),
      });
    };

    afterEach(() => {
      chatSendSpy?.mockRestore();
    });

    it('announces the last reply once, without content references, when loading finishes', async () => {
      mockChatSendLoading(true);
      mockConversationWithMessages([userMessage, assistantMessage]);
      await renderAssistant();

      const [generating, response] = getAnnouncements();
      expect(generating).toBe('Assistant is generating a response.');
      expect(response).toBe('');

      await act(async () => {
        setChatSendLoading(false);
      });

      expect(getAnnouncements()).toEqual(['', 'Assistant said: A host was isolated.']);
      expect(screen.getAllByText('Assistant said: A host was isolated.')).toHaveLength(1);
    });

    it('announces nothing when a finished conversation is opened', async () => {
      mockChatSendLoading(false);
      mockConversationWithMessages([userMessage, assistantMessage]);
      await renderAssistant();

      expect(getAnnouncements()).toEqual(['', '']);
    });

    it('does not announce the previous reply while the last message is the user prompt', async () => {
      mockChatSendLoading(true);
      mockConversationWithMessages([userMessage, assistantMessage, userMessage]);
      await renderAssistant();

      await act(async () => {
        setChatSendLoading(false);
      });

      expect(getAnnouncements()).toEqual(['', '']);
    });

    describe('with streamed replies', () => {
      const otherReply: ClientMessage = {
        content: 'Another conversation reply.',
        role: 'assistant',
        timestamp: '2024-10-10T22:07:46.915Z',
      };
      const streamingReply: ClientMessage = {
        role: 'assistant',
        reader: {} as ReadableStreamDefaultReader<Uint8Array>,
        timestamp: '2024-10-10T22:07:46.915Z',
      };

      type CommentArgs = Parameters<GetAssistantMessages>[0];
      let commentArgs: CommentArgs;
      let streamingConversationId: string | undefined;
      let setFakeStreaming: (isStreaming: boolean) => void;

      // Mirrors how StreamComment reports its stream: it reports on mount and every change, and
      // like the shipped component before the fix it does not reset the flag when it unmounts.
      const FakeStreamComment = ({
        initialStreaming,
        setIsStreaming,
      }: {
        initialStreaming: boolean;
        setIsStreaming: (isStreaming: boolean) => void;
      }) => {
        const [streaming, setStreaming] = useState(initialStreaming);
        useEffect(() => {
          setFakeStreaming = setStreaming;
        }, []);
        useEffect(() => {
          setIsStreaming(streaming);
        }, [streaming, setIsStreaming]);
        return null;
      };

      const fakeGetComments: GetAssistantMessages = (args) => {
        commentArgs = args;
        const { currentConversation, setIsStreaming } = args;
        // like the shipped getComments: an empty conversation renders no stream comment
        if (!currentConversation?.messages.length) {
          return [];
        }
        return [
          {
            username: 'Assistant',
            children: (
              <FakeStreamComment
                key={currentConversation.id}
                initialStreaming={streamingConversationId === currentConversation.id}
                setIsStreaming={setIsStreaming}
              />
            ),
          },
        ];
      };

      const renderWithFakeComments = (extraProps = {}) =>
        renderAssistant(extraProps, { getComments: fakeGetComments });

      const mockConversations = (welcomeMessages: ClientMessage[]) => {
        const welcome = { ...fullWelcomeConversation, messages: welcomeMessages };
        const sheep = { ...fullSheepConversation, messages: [userMessage, otherReply] };
        jest.mocked(useFetchCurrentUserConversations).mockReturnValue({
          ...defaultFetchUserConversations,
          data: { welcome_id: welcome, electric_sheep_id: sheep },
        } as unknown as FetchCurrentUserConversations);
        (useConversation as jest.Mock).mockReturnValue({
          ...mockUseConversation,
          getConversation: jest.fn(async (id: string) => (id === sheep.id ? sheep : welcome)),
        });
      };

      beforeEach(() => {
        streamingConversationId = undefined;
      });

      it('keeps announcing that the reply is being generated between sending and the first chunk', async () => {
        mockChatSendLoading(true);
        mockConversationWithMessages([userMessage, streamingReply]);
        await renderWithFakeComments();
        expect(getAnnouncements()[0]).toBe('Assistant is generating a response.');

        // the send request returned, the stream has not reported that it started yet
        await act(async () => {
          setChatSendLoading(false);
        });
        expect(getAnnouncements()).toEqual(['Assistant is generating a response.', '']);
      });

      it('announces the stored reply that only arrives after streaming ended', async () => {
        const finalReply: ClientMessage = { ...assistantMessage, content: 'Final stored reply.' };
        let isReplyStored = false;
        const pending = { ...fullWelcomeConversation, messages: [userMessage, streamingReply] };
        const stored = { ...fullWelcomeConversation, messages: [userMessage, finalReply] };
        mockChatSendLoading(true);
        jest.mocked(useFetchCurrentUserConversations).mockReturnValue({
          ...defaultFetchUserConversations,
          data: { ...mockData, welcome_id: pending },
        } as unknown as FetchCurrentUserConversations);
        (useConversation as jest.Mock).mockReturnValue({
          ...mockUseConversation,
          getConversation: jest.fn(async () => (isReplyStored ? stored : pending)),
        });
        streamingConversationId = 'welcome_id';
        await renderWithFakeComments();

        await act(async () => {
          setChatSendLoading(false);
        });
        expect(getAnnouncements()).toEqual(['Assistant is generating a response.', '']);

        // the stream ends first, the stored reply is refetched afterwards
        await act(async () => {
          setFakeStreaming(false);
        });
        expect(getAnnouncements()[1]).toBe('');

        isReplyStored = true;
        await act(async () => {
          await commentArgs.refetchCurrentConversation({ isStreamRefetch: true });
        });

        expect(getAnnouncements()).toEqual(['', 'Assistant said: Final stored reply.']);
      });

      it('announces nothing when the user opens another conversation while a reply is streaming', async () => {
        mockChatSendLoading(true);
        mockConversations([userMessage, streamingReply]);
        streamingConversationId = 'welcome_id';
        await renderWithFakeComments();
        await act(async () => {
          setChatSendLoading(false);
        });
        expect(getAnnouncements()[0]).toBe('Assistant is generating a response.');

        await act(async () => {
          fireEvent.click((await screen.findAllByText(mockData.electric_sheep_id.title))[0]);
        });

        // the other conversation's last reply must not be read out
        await waitFor(() => expect(getAnnouncements()).toEqual(['', '']));
        expect(screen.queryByText(/Another conversation reply/)).not.toBeInTheDocument();
      });

      it('stops announcing that a reply is being generated after New chat is chosen mid-stream', async () => {
        mockChatSendLoading(true);
        mockConversations([userMessage, streamingReply]);
        streamingConversationId = 'welcome_id';
        await renderWithFakeComments();
        await act(async () => {
          setChatSendLoading(false);
        });
        expect(getAnnouncements()[0]).toBe('Assistant is generating a response.');

        await act(async () => {
          fireEvent.click(screen.getByTestId('newChatFromOverlay'));
        });

        await waitFor(() => expect(getAnnouncements()).toEqual(['', '']));
      });

      it('announces the reply to the first message of a new chat once its conversation is created', async () => {
        mockChatSendLoading(false);
        mockConversations([userMessage, assistantMessage]);
        await renderWithFakeComments();
        await act(async () => {
          fireEvent.click(screen.getByTestId('newChatFromOverlay'));
        });

        // sending starts, then the conversation is created and gets its id and the reply is stored
        await act(async () => {
          setChatSendLoading(true);
        });
        await act(async () => {
          setCreatedConversationId('created_id');
          chatSendProps.setCurrentConversation({
            ...fullWelcomeConversation,
            apiConfig: { connectorId: '123', actionTypeId: '.gen-ai' },
            id: 'created_id',
            messages: [userMessage, assistantMessage],
          });
        });
        await act(async () => {
          setChatSendLoading(false);
        });

        expect(getAnnouncements()).toEqual(['', 'Assistant said: A host was isolated.']);
      });

      it('announces nothing when another conversation is opened from a new chat while its first message is sending', async () => {
        mockChatSendLoading(false);
        mockConversations([userMessage, assistantMessage]);
        await renderWithFakeComments();
        await act(async () => {
          fireEvent.click(screen.getByTestId('newChatFromOverlay'));
        });
        await act(async () => {
          setChatSendLoading(true);
        });
        expect(getAnnouncements()[0]).toBe('Assistant is generating a response.');

        // the first message has not created its conversation yet when another one is opened
        await act(async () => {
          fireEvent.click((await screen.findAllByText(mockData.electric_sheep_id.title))[0]);
        });
        await waitFor(() => expect(getAnnouncements()).toEqual(['', '']));

        await act(async () => {
          setChatSendLoading(false);
        });
        expect(getAnnouncements()).toEqual(['', '']);
        expect(screen.queryByText(/Another conversation reply/)).not.toBeInTheDocument();
      });

      it('announces the reply to the first message of a new chat when the default connector only arrives while it is sending', async () => {
        jest.mocked(useLoadConnectors).mockReturnValue({
          isFetched: true,
          isFetchedAfterMount: true,
          data: [],
        } as unknown as UseLoadConnectorsResult);
        mockChatSendLoading(false);
        mockConversations([userMessage, assistantMessage]);
        await renderWithFakeComments();
        await act(async () => {
          fireEvent.click(screen.getByTestId('newChatFromOverlay'));
        });
        // the new chat got its connector from the user, so it can send while it is still unsaved
        const chatApiConfig = { connectorId: '123', actionTypeId: '.gen-ai' };
        await act(async () => {
          chatSendProps.setCurrentConversation({
            ...fullWelcomeConversation,
            id: '',
            apiConfig: chatApiConfig,
          });
        });
        await act(async () => {
          setChatSendLoading(true);
        });
        expect(getAnnouncements()[0]).toBe('Assistant is generating a response.');

        // the default connector arrives mid-send. The new chat already has a connector, so it is
        // not replaced by a blank one
        jest.mocked(useLoadConnectors).mockReturnValue({
          isFetched: true,
          isFetchedAfterMount: true,
          data: [{ id: 'hi', name: 'OpenAI connector', actionTypeId: '.gen-ai' }],
        } as unknown as UseLoadConnectorsResult);
        await act(async () => {
          chatSendProps.setCurrentConversation({
            ...fullWelcomeConversation,
            id: '',
            apiConfig: chatApiConfig,
            messages: [userMessage],
          });
        });
        expect(getAnnouncements()[0]).toBe('Assistant is generating a response.');

        await act(async () => {
          setCreatedConversationId('created_id');
          chatSendProps.setCurrentConversation({
            ...fullWelcomeConversation,
            id: 'created_id',
            apiConfig: chatApiConfig,
            messages: [userMessage, assistantMessage],
          });
        });
        await act(async () => {
          setChatSendLoading(false);
        });

        expect(getAnnouncements()).toEqual(['', 'Assistant said: A host was isolated.']);
      });

      describe('when a new chat is opened while another new chat is sending its first message', () => {
        // both chats are unsaved and share the id '', so the id alone cannot tell them apart
        const sendFirstMessageThenOpenAnotherNewChat = async () => {
          mockChatSendLoading(false);
          mockConversations([userMessage, assistantMessage]);
          await renderWithFakeComments();
          await act(async () => {
            fireEvent.click(screen.getByTestId('newChatFromOverlay'));
          });
          await act(async () => {
            setChatSendLoading(true);
          });
          expect(getAnnouncements()[0]).toBe('Assistant is generating a response.');

          await act(async () => {
            fireEvent.click(screen.getByTestId('newChatFromOverlay'));
          });
        };

        it('stops announcing that a reply is being generated in the new chat', async () => {
          await sendFirstMessageThenOpenAnotherNewChat();

          await waitFor(() => expect(getAnnouncements()).toEqual(['', '']));
        });

        it('does not announce the abandoned chat when its send finishes and brings it back', async () => {
          await sendFirstMessageThenOpenAnotherNewChat();

          // the abandoned send creates its conversation and puts it back on screen
          await act(async () => {
            setCreatedConversationId('created_id');
            chatSendProps.setCurrentConversation({
              ...fullWelcomeConversation,
              apiConfig: { connectorId: '123', actionTypeId: '.gen-ai' },
              id: 'created_id',
              messages: [userMessage],
            });
          });
          await act(async () => {
            chatSendProps.setCurrentConversation({
              ...fullWelcomeConversation,
              apiConfig: { connectorId: '123', actionTypeId: '.gen-ai' },
              id: 'created_id',
              messages: [userMessage, assistantMessage],
            });
            setChatSendLoading(false);
          });

          expect(getAnnouncements()).toEqual(['', '']);
        });

        it('announces the reply to a message sent afterwards in the new chat', async () => {
          await sendFirstMessageThenOpenAnotherNewChat();
          await act(async () => {
            setChatSendLoading(false);
          });

          await act(async () => {
            setChatSendLoading(true);
          });
          await act(async () => {
            setCreatedConversationId('second_id');
            chatSendProps.setCurrentConversation({
              ...fullWelcomeConversation,
              apiConfig: { connectorId: '123', actionTypeId: '.gen-ai' },
              id: 'second_id',
              messages: [userMessage, assistantMessage],
            });
          });
          await act(async () => {
            setChatSendLoading(false);
          });

          expect(getAnnouncements()).toEqual(['', 'Assistant said: A host was isolated.']);
        });
      });

      it('announces nothing when another conversation is opened while the reply is being refetched after its stream', async () => {
        jest.useFakeTimers();
        const pending = { ...fullWelcomeConversation, messages: [userMessage, streamingReply] };
        const stored = { ...fullWelcomeConversation, messages: [userMessage, assistantMessage] };
        const sheep = { ...fullSheepConversation, messages: [userMessage, otherReply] };
        let isReplyStored = false;
        mockChatSendLoading(true);
        jest.mocked(useFetchCurrentUserConversations).mockReturnValue({
          ...defaultFetchUserConversations,
          data: { welcome_id: pending, electric_sheep_id: sheep },
        } as unknown as FetchCurrentUserConversations);
        (useConversation as jest.Mock).mockReturnValue({
          ...mockUseConversation,
          getConversation: jest.fn(async (id: string) =>
            id === sheep.id ? sheep : isReplyStored ? stored : pending
          ),
        });
        streamingConversationId = 'welcome_id';
        await renderWithFakeComments();
        await act(async () => {
          setChatSendLoading(false);
        });
        await act(async () => {
          setFakeStreaming(false);
        });

        // the stream ended and the refetch is waiting for the stored reply
        let refetch: unknown;
        await act(async () => {
          refetch = commentArgs.refetchCurrentConversation({ isStreamRefetch: true });
        });
        await act(async () => {
          fireEvent.click((await screen.findAllByText(mockData.electric_sheep_id.title))[0]);
        });
        await waitFor(() => expect(getAnnouncements()).toEqual(['', '']));

        isReplyStored = true;
        await act(async () => {
          await jest.advanceTimersByTimeAsync(2000);
          await refetch;
        });
        expect(getAnnouncements()).toEqual(['', '']);
        jest.useRealTimers();
      });

      it('announces nothing when the user opens another conversation while a send is still in flight', async () => {
        mockChatSendLoading(true);
        mockConversations([userMessage, assistantMessage]);
        await renderWithFakeComments();
        expect(getAnnouncements()[0]).toBe('Assistant is generating a response.');

        // sending is still loading when the other conversation is opened
        await act(async () => {
          fireEvent.click((await screen.findAllByText(mockData.electric_sheep_id.title))[0]);
        });
        await waitFor(() => expect(getAnnouncements()).toEqual(['', '']));

        await act(async () => {
          setChatSendLoading(false);
        });
        expect(getAnnouncements()).toEqual(['', '']);
      });

      describe('streamed regenerate', () => {
        let resolveSends: Array<(value: unknown) => void>;
        let sendSpy: jest.SpyInstance;

        beforeEach(() => {
          resolveSends = [];
          const sendMessage = jest.fn(
            () =>
              new Promise((resolve) => {
                resolveSends.push(resolve);
              })
          );
          sendSpy = jest.spyOn(sendMessageModule, 'useSendMessage').mockReturnValue({
            sendMessage,
            abortStream: jest.fn(),
          } as unknown as ReturnType<typeof sendMessageModule.useSendMessage>);
          mockConversationWithMessages([userMessage, assistantMessage]);
          (useConversation as jest.Mock).mockReturnValue({
            ...mockUseConversation,
            getConversation: jest.fn().mockResolvedValue({
              ...fullWelcomeConversation,
              messages: [userMessage, assistantMessage],
            }),
            removeLastMessage: jest.fn().mockResolvedValue([userMessage]),
          });
        });

        afterEach(() => {
          sendSpy.mockRestore();
          jest.useRealTimers();
        });

        const regenerateWithStream = async () => {
          await act(async () => {
            commentArgs.regenerateMessage('welcome_id');
          });
          await act(async () => {
            resolveSends[resolveSends.length - 1]({
              response: {} as ReadableStreamDefaultReader<Uint8Array>,
              isStream: true,
              isError: false,
            });
          });
        };

        it('stops the generating status when a stream ends before it produced any text', async () => {
          jest.useFakeTimers();
          await renderWithFakeComments();

          await regenerateWithStream();
          await act(async () => {
            setFakeStreaming(true);
          });
          expect(getAnnouncements()[0]).toBe('Assistant is generating a response.');

          // the stream ends without a chunk, the message keeps its reader and has no content
          await act(async () => {
            setFakeStreaming(false);
          });
          expect(getAnnouncements()).toEqual(['', '']);

          await act(async () => {
            jest.advanceTimersByTime(60_000);
          });
          expect(getAnnouncements()).toEqual(['', '']);
        });

        it('does not restart the generating status between the send and the first chunk of a second turn', async () => {
          await renderWithFakeComments();

          // first turn: the reply streams and then ends
          await regenerateWithStream();
          await act(async () => {
            setFakeStreaming(true);
          });
          await act(async () => {
            setFakeStreaming(false);
          });
          expect(getAnnouncements()).toEqual(['', '']);

          // second turn: the send returns before its stream reports that it started
          await regenerateWithStream();

          expect(getAnnouncements()).toEqual(['Assistant is generating a response.', '']);
        });
      });

      it('announces a regenerated reply and reports loading while it is generated', async () => {
        let resolveSend: (value: unknown) => void = () => {};
        const sendMessage = jest.fn(
          () =>
            new Promise((resolve) => {
              resolveSend = resolve;
            })
        );
        const removeLastMessage = jest.fn().mockResolvedValue([userMessage]);
        const sendSpy = jest
          .spyOn(sendMessageModule, 'useSendMessage')
          .mockReturnValue({ sendMessage, abortStream: jest.fn() } as unknown as ReturnType<
            typeof sendMessageModule.useSendMessage
          >);
        mockConversationWithMessages([userMessage, assistantMessage]);
        (useConversation as jest.Mock).mockReturnValue({
          ...mockUseConversation,
          getConversation: jest.fn().mockResolvedValue({
            ...fullWelcomeConversation,
            messages: [userMessage, assistantMessage],
          }),
          removeLastMessage,
        });
        await renderWithFakeComments();
        expect(getAnnouncements()).toEqual(['', '']);

        await act(async () => {
          commentArgs.regenerateMessage('welcome_id');
        });
        expect(getAnnouncements()).toEqual(['Assistant is generating a response.', '']);

        await act(async () => {
          resolveSend({ response: 'A regenerated reply.', isStream: false, isError: false });
        });

        expect(getAnnouncements()).toEqual(['', 'Assistant said: A regenerated reply.']);
        sendSpy.mockRestore();
      });

      describe('anonymized values', () => {
        const anonymizedReply: ClientMessage = {
          content: 'Host anon-1 was isolated.',
          role: 'assistant',
          timestamp: '2024-10-10T22:07:46.915Z',
        };
        let showAnonymizedValues: boolean;

        const mockShowAnonymizedValues = (value: boolean) => {
          showAnonymizedValues = value;
          const previousImplementation = jest.mocked(useLocalStorage).getMockImplementation();
          jest
            .mocked(useLocalStorage)
            .mockImplementation(((key: string, initialValue: unknown) =>
              key.includes(SHOW_ANONYMIZED_VALUES_LOCAL_STORAGE_KEY)
                ? [showAnonymizedValues, persistToLocalStorage]
                : previousImplementation?.(key, initialValue)) as typeof useLocalStorage);
        };

        const mockConversationWithReplacements = () => {
          const conversation = {
            ...fullWelcomeConversation,
            messages: [userMessage, anonymizedReply],
            replacements: { 'anon-1': 'host-original' },
          };
          jest.mocked(useFetchCurrentUserConversations).mockReturnValue({
            ...defaultFetchUserConversations,
            data: { ...mockData, welcome_id: conversation },
          } as unknown as FetchCurrentUserConversations);
          (useConversation as jest.Mock).mockReturnValue({
            ...mockUseConversation,
            getConversation: jest.fn().mockResolvedValue(conversation),
          });
        };

        it('announces the original values when anonymized values are hidden', async () => {
          mockChatSendLoading(true);
          mockConversationWithReplacements();
          mockShowAnonymizedValues(false);
          await renderAssistant();
          await act(async () => {
            setChatSendLoading(false);
          });

          expect(getAnnouncements()[1]).toBe('Assistant said: Host host-original was isolated.');
        });

        it('announces the anonymized values when they are shown', async () => {
          mockChatSendLoading(true);
          mockConversationWithReplacements();
          mockShowAnonymizedValues(true);
          await renderAssistant();
          await act(async () => {
            setChatSendLoading(false);
          });

          expect(getAnnouncements()[1]).toBe('Assistant said: Host anon-1 was isolated.');
        });

        it('does not announce again when anonymized values are toggled after the announcement', async () => {
          mockChatSendLoading(true);
          mockConversationWithReplacements();
          mockShowAnonymizedValues(false);
          const { container, rerender } = await renderAssistant();
          await act(async () => {
            setChatSendLoading(false);
          });
          const announcementBefore = getAnnouncements()[1];
          expect(announcementBefore).toBe('Assistant said: Host host-original was isolated.');
          expect(container).toBeInTheDocument();

          mockShowAnonymizedValues(true);
          await act(async () => {
            rerender(
              <TestProviders>
                <Assistant
                  lastConversation={{ id: 'welcome_id' }}
                  chatHistoryVisible={true}
                  setChatHistoryVisible={jest.fn()}
                />
              </TestProviders>
            );
          });

          expect(getAnnouncements()[1]).toBe(announcementBefore);
        });
      });
    });
  });

  describe('when not authorized', () => {
    it('should be disabled', async () => {
      const { queryByTestId } = await renderAssistant({});
      expect(queryByTestId('prompt-textarea')).toHaveProperty('disabled');
    });
  });
});
