/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { Message } from '@kbn/observability-ai-assistant-plugin/common';
import {
  ChatState,
  MessageRole,
  type ObservabilityAIAssistantChatService,
} from '@kbn/observability-ai-assistant-plugin/public';
import { ChatTimeline, type ChatTimelineProps, highlightContent } from './chat_timeline';

jest.mock('./chat_item', () => ({ ChatItem: () => null }));
jest.mock('./chat_consolidated_items', () => ({ ChatConsolidatedItems: () => null }));
jest.mock('../utils/get_timeline_items_from_conversation', () => ({
  getTimelineItemsfromConversation: () => [],
}));

describe('highlightContent', () => {
  const entityValue = 'John Doe';
  const entityObj = { class_name: 'PER', value: entityValue, mask: 'PERSON_1' };

  it('highlights anonymized entities', () => {
    const content = `Hi, my name is ${entityValue}.`;
    const startPos = content.indexOf(entityValue);
    const endPos = startPos + entityValue.length;

    const result = highlightContent(content, [{ start: startPos, end: endPos, entity: entityObj }]);

    expect(result).toBe(
      `Hi, my name is !{anonymized{"entityClass":"PER","content":"${entityValue}"}}.`
    );
  });

  it('does not highlight entities that are inside inlined code', () => {
    const content = `Here is my full name, inlined in code \`${entityValue}\`.`;
    const startPos = content.indexOf(entityValue);
    const endPos = startPos + entityValue.length;

    const result = highlightContent(content, [{ start: startPos, end: endPos, entity: entityObj }]);

    // The content should remain unchanged because the entity is inside inline code.
    expect(result).toBe(content);
  });

  it('does not highlight entities that are inside fenced code blocks', () => {
    const content = `Here is code block:
        \`\`\`
        ${entityValue}
        \`\`\`
        End.`;
    const startPos = content.indexOf(entityValue);
    const endPos = startPos + entityValue.length;

    const result = highlightContent(content, [{ start: startPos, end: endPos, entity: entityObj }]);

    // The content should remain unchanged because the entity is inside a fenced code block.
    expect(result).toBe(content);
  });
});

describe('ChatTimeline screen reader announcements', () => {
  const userMessage: Message = {
    '@timestamp': '2025-01-01T00:00:00.000Z',
    message: { role: MessageRole.User, content: 'What is slow?' },
  };
  const assistantMessage: Message = {
    '@timestamp': '2025-01-01T00:00:01.000Z',
    message: { role: MessageRole.Assistant, content: 'The checkout service is slow.' },
  };
  const functionCallMessage: Message = {
    '@timestamp': '2025-01-01T00:00:01.000Z',
    message: {
      role: MessageRole.Assistant,
      content: 'Let me check the services.',
      function_call: { name: 'get_apm_services', arguments: '{}', trigger: MessageRole.Assistant },
    },
  };

  type DynamicProps = Pick<ChatTimelineProps, 'messages' | 'chatState' | 'conversationId'>;

  const timeline = (props: DynamicProps) => (
    <I18nProvider>
      <ChatTimeline
        chatService={{} as ObservabilityAIAssistantChatService}
        hasConnector
        isConversationOwnedByCurrentUser
        isArchived={false}
        showElasticLlmCalloutInChat={false}
        showKnowledgeBaseReIndexingCallout={false}
        onEdit={jest.fn()}
        onFeedback={jest.fn()}
        onRegenerate={jest.fn()}
        onSendTelemetry={jest.fn()}
        onStopGenerating={jest.fn()}
        onActionClick={jest.fn()}
        {...props}
      />
    </I18nProvider>
  );

  const renderTimeline = (props: DynamicProps) => {
    const { rerender } = render(timeline(props));
    return { update: (next: DynamicProps) => rerender(timeline(next)) };
  };

  const getAnnouncements = () => screen.getAllByRole('status').map((el) => el.textContent);

  it('announces the last reply once when loading finishes', () => {
    const { update } = renderTimeline({
      messages: [userMessage, assistantMessage],
      chatState: ChatState.Loading,
    });
    expect(getAnnouncements()).toEqual(['Assistant is generating a response.', '']);

    update({ messages: [userMessage, assistantMessage], chatState: ChatState.Ready });

    expect(getAnnouncements()).toEqual(['', 'Assistant said: The checkout service is slow.']);
    expect(screen.getAllByText('Assistant said: The checkout service is slow.')).toHaveLength(1);
  });

  it('announces nothing when a finished conversation is opened', () => {
    renderTimeline({
      messages: [userMessage, assistantMessage],
      chatState: ChatState.Ready,
    });

    expect(getAnnouncements()).toEqual(['', '']);
  });

  it('does not announce an intermediate function call', () => {
    const { update } = renderTimeline({
      messages: [userMessage, functionCallMessage],
      chatState: ChatState.Loading,
    });

    update({ messages: [userMessage, functionCallMessage], chatState: ChatState.Ready });

    expect(getAnnouncements()).toEqual(['', '']);
  });

  describe('when a turn does not end cleanly', () => {
    const partialMessage: Message = {
      '@timestamp': '2025-01-01T00:00:01.000Z',
      message: { role: MessageRole.Assistant, content: 'The checkout serv' },
    };
    const tokenLimitMessage: Message = {
      '@timestamp': '2025-01-01T00:00:02.000Z',
      message: {
        role: MessageRole.Assistant,
        content: 'The conversation has exceeded the token limit.',
      },
    };

    it('does not read out the partial reply after an error', () => {
      const { update } = renderTimeline({
        messages: [userMessage, partialMessage],
        chatState: ChatState.Loading,
      });

      update({ messages: [userMessage, partialMessage], chatState: ChatState.Error });

      expect(getAnnouncements()).toEqual(['', '']);
    });

    it('does not read out the partial reply after the user stops the response', () => {
      const { update } = renderTimeline({
        messages: [userMessage, partialMessage],
        chatState: ChatState.Loading,
      });

      update({ messages: [userMessage, partialMessage], chatState: ChatState.Aborted });

      expect(getAnnouncements()).toEqual(['', '']);
    });

    it('reads out the token limit explanation that replaces the reply', () => {
      const { update } = renderTimeline({
        messages: [userMessage, partialMessage],
        chatState: ChatState.Loading,
      });

      update({
        messages: [userMessage, partialMessage, tokenLimitMessage],
        chatState: ChatState.Error,
      });

      expect(getAnnouncements()).toEqual([
        '',
        'Assistant said: The conversation has exceeded the token limit.',
      ]);
    });

    it('reads out the token limit explanation when the error comes before any reply text', () => {
      const { update } = renderTimeline({ messages: [userMessage], chatState: ChatState.Loading });

      update({ messages: [userMessage, tokenLimitMessage], chatState: ChatState.Error });

      expect(getAnnouncements()[1]).toBe(
        'Assistant said: The conversation has exceeded the token limit.'
      );
    });
  });

  describe('when the user changes conversation', () => {
    const otherReply: Message = {
      '@timestamp': '2025-01-01T00:00:05.000Z',
      message: { role: MessageRole.Assistant, content: 'Another conversation reply.' },
    };

    it('does not read out the other conversation after switching mid-reply', () => {
      const { update } = renderTimeline({
        conversationId: 'first',
        messages: [userMessage, assistantMessage],
        chatState: ChatState.Loading,
      });

      // switching aborts the stream and shows the other conversation in the same update
      update({
        conversationId: 'second',
        messages: [userMessage, otherReply],
        chatState: ChatState.Ready,
      });

      expect(getAnnouncements()).toEqual(['', '']);
    });

    it('does not read out the other conversation when a reply loads there and then finishes', () => {
      const { update } = renderTimeline({
        conversationId: 'first',
        messages: [userMessage, assistantMessage],
        chatState: ChatState.Loading,
      });

      // the other conversation is opened while a turn is loading, and loading carries on
      update({
        conversationId: 'second',
        messages: [userMessage, otherReply],
        chatState: ChatState.Loading,
      });
      update({
        conversationId: 'second',
        messages: [userMessage, otherReply],
        chatState: ChatState.Ready,
      });

      expect(getAnnouncements()).toEqual(['', '']);
    });

    it('does not read out the other conversation after starting a new chat mid-reply', () => {
      const { update } = renderTimeline({
        conversationId: 'first',
        messages: [userMessage, assistantMessage],
        chatState: ChatState.Loading,
      });

      update({ conversationId: undefined, messages: [], chatState: ChatState.Ready });

      expect(getAnnouncements()).toEqual(['', '']);
    });

    it('still reads out the reply of a new conversation that gets its id while sending', () => {
      const { update } = renderTimeline({
        conversationId: undefined,
        messages: [userMessage],
        chatState: ChatState.Loading,
      });

      update({
        conversationId: 'created',
        messages: [userMessage, assistantMessage],
        chatState: ChatState.Loading,
      });
      update({
        conversationId: 'created',
        messages: [userMessage, assistantMessage],
        chatState: ChatState.Ready,
      });

      expect(getAnnouncements()[1]).toBe('Assistant said: The checkout service is slow.');
    });

    describe('when the new conversation gets its id after the reply finished', () => {
      // the id comes from the request that loads the stored conversation, which normally
      // resolves after the chat state is already Ready
      const startFirstMessage = () =>
        renderTimeline({
          conversationId: undefined,
          messages: [userMessage],
          chatState: ChatState.Loading,
        });

      it('reads out the reply', () => {
        const { update } = startFirstMessage();
        update({
          conversationId: undefined,
          messages: [userMessage, assistantMessage],
          chatState: ChatState.Ready,
        });
        update({
          conversationId: 'created',
          messages: [userMessage, assistantMessage],
          chatState: ChatState.Ready,
        });

        expect(getAnnouncements()).toEqual(['', 'Assistant said: The checkout service is slow.']);
      });

      it('reads out the reply when the id arrives in the same update that finishes it', () => {
        const { update } = startFirstMessage();
        update({
          conversationId: 'created',
          messages: [userMessage, assistantMessage],
          chatState: ChatState.Ready,
        });

        expect(getAnnouncements()).toEqual(['', 'Assistant said: The checkout service is slow.']);
      });

      it('does not read the reply out twice when the stored messages replace the streamed ones', () => {
        const { update } = startFirstMessage();
        update({
          conversationId: undefined,
          messages: [userMessage, assistantMessage],
          chatState: ChatState.Ready,
        });
        update({
          conversationId: 'created',
          messages: [{ ...userMessage }, { ...assistantMessage }],
          chatState: ChatState.Ready,
        });

        expect(screen.getAllByText('Assistant said: The checkout service is slow.')).toHaveLength(
          1
        );
        expect(getAnnouncements()).toEqual(['', 'Assistant said: The checkout service is slow.']);
      });

      it('does not announce a reply when a stored conversation only gets its id while idle', () => {
        const { update } = renderTimeline({
          conversationId: undefined,
          messages: [],
          chatState: ChatState.Ready,
        });
        update({
          conversationId: 'stored',
          messages: [userMessage, assistantMessage],
          chatState: ChatState.Ready,
        });

        expect(getAnnouncements()).toEqual(['', '']);
      });
    });
  });
});
