/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  A2aAgentCard,
  ArgusSkillDescriptor,
  Principal,
  ProjectedManifest,
} from '@kbn/argus-tool-manifest';
import { assembleAgentCard, projectManifestFor } from '@kbn/argus-tool-manifest';

import type { TaskStore } from './task_store';
import type {
  A2aArtifact,
  A2aMessage,
  A2aTask,
  A2aTaskError,
  A2aTaskState,
  DispatchRequest,
  DispatchResult,
  GovernanceClient,
  SendTaskInput,
  SkillDispatcher,
} from './types';

export interface CoreLogger {
  debug(msg: string): void;
  info(msg: string): void;
  warning(msg: string): void;
  error(msg: string): void;
}

export interface ArgusA2aCoreDeps {
  readonly skills: readonly ArgusSkillDescriptor[];
  readonly governance: GovernanceClient;
  readonly dispatcher: SkillDispatcher;
  readonly taskStore: TaskStore;
  readonly logger: CoreLogger;
  readonly now?: () => number;
  readonly idFactory?: () => string;
}

const DEFAULT_TASK_PREFIX = 'argus-a2a-';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

const actorIdFor = (principal: Principal): string => `${principal.protocol}:${principal.client_id}`;

const newId = (prefix: string, now: () => number): string =>
  `${prefix}${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Core A2A server — transport-agnostic. The HTTP transport forwards
 * `/.well-known/agent.json` → `handleAgentCard` and
 * `tasks/send` / `tasks/get` → the corresponding methods.
 *
 * v1 runs `tasks/send` synchronously (the HTTP handler blocks until the
 * skill completes). SSE streaming (`tasks/sendSubscribe`) is out of scope;
 * the agent card advertises `streaming: false`.
 */
export class ArgusA2aCore {
  private readonly skills: readonly ArgusSkillDescriptor[];
  private readonly governance: GovernanceClient;
  private readonly dispatcher: SkillDispatcher;
  private readonly taskStore: TaskStore;
  private readonly logger: CoreLogger;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  constructor(deps: ArgusA2aCoreDeps) {
    this.skills = deps.skills;
    this.governance = deps.governance;
    this.dispatcher = deps.dispatcher;
    this.taskStore = deps.taskStore;
    this.logger = deps.logger;
    this.now = deps.now ?? (() => Date.now());
    this.idFactory = deps.idFactory ?? (() => newId(DEFAULT_TASK_PREFIX, this.now));
  }

  /**
   * Serve the A2A agent card. Per-principal, because the skill list is
   * governed by the same pipeline that shapes MCP tools.
   */
  async handleAgentCard(principal: Principal): Promise<A2aAgentCard> {
    const snapshot = await this.governance.snapshot(principal);
    const manifest = projectManifestFor(principal, this.skills, snapshot);
    const card = assembleAgentCard(manifest);
    this.logger.debug(
      `argus-a2a: agent-card principal=${actorIdFor(principal)} effective=${
        manifest.principal.profile
      } skills=${manifest.a2a_skills.length}${
        manifest.governance_hold ? ` hold=${manifest.governance_hold}` : ''
      }`
    );
    return card;
  }

  /**
   * Kick off a task. Governance is applied PER TASK — the manifest is
   * projected, the requested skill is looked up in the projected manifest
   * (not the raw catalog), propose_only is forced for advisory callers,
   * and the resulting task is persisted.
   */
  async handleSendTask(principal: Principal, input: unknown): Promise<A2aTask> {
    const parsed = this.validateInput(input);
    if (!parsed.ok) {
      const hint = isObj(input) ? input : {};
      const skillIdHint = typeof hint.skill_id === 'string' ? hint.skill_id : '(n/a)';
      const sessionIdHint = typeof hint.session_id === 'string' ? hint.session_id : undefined;
      return this.failedTask(principal, {
        skillId: skillIdHint,
        sessionId: sessionIdHint,
        correlationId: newId('corr-', this.now),
        error: { code: 'invalid_input', message: parsed.reason },
        proposeOnly: false,
      });
    }

    const snapshot = await this.governance.snapshot(principal);
    const manifest: ProjectedManifest = projectManifestFor(principal, this.skills, snapshot);
    const effectivePrincipal = manifest.principal;

    const projected = manifest.a2a_skills.find((s) => s.id === parsed.value.skill_id);
    if (!projected) {
      const msg = `skill ${parsed.value.skill_id} is not exposed to principal ${actorIdFor(
        principal
      )} under effective profile ${effectivePrincipal.profile}`;
      this.logger.warning(`argus-a2a: ${msg}`);
      return this.failedTask(principal, {
        skillId: parsed.value.skill_id,
        sessionId: parsed.value.session_id,
        correlationId: parsed.value.correlation_id ?? newId('corr-', this.now),
        error: {
          code: manifest.governance_hold ? 'governance_hold' : 'unknown_skill',
          message: manifest.governance_hold ? manifest.governance_hold : msg,
        },
        proposeOnly: false,
        governanceHold: manifest.governance_hold,
      });
    }

    const skill = this.skills.find((s) => s.id === parsed.value.skill_id);
    if (!skill) {
      return this.failedTask(principal, {
        skillId: parsed.value.skill_id,
        sessionId: parsed.value.session_id,
        correlationId: parsed.value.correlation_id ?? newId('corr-', this.now),
        error: {
          code: 'unknown_skill',
          message: `skill ${parsed.value.skill_id} not found in loaded catalog`,
        },
        proposeOnly: false,
      });
    }

    const forcedProposeOnly =
      effectivePrincipal.profile === 'advisory' ? true : parsed.value.propose_only;
    const correlationId = parsed.value.correlation_id ?? newId('corr-', this.now);
    const taskId = this.idFactory();

    const submitted: A2aTask = {
      id: taskId,
      ...(parsed.value.session_id ? { session_id: parsed.value.session_id } : {}),
      status: {
        state: 'submitted',
        timestamp: this.now(),
      },
      skill_id: skill.id,
      principal_actor_id: actorIdFor(effectivePrincipal),
      artifacts: [],
      history: [userMessageFromTask(parsed.value.task)],
      metadata: {
        propose_only: forcedProposeOnly,
        correlation_id: correlationId,
        ...(manifest.governance_hold ? { server_governance_hold: manifest.governance_hold } : {}),
      },
    };
    await this.taskStore.put(submitted);

    const dispatchRequest: DispatchRequest = {
      principal: effectivePrincipal,
      skill,
      task: parsed.value.task,
      scope: parsed.value.scope,
      propose_only: forcedProposeOnly,
      correlation_id: correlationId,
    };

    let result: DispatchResult;
    try {
      result = await this.dispatcher.dispatch(dispatchRequest);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `argus-a2a: dispatch failed skill=${skill.id} task=${taskId} principal=${actorIdFor(
          principal
        )} err=${msg}`
      );
      const failed = this.withStatus(submitted, 'failed', {
        error: { code: 'dispatch_failed', message: msg },
      });
      await this.taskStore.put(failed);
      return failed;
    }

    const artifact = buildArtifactFromResult(result);
    const agentMessage: A2aMessage = {
      role: 'agent',
      parts: [{ type: 'text', text: result.summary }],
    };
    const completed: A2aTask = {
      ...submitted,
      status: {
        state: 'completed',
        timestamp: this.now(),
        message: agentMessage,
      },
      artifacts: [artifact],
      history: [...submitted.history, agentMessage],
    };
    await this.taskStore.put(completed);
    return completed;
  }

  /**
   * Fetch a previously-created task. Enforces that the caller is the same
   * actor that created the task — no cross-principal task access.
   */
  async handleGetTask(
    principal: Principal,
    taskId: string
  ): Promise<{ ok: true; task: A2aTask } | { ok: false; code: 'not_found' | 'forbidden' }> {
    const t = await this.taskStore.get(taskId);
    if (!t) return { ok: false, code: 'not_found' };
    if (t.principal_actor_id !== actorIdFor(principal)) {
      this.logger.warning(
        `argus-a2a: cross-actor task access blocked task=${taskId} requested_by=${actorIdFor(
          principal
        )} owner=${t.principal_actor_id}`
      );
      return { ok: false, code: 'forbidden' };
    }
    return { ok: true, task: t };
  }

  private validateInput(raw: unknown):
    | {
        ok: true;
        value: Required<Pick<SendTaskInput, 'skill_id' | 'task'>> &
          SendTaskInput & { propose_only: boolean };
      }
    | { ok: false; reason: string } {
    if (!isObj(raw)) return { ok: false, reason: 'input must be an object' };

    const skillId = raw.skill_id;
    if (typeof skillId !== 'string' || skillId.length === 0 || skillId.length > 120) {
      return { ok: false, reason: 'skill_id must be a 1..120 char string' };
    }
    const task = raw.task;
    if (typeof task !== 'string' || task.length === 0 || task.length > 4000) {
      return { ok: false, reason: 'task must be a 1..4000 char string' };
    }

    let scope: SendTaskInput['scope'] | undefined;
    const scopeRaw = raw.scope;
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
      scope = coerced as SendTaskInput['scope'];
    }

    const proposeOnlyRaw = raw.propose_only;
    if (proposeOnlyRaw !== undefined && typeof proposeOnlyRaw !== 'boolean') {
      return { ok: false, reason: 'propose_only must be a boolean' };
    }
    const sessionIdRaw = raw.session_id;
    if (sessionIdRaw !== undefined && typeof sessionIdRaw !== 'string') {
      return { ok: false, reason: 'session_id must be a string' };
    }
    const correlationRaw = raw.correlation_id;
    if (correlationRaw !== undefined && typeof correlationRaw !== 'string') {
      return { ok: false, reason: 'correlation_id must be a string' };
    }

    return {
      ok: true,
      value: {
        skill_id: skillId,
        task,
        ...(scope ? { scope } : {}),
        propose_only: typeof proposeOnlyRaw === 'boolean' ? proposeOnlyRaw : false,
        ...(typeof sessionIdRaw === 'string' ? { session_id: sessionIdRaw } : {}),
        ...(typeof correlationRaw === 'string' ? { correlation_id: correlationRaw } : {}),
      },
    };
  }

  private async failedTask(
    principal: Principal,
    args: {
      skillId: string;
      sessionId?: string;
      correlationId: string;
      error: A2aTaskError;
      proposeOnly: boolean;
      governanceHold?: string;
    }
  ): Promise<A2aTask> {
    const task: A2aTask = {
      id: this.idFactory(),
      ...(args.sessionId ? { session_id: args.sessionId } : {}),
      status: {
        state: 'failed',
        timestamp: this.now(),
        error: args.error,
      },
      skill_id: args.skillId,
      principal_actor_id: actorIdFor(principal),
      artifacts: [],
      history: [],
      metadata: {
        propose_only: args.proposeOnly,
        correlation_id: args.correlationId,
        ...(args.governanceHold ? { server_governance_hold: args.governanceHold } : {}),
      },
    };
    await this.taskStore.put(task);
    return task;
  }

  private withStatus(
    task: A2aTask,
    state: A2aTaskState,
    patch: { message?: A2aMessage; error?: A2aTaskError; artifacts?: readonly A2aArtifact[] } = {}
  ): A2aTask {
    return {
      ...task,
      status: {
        state,
        timestamp: this.now(),
        ...(patch.message ? { message: patch.message } : {}),
        ...(patch.error ? { error: patch.error } : {}),
      },
      artifacts: patch.artifacts ?? task.artifacts,
    };
  }
}

const userMessageFromTask = (task: string): A2aMessage => ({
  role: 'user',
  parts: [{ type: 'text', text: task }],
});

const buildArtifactFromResult = (result: DispatchResult): A2aArtifact => ({
  name: `${result.skill_id}.result`,
  description: `Structured output of skill ${result.skill_id}`,
  parts: [
    { type: 'text', text: result.summary },
    {
      type: 'data',
      data: {
        structured_output: result.structured_output,
        trace: result.trace,
        mutation_intents: result.mutation_intents,
      },
    },
  ],
  metadata: {
    reasoning_trace_id: result.trace.reasoning_trace_id,
    gen_ai_operation: result.trace.gen_ai_operation,
    mutation_intent_count: result.mutation_intents.length,
  },
});
