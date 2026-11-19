/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useChatComplete } from '@kbn/elastic-assistant/impl/assistant/api/chat_complete/use_chat_complete';
import { useFetchAnonymizationFields } from '@kbn/elastic-assistant/impl/assistant/api/anonymization_fields/use_fetch_anonymization_fields';
import { TestProviders } from '../../../../common/mock';
import {
  DOCUMENT_SUMMARY_SECTION_TEST_ID,
  DocumentSummarySection,
} from './document_summary_section';
import { GENERATE_INSIGHTS_BUTTON_TEST_ID } from './document_summary';
import { DOCUMENT_SUMMARY_OPTIONS_MENU_BUTTON_TEST_ID } from './document_summary_options_menu';
import { useFetchDocumentSummary } from '../hooks/use_fetch_document_summary';
import { useBulkUpdateDocumentSummary } from '../hooks/use_bulk_update_document_summary';
import { HEADER_TEST_ID } from '../../../shared/components/expandable_section';
import { useKibana as mockUseKibana } from '../../../../common/lib/kibana/__mocks__';

jest.mock('@kbn/inference-connectors', () => ({
  ...jest.requireActual('@kbn/inference-connectors'),
  useLoadConnectors: jest.fn().mockReturnValue({
    data: [
      {
        id: 'test-connector-id',
        name: 'Test Connector',
        actionTypeId: '.gen-ai',
      },
    ],
    isLoading: false,
  }),
}));

jest.mock('@kbn/elastic-assistant/impl/assistant/api/chat_complete/use_chat_complete');
jest.mock(
  '@kbn/elastic-assistant/impl/assistant/api/anonymization_fields/use_fetch_anonymization_fields'
);
jest.mock('../hooks/use_fetch_document_summary');
jest.mock('../hooks/use_bulk_update_document_summary');

jest.mock('../hooks/use_anonymization_toggle', () => ({
  useAnonymizationToggle: () => ({
    showAnonymizedValues: false,
    setShowAnonymizedValues: jest.fn(),
  }),
}));

const mockedUseKibana = {
  ...mockUseKibana(),
  services: {
    ...mockUseKibana().services,
    application: {
      ...mockUseKibana().services.application,
      capabilities: {
        management: {
          kibana: {
            settings: true,
          },
        },
      },
    },
    uiSettings: {
      get: jest.fn().mockReturnValue('default-connector-id'),
    },
    featureFlags: {
      getBooleanValue: jest.fn().mockReturnValue(false),
    },
  },
};
jest.mock('../../../../common/lib/kibana', () => {
  return {
    ...jest.requireActual('../../../../common/lib/kibana'),
    useKibana: () => mockedUseKibana,
  };
});

describe('DocumentSummarySection', () => {
  const mockSendMessage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useChatComplete as jest.Mock).mockReturnValue({
      sendMessage: mockSendMessage,
      abortStream: jest.fn(),
    });
    (useFetchAnonymizationFields as jest.Mock).mockReturnValue({ data: [], isFetched: true });
    (useFetchDocumentSummary as jest.Mock).mockReturnValue({
      data: { data: [], prompt: 'Generate an alert summary!' },
      refetch: jest.fn(),
      isFetched: true,
    });
    (useBulkUpdateDocumentSummary as jest.Mock).mockReturnValue({ bulkUpdate: jest.fn() });
    mockSendMessage.mockResolvedValue({
      response: JSON.stringify({ summary: 'Unsaved summary text', recommendedActions: 'Act' }),
      isError: false,
    });
  });

  it('should render the AI summary section with title, sparkles icon, and options menu', async () => {
    const getPromptContext = jest.fn().mockResolvedValue({ 'host.name': ['h1'] });

    const { getByTestId } = render(
      <TestProviders>
        <DocumentSummarySection documentId="test-document-id" getPromptContext={getPromptContext} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId(GENERATE_INSIGHTS_BUTTON_TEST_ID)).toBeEnabled();
    });

    const header = getByTestId(`${DOCUMENT_SUMMARY_SECTION_TEST_ID}${HEADER_TEST_ID}`);
    expect(header).toHaveTextContent('AI summary');
    expect(header.querySelector('[data-euiicon-type="sparkles"]')).toBeInTheDocument();
    expect(getByTestId(DOCUMENT_SUMMARY_OPTIONS_MENU_BUTTON_TEST_ID)).toBeInTheDocument();
  });

  it('should render with custom data-test-subj', async () => {
    const getPromptContext = jest.fn().mockResolvedValue({ 'host.name': ['h1'] });

    const { getByTestId } = render(
      <TestProviders>
        <DocumentSummarySection
          documentId="test-document-id"
          getPromptContext={getPromptContext}
          data-test-subj="custom-test-id"
        />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId(GENERATE_INSIGHTS_BUTTON_TEST_ID)).toBeEnabled();
    });

    expect(getByTestId(`custom-test-id${HEADER_TEST_ID}`)).toHaveTextContent('AI summary');
  });

  describe('when the summary is not persisted', () => {
    it('keeps the generated summary when the section is folded and unfolded', async () => {
      const getPromptContext = () => Promise.resolve({ 'host.name': ['h1'] });
      render(
        <TestProviders>
          <DocumentSummarySection
            documentId="test-document-id"
            getPromptContext={getPromptContext}
            persist={false}
          />
        </TestProviders>
      );

      await waitFor(() => {
        expect(screen.getByTestId(GENERATE_INSIGHTS_BUTTON_TEST_ID)).toBeEnabled();
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId(GENERATE_INSIGHTS_BUTTON_TEST_ID));
      });
      expect(await screen.findByText('Unsaved summary text')).toBeInTheDocument();

      const toggle = screen.getByRole('button', { name: /AI summary/ });
      await act(async () => {
        fireEvent.click(toggle);
      });
      await waitFor(() => {
        expect(screen.queryByText('Unsaved summary text')).not.toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(toggle);
      });

      expect(await screen.findByText('Unsaved summary text')).toBeInTheDocument();
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
  });
});
