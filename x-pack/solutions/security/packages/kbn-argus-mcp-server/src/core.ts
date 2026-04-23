/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ArgusSkillDescriptor,
  GovernanceSnapshot,
  McpToolDescriptor,
  Principal,
  ProjectedManifest,
} from '@kbn/argus-tool-manifest';
import { MCP_TOOL_NAMESPACE, projectManifestFor } from '@kbn/argus-tool-manifest';

import type { DispatchRequest, DispatchResult, GovernanceClient, SkillDispatcher } from './types';

/**
 * Minimal-surface logger — matches the shape of @kbn/tooling-log's ToolingLog
 * without pulling the class type in (that package drags a lot of peer deps).
 */
export interface CoreLogger {
  debug(msg: string): void;
  info(msg: string): void;
  warning(msg: string): void;
  error(msg: string): void;
}

export interface ArgusMcpCoreDeps {
  readonly skills: readonly ArgusSkillDescriptor[];
  readonly governance: GovernanceClient;
  readonly dispatcher: SkillDispatcher;
  readonly logger: CoreLogger;
  readonly now?: () => number;
}

export interface ToolsListResponse {
  readonly tools: readonly McpToolDescriptor[];
  readonly _meta: {
    readonly server_governance_hold?: string;
    readonly effective_profile: string;
  };
}

export interface ToolsCallError {
  readonly code: 'unknown_tool' | 'invalid_arguments' | 'dispatch_failed';
  readonly message: string;
}

export interface ToolsCallResponse {
  readonly content: ReadonlyArray<{
    readonly type: 'text';
    readonly text: string;
  }>;
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
  readonly _meta: {
    readonly correlation_id: string;
    readonly skill_id?: string;
    readonly propose_only?: boolean;
    readonly error?: ToolsCallError;
  };
}

const DEFAULT_CORRELATION_PREFIX = 'argus-mcp-';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

const newCorrelationId = (now: () => number): string =>
  `${DEFAULT_CORRELATION_PREFIX}${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Core — transport-agnostic. The stdio / HTTP transports just call
 * `.handleListTools(principal)` and `.handleCallTool(principal, req)`.
 *
 * This is the unit-testable seam: every governance guarantee in the R12
 * scaffold is implemented here and has a regression test.
 */
export class ArgusMcpCore {
  private readonly skills: readonly ArgusSkillDescriptor[];
  private readonly governance: GovernanceClient;
  private readonly dispatcher: SkillDispatcher;
  private readonly logger: CoreLogger;
  private readonly now: () => number;

  constructor(deps: ArgusMcpCoreDeps) {
    this.skills = deps.skills;
    this.governance = deps.governance;
    this.dispatcher = deps.dispatcher;
    this.logger = deps.logger;
    this.now = deps.now ?? (() => Date.now());
  }

  /**
   * Equivalent of MCP's `tools/list`. Rebuilt on every call because
   * governance state changes as new eval runs land.
   */
  async handleListTools(principal: Principal): Promise<ToolsListResponse> {
    const snapshot = await this.governance.snapshot(principal);
    const manifest = this.projectForPrincipal(principal, snapshot);
    this.logger.debug(
      `argus-mcp: list_tools principal=${principal.protocol}:${principal.client_id} effective=${
        manifest.principal.profile
      } tools=${manifest.mcp_tools.length}${
        manifest.governance_hold ? ` hold=${manifest.governance_hold}` : ''
      }`
    );
    return {
      tools: manifest.mcp_tools,
      _meta: {
        effective_profile: manifest.principal.profile,
        ...(manifest.governance_hold ? { server_governance_hold: manifest.governance_hold } : {}),
      },
    };
  }

  /**
   * Equivalent of MCP's `tools/call`. Arguments come in loosely-typed from
   * the SDK; we validate them here before dispatch so the error is shaped
   * as an MCP-friendly `isError: true` content block rather than a protocol
   * fault.
   */
  async handleCallTool(
    principal: Principal,
    toolName: string,
    rawArguments: unknown
  ): Promise<ToolsCallResponse> {
    const snapshot = await this.governance.snapshot(principal);
    const manifest = this.projectForPrincipal(principal, snapshot);
    const effectivePrincipal = manifest.principal;

    const projected = manifest.mcp_tools.find((t) => t.name === toolName);
    if (!projected) {
      const errMsg = `tool ${toolName} is not exposed to principal ${principal.protocol}:${principal.client_id} under effective profile ${effectivePrincipal.profile}`;
      this.logger.warning(`argus-mcp: ${errMsg}`);
      return this.errorResponse({
        correlationId: newCorrelationId(this.now),
        code: 'unknown_tool',
        message: errMsg,
      });
    }

    if (!toolName.startsWith(MCP_TOOL_NAMESPACE)) {
      return this.errorResponse({
        correlationId: newCorrelationId(this.now),
        code: 'unknown_tool',
        message: `tool names must start with ${MCP_TOOL_NAMESPACE}`,
      });
    }
    const skillId = toolName.slice(MCP_TOOL_NAMESPACE.length);
    const skill = this.skills.find((s) => s.id === skillId);
    if (!skill) {
      return this.errorResponse({
        correlationId: newCorrelationId(this.now),
        code: 'unknown_tool',
        message: `skill ${skillId} not found in loaded catalog`,
      });
    }

    const parsedArgs = this.validateArgs(rawArguments);
    if (!parsedArgs.ok) {
      return this.errorResponse({
        correlationId: newCorrelationId(this.now),
        code: 'invalid_arguments',
        message: parsedArgs.reason,
      });
    }

    // Force propose_only=true for the 'advisory' profile. The caller's
    // payload can only turn it ON, never OFF.
    const forcedProposeOnly =
      effectivePrincipal.profile === 'advisory' ? true : parsedArgs.value.propose_only;

    const correlationId = parsedArgs.value.correlation_id ?? newCorrelationId(this.now);
    const dispatchRequest: DispatchRequest = {
      principal: effectivePrincipal,
      skill,
      task: parsedArgs.value.task,
      scope: parsedArgs.value.scope,
      propose_only: forcedProposeOnly,
      correlation_id: correlationId,
    };

    try {
      const result = await this.dispatcher.dispatch(dispatchRequest);
      return this.successResponse(result, {
        correlation_id: correlationId,
        skill_id: skill.id,
        propose_only: forcedProposeOnly,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `argus-mcp: dispatch failed skill=${skill.id} principal=${principal.protocol}:${principal.client_id} correlation=${correlationId} err=${msg}`
      );
      return this.errorResponse({
        correlationId,
        code: 'dispatch_failed',
        message: msg,
      });
    }
  }

  private projectForPrincipal(
    principal: Principal,
    snapshot: GovernanceSnapshot
  ): ProjectedManifest {
    return projectManifestFor(principal, this.skills, snapshot);
  }

  private validateArgs(raw: unknown):
    | {
        ok: true;
        value: {
          task: string;
          scope: DispatchRequest['scope'];
          propose_only: boolean;
          correlation_id?: string;
        };
      }
    | { ok: false; reason: string } {
    if (!isObj(raw)) return { ok: false, reason: 'arguments must be an object' };

    const task = raw.task;
    if (typeof task !== 'string' || task.length === 0 || task.length > 4000) {
      return { ok: false, reason: 'task must be a 1..4000 char string' };
    }

    const scopeRaw = raw.scope;
    let scope: DispatchRequest['scope'] = {};
    if (scopeRaw !== undefined) {
      if (!isObj(scopeRaw)) return { ok: false, reason: 'scope must be an object' };
      const coerced: Record<string, unknown> = {};
      for (const k of ['tenant_id', 'space_id', 'time_window']) {
        const v = scopeRaw[k];
        if (v !== undefined) {
          if (typeof v !== 'string') return { ok: false, reason: `scope.${k} must be a string` };
          coerced[k] = v;
        }
      }
      const entity = scopeRaw.entity_ids;
      if (entity !== undefined) {
        if (!Array.isArray(entity) || entity.length > 50) {
          return { ok: false, reason: 'scope.entity_ids must be an array of <=50 strings' };
        }
        if (entity.some((e) => typeof e !== 'string')) {
          return { ok: false, reason: 'scope.entity_ids entries must be strings' };
        }
        coerced.entity_ids = entity;
      }
      scope = coerced as DispatchRequest['scope'];
    }

    const proposeOnlyRaw = raw.propose_only;
    if (proposeOnlyRaw !== undefined && typeof proposeOnlyRaw !== 'boolean') {
      return { ok: false, reason: 'propose_only must be a boolean' };
    }
    const correlationRaw = raw.correlation_id;
    if (correlationRaw !== undefined && typeof correlationRaw !== 'string') {
      return { ok: false, reason: 'correlation_id must be a string' };
    }

    return {
      ok: true,
      value: {
        task,
        scope,
        propose_only: typeof proposeOnlyRaw === 'boolean' ? proposeOnlyRaw : false,
        ...(correlationRaw ? { correlation_id: correlationRaw } : {}),
      },
    };
  }

  private successResponse(
    result: DispatchResult,
    meta: { correlation_id: string; skill_id: string; propose_only: boolean }
  ): ToolsCallResponse {
    return {
      content: [
        {
          type: 'text',
          text: result.summary,
        },
      ],
      structuredContent: {
        skill_id: result.skill_id,
        summary: result.summary,
        structured_output: result.structured_output,
        trace: result.trace,
        mutation_intents: result.mutation_intents,
      },
      _meta: meta,
    };
  }

  private errorResponse(args: {
    correlationId: string;
    code: ToolsCallError['code'];
    message: string;
  }): ToolsCallResponse {
    return {
      content: [{ type: 'text', text: args.message }],
      isError: true,
      _meta: {
        correlation_id: args.correlationId,
        error: { code: args.code, message: args.message },
      },
    };
  }
}
