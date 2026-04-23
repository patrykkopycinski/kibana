/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import type { Principal } from '@kbn/argus-tool-manifest';

import type { ArgusMcpCore } from './core';

export interface ArgusMcpServerOptions {
  readonly core: ArgusMcpCore;
  /**
   * Principal bound to this server instance. stdio transport = one server
   * per process = one principal. HTTP transport would set the principal
   * per-request and is out of scope for v1.
   */
  readonly principal: Principal;
  readonly serverInfo?: {
    readonly name?: string;
    readonly version?: string;
  };
}

export const ARGUS_MCP_SERVER_NAME = 'argus';
export const ARGUS_MCP_SERVER_VERSION = '1.0.0';

/**
 * Build a bound MCP Server that answers tools/list and tools/call through
 * the transport-agnostic core. Connect the returned server to a transport
 * (stdio, streamable HTTP, etc.) via `server.connect(transport)`.
 */
export const createArgusMcpServer = (options: ArgusMcpServerOptions): Server => {
  const { core, principal, serverInfo } = options;

  const server = new Server(
    {
      name: serverInfo?.name ?? ARGUS_MCP_SERVER_NAME,
      version: serverInfo?.version ?? ARGUS_MCP_SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        'Argus — Elastic Autonomous SOC. Every tool call is governed by trust-tier, door-class, blast-radius, adversarial, and reasoning-watchdog gates. Outputs may return mutation_intent with status=pending_review when the caller or profile is not authorized to auto-apply.',
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const resp = await core.handleListTools(principal);
    return {
      tools: resp.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
        annotations: t.annotations,
        _meta: t._meta,
      })),
      _meta: resp._meta,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const resp = await core.handleCallTool(principal, name, args ?? {});
    return {
      content: resp.content.slice(),
      ...(resp.structuredContent ? { structuredContent: resp.structuredContent } : {}),
      ...(resp.isError ? { isError: true } : {}),
      _meta: resp._meta,
    };
  });

  return server;
};

export type { Transport };
