/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable require-atomic-updates */
import {
  isToolHandlerStandardReturn,
  type ToolHandlerContext,
  type ToolHandlerReturn,
  type ToolHandlerStandardReturn,
} from '@kbn/agent-builder-server/tools';
import { ToolResultType, ToolType } from '@kbn/agent-builder-common';

import type { EndpointAppContextService } from '../../../../../endpoint/endpoint_app_context_services';
import { createMockEndpointAppContext } from '../../../../../endpoint/mocks';
import { EXECUTE_COMMAND_TOOL_ID } from '../..';
import { executeCommandTool } from '.';

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
const mockContext = { logger: mockLogger } as unknown as ToolHandlerContext;

function assertStandardReturn(result: unknown) {
  if (!isToolHandlerStandardReturn(result as ToolHandlerReturn)) {
    throw new Error('Expected standard tool return');
  }
  return (result as ToolHandlerStandardReturn).results;
}

const createMockResponseActionsClient = (overrides: Record<string, jest.Mock> = {}) => ({
  isolate: jest.fn().mockReturnValue(Promise.resolve()),
  release: jest.fn().mockReturnValue(Promise.resolve()),
  suspendProcess: jest.fn().mockReturnValue(Promise.resolve()),
  upload: jest.fn().mockReturnValue(Promise.resolve()),
  getFile: jest.fn().mockReturnValue(Promise.resolve()),
  execute: jest.fn().mockResolvedValue({
    id: 'action-exec-1',
    status: 'accepted',
    wasSuccessful: true,
    hosts: { 'agent-123': { name: 'my-host' } },
  }),
  killProcess: jest.fn().mockReturnValue(Promise.resolve()),
  runningProcesses: jest.fn().mockReturnValue(Promise.resolve()),
  processPendingActions: jest.fn().mockReturnValue(Promise.resolve()),
  getFileInfo: jest.fn().mockReturnValue(Promise.resolve()),
  getFileDownload: jest.fn().mockReturnValue(Promise.resolve()),
  scan: jest.fn().mockReturnValue(Promise.resolve()),
  runscript: jest.fn().mockReturnValue(Promise.resolve()),
  getCustomScripts: jest.fn().mockReturnValue(Promise.resolve()),
  cancel: jest.fn().mockReturnValue(Promise.resolve()),
  memoryDump: jest.fn().mockReturnValue(Promise.resolve()),
  ...overrides,
});

describe('executeCommandTool', () => {
  let mockEndpointAppContextService: EndpointAppContextService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEndpointAppContextService = createMockEndpointAppContext().service;
  });

  describe('tool definition', () => {
    it('returns a valid builtin tool definition', () => {
      const tool = executeCommandTool(mockEndpointAppContextService);
      expect(tool.type).toBe(ToolType.builtin);
      expect(tool.id).toBe(EXECUTE_COMMAND_TOOL_ID);
      expect(tool.description).toContain('Execute a shell command');
      expect(tool.schema).toBeDefined();
    });

    it('has correct tool id format', () => {
      expect(EXECUTE_COMMAND_TOOL_ID).toBe('endpoint-response-actions.execute_command');
    });
  });

  describe('handler', () => {
    let tool: ReturnType<typeof executeCommandTool>;

    beforeEach(() => {
      tool = executeCommandTool(mockEndpointAppContextService);
    });

    it('returns found: false with reason endpoint_not_found when no agent matches', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({ agents: [] }),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];

      try {
        const result = await tool.handler(
          { hostName: 'nonexistent-host', command: 'whoami' },
          mockContext
        );

        expect(assertStandardReturn(result)).toHaveLength(1);
        expect(assertStandardReturn(result)[0].type).toBe(ToolResultType.other);
        const data = assertStandardReturn(result)[0].data as Record<string, unknown>;
        expect(data.found).toBe(false);
        expect(data.reason).toBe('endpoint_not_found');
        expect(data.hostName).toBe('nonexistent-host');
        expect(mockLogger.error).not.toHaveBeenCalled();
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
      }
    });

    it('calls responseActionsClient.execute with correct parameters when agent found', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [{ id: 'agent-123' }],
        }),
      };

      const mockResponseActionsClient = createMockResponseActionsClient();

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetInternalResponseActionsClient =
        mockEndpointAppContextService.getInternalResponseActionsClient;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getInternalResponseActionsClient = jest.fn(
        () => mockResponseActionsClient
      ) as unknown as EndpointAppContextService['getInternalResponseActionsClient'];

      try {
        const result = await tool.handler(
          { hostName: 'my-host', command: 'whoami', comment: 'detection emulation test' },
          mockContext
        );

        expect(mockResponseActionsClient.execute).toHaveBeenCalledWith(
          {
            endpoint_ids: ['agent-123'],
            parameters: { command: 'whoami' },
            comment: 'detection emulation test',
          },
          { hosts: { 'agent-123': { name: 'my-host' } } }
        );

        expect(assertStandardReturn(result)).toHaveLength(1);
        expect(assertStandardReturn(result)[0].type).toBe(ToolResultType.other);
        const data = assertStandardReturn(result)[0].data as Record<string, unknown>;
        expect(data.actionId).toBe('action-exec-1');
        expect(data.status).toBe('accepted');
        expect(data.wasSuccessful).toBe(true);
        expect(data.command).toBe('whoami');
        expect(data.comment).toBe('detection emulation test');
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getInternalResponseActionsClient =
          originalGetInternalResponseActionsClient;
      }
    });

    it('passes timeout in parameters when provided', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [{ id: 'agent-123' }],
        }),
      };

      const mockResponseActionsClient = createMockResponseActionsClient();

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetInternalResponseActionsClient =
        mockEndpointAppContextService.getInternalResponseActionsClient;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getInternalResponseActionsClient = jest.fn(
        () => mockResponseActionsClient
      ) as unknown as EndpointAppContextService['getInternalResponseActionsClient'];

      try {
        await tool.handler(
          { hostName: 'my-host', command: 'ls -la /tmp', timeout: 30 },
          mockContext
        );

        expect(mockResponseActionsClient.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            parameters: { command: 'ls -la /tmp', timeout: 30 },
          }),
          expect.anything()
        );
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getInternalResponseActionsClient =
          originalGetInternalResponseActionsClient;
      }
    });

    it('uses a default comment when none is provided', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [{ id: 'agent-123' }],
        }),
      };

      const mockResponseActionsClient = createMockResponseActionsClient();

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetInternalResponseActionsClient =
        mockEndpointAppContextService.getInternalResponseActionsClient;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getInternalResponseActionsClient = jest.fn(
        () => mockResponseActionsClient
      ) as unknown as EndpointAppContextService['getInternalResponseActionsClient'];

      try {
        await tool.handler({ hostName: 'test-host', command: 'whoami' }, mockContext);

        expect(mockResponseActionsClient.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            comment: 'Executed via AI agent on test-host: whoami',
          }),
          expect.anything()
        );
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getInternalResponseActionsClient =
          originalGetInternalResponseActionsClient;
      }
    });

    it('returns an error result when the agent service throws', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockRejectedValue(new Error('fleet service unavailable')),
      };

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];

      try {
        const result = await tool.handler({ hostName: 'my-host', command: 'whoami' }, mockContext);

        expect(assertStandardReturn(result)).toHaveLength(1);
        expect(assertStandardReturn(result)[0].type).toBe(ToolResultType.error);
        expect(assertStandardReturn(result)[0].data).toHaveProperty('message');
        expect(mockLogger.error).toHaveBeenCalled();
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
      }
    });

    it('returns an error result when the response actions client throws', async () => {
      const mockAgentService = {
        listAgents: jest.fn().mockResolvedValue({
          agents: [{ id: 'agent-123' }],
        }),
      };

      const mockResponseActionsClient = createMockResponseActionsClient({
        execute: jest.fn().mockRejectedValue(new Error('execute failed: permission denied')),
      });

      const originalGetInternalFleetServices =
        mockEndpointAppContextService.getInternalFleetServices;
      const originalGetInternalResponseActionsClient =
        mockEndpointAppContextService.getInternalResponseActionsClient;

      mockEndpointAppContextService.getInternalFleetServices = jest.fn(() => ({
        agent: mockAgentService,
      })) as unknown as EndpointAppContextService['getInternalFleetServices'];
      mockEndpointAppContextService.getInternalResponseActionsClient = jest.fn(
        () => mockResponseActionsClient
      ) as unknown as EndpointAppContextService['getInternalResponseActionsClient'];

      try {
        const result = await tool.handler({ hostName: 'my-host', command: 'whoami' }, mockContext);

        expect(assertStandardReturn(result)).toHaveLength(1);
        expect(assertStandardReturn(result)[0].type).toBe(ToolResultType.error);
        expect((assertStandardReturn(result)[0].data as Record<string, unknown>).message).toContain(
          'Error executing command on host'
        );
        expect(mockLogger.error).toHaveBeenCalled();
      } finally {
        mockEndpointAppContextService.getInternalFleetServices = originalGetInternalFleetServices;
        mockEndpointAppContextService.getInternalResponseActionsClient =
          originalGetInternalResponseActionsClient;
      }
    });
  });
});
