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

  type DynamicProps = Pick<ChatTimelineProps, 'messages' | 'chatState'>;

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
});
