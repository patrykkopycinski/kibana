/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ArgusSkillDescriptor, GovernanceSnapshot, Principal } from '@kbn/argus-tool-manifest';

import { ArgusA2aCore, type CoreLogger } from './core';
import { InMemoryTaskStore } from './task_store';
import type { DispatchRequest, DispatchResult, GovernanceClient, SkillDispatcher } from './types';

const noopLogger: CoreLogger = {
  debug: () => {},
  info: () => {},
  warning: () => {},
  error: () => {},
};

const SKILLS: readonly ArgusSkillDescriptor[] = Object.freeze([
  {
    id: 'soc-proactive-hunt',
    name: 'Proactive Hunt',
    description: 'Hypothesis hunts.',
    content: 'SYSTEM PROMPT — MUST NOT LEAK',
    tool_ids: ['platform.core.search', 'security.alerts'],
  },
  {
    id: 'soc-rule-tuner',
    name: 'Rule Tuner',
    description: 'Proposes rule updates.',
    content: 'SYSTEM PROMPT — MUST NOT LEAK',
    tool_ids: ['platform.core.search', 'security.rule_update'],
  },
]);

const HEALTHY: GovernanceSnapshot = Object.freeze({
  adversarial_gate: 'pass',
  adversarial_min_no_secret_leakage: 1,
  reasoning_gate: 'pass',
  watchdog_frozen: false,
});

const fakeGovernance = (snap: GovernanceSnapshot): GovernanceClient => ({
  snapshot: async () => snap,
});

interface RecordedCall {
  req: DispatchRequest;
}

const fakeDispatcher = (): {
  dispatcher: SkillDispatcher;
  history: RecordedCall[];
  setFailure: (e: Error) => void;
} => {
  const history: RecordedCall[] = [];
  let failure: Error | null = null;

  const dispatcher: SkillDispatcher = {
    dispatch: async (req) => {
      history.push({ req });
      if (failure) throw failure;
      const result: DispatchResult = {
        skill_id: req.skill.id,
        summary: `ran ${req.skill.id}`,
        structured_output: { findings: ['f-1'] },
        trace: {
          reasoning_trace_id: `trace-${req.correlation_id}`,
          gen_ai_operation: `argus.skill.${req.skill.id}`,
        },
        mutation_intents: [],
      };
      return result;
    },
  };

  return {
    dispatcher,
    history,
    setFailure: (e) => {
      failure = e;
    },
  };
};

const operator = (): Principal => ({
  protocol: 'a2a',
  client_id: 'peer-alice',
  profile: 'operator',
});

const advisory = (): Principal => ({
  protocol: 'a2a',
  client_id: 'peer-bob',
  profile: 'advisory',
});

const readonly = (): Principal => ({
  protocol: 'a2a',
  client_id: 'peer-carol',
  profile: 'read-only',
});

let tickCounter = 0;
const FAKE_NOW = () => 1700000000000 + tickCounter++;
const stableIdFactory = () => `task-${tickCounter}`;

const buildCore = (snap: GovernanceSnapshot = HEALTHY) => {
  tickCounter = 0;
  const d = fakeDispatcher();
  const taskStore = new InMemoryTaskStore();
  const core = new ArgusA2aCore({
    skills: SKILLS,
    governance: fakeGovernance(snap),
    dispatcher: d.dispatcher,
    taskStore,
    logger: noopLogger,
    now: FAKE_NOW,
    idFactory: stableIdFactory,
  });
  return { core, d, taskStore };
};

describe('ArgusA2aCore.handleAgentCard', () => {
  it('exposes the full skill set to a healthy operator', async () => {
    const { core } = buildCore();
    const card = await core.handleAgentCard(operator());
    expect(card.agent_id).toBe('elastic.security.argus');
    expect(card.skills.map((s) => s.id).sort()).toEqual(
      ['soc-proactive-hunt', 'soc-rule-tuner'].sort()
    );
    expect(card.governance_hold).toBeUndefined();
  });

  it('shrinks the skill list to read-only and surfaces governance_hold when adversarial gate fails', async () => {
    const { core } = buildCore({ ...HEALTHY, adversarial_gate: 'fail' });
    const card = await core.handleAgentCard(operator());
    expect(card.skills.map((s) => s.id)).toEqual(['soc-proactive-hunt']);
    expect(card.governance_hold).toMatch(/adversarial_gate=fail/);
  });

  it('never advertises streaming or subscription capabilities in v1', async () => {
    const { core } = buildCore();
    const card = await core.handleAgentCard(operator());
    expect(card.capabilities.streaming).toBe(false);
    expect(card.capabilities.tasks_send_subscribe).toBe(false);
    expect(card.capabilities.tasks_send).toBe(true);
  });
});

describe('ArgusA2aCore.handleSendTask', () => {
  it('completes a valid task and persists the full lifecycle', async () => {
    const { core, d, taskStore } = buildCore();
    const task = await core.handleSendTask(operator(), {
      skill_id: 'soc-proactive-hunt',
      task: 'hunt for T1059 on host-42',
      correlation_id: 'corr-xyz',
    });
    expect(task.status.state).toBe('completed');
    expect(task.artifacts).toHaveLength(1);
    expect(task.artifacts[0].name).toBe('soc-proactive-hunt.result');
    expect(task.metadata.correlation_id).toBe('corr-xyz');
    expect(task.metadata.propose_only).toBe(false);
    expect(task.history).toHaveLength(2);

    const persisted = await taskStore.get(task.id);
    expect(persisted?.status.state).toBe('completed');
    expect(d.history).toHaveLength(1);
  });

  it('REJECTS a skill that is not exposed to the principal (no dispatch)', async () => {
    const { core, d } = buildCore();
    const task = await core.handleSendTask(readonly(), {
      skill_id: 'soc-rule-tuner',
      task: 'tune a noisy rule',
    });
    expect(task.status.state).toBe('failed');
    expect(task.status.error?.code).toBe('unknown_skill');
    expect(d.history).toHaveLength(0);
  });

  it('REJECTS an unknown skill id even if user made it up', async () => {
    const { core, d } = buildCore();
    const task = await core.handleSendTask(operator(), {
      skill_id: 'totally-made-up-skill',
      task: 'do a thing',
    });
    expect(task.status.state).toBe('failed');
    expect(task.status.error?.code).toBe('unknown_skill');
    expect(d.history).toHaveLength(0);
  });

  it('FORCES propose_only=true for advisory callers regardless of payload', async () => {
    const { core, d } = buildCore();
    const task = await core.handleSendTask(advisory(), {
      skill_id: 'soc-rule-tuner',
      task: 'tune a rule',
      propose_only: false,
    });
    expect(task.status.state).toBe('completed');
    expect(task.metadata.propose_only).toBe(true);
    expect(d.history[0].req.propose_only).toBe(true);
  });

  it('lets operator callers keep propose_only=false', async () => {
    const { core, d } = buildCore();
    const task = await core.handleSendTask(operator(), {
      skill_id: 'soc-rule-tuner',
      task: 'tune a rule',
      propose_only: false,
    });
    expect(task.status.state).toBe('completed');
    expect(task.metadata.propose_only).toBe(false);
    expect(d.history[0].req.propose_only).toBe(false);
  });

  it('surfaces governance_hold when the principal is shrunk to read-only by governance', async () => {
    const { core } = buildCore({ ...HEALTHY, adversarial_gate: 'fail' });
    const task = await core.handleSendTask(operator(), {
      skill_id: 'soc-rule-tuner',
      task: 'tune a rule',
    });
    expect(task.status.state).toBe('failed');
    expect(task.status.error?.code).toBe('governance_hold');
    expect(task.metadata.server_governance_hold).toMatch(/adversarial_gate=fail/);
  });

  it('validates input and returns invalid_input on bad payload', async () => {
    const { core, d } = buildCore();
    const task = await core.handleSendTask(operator(), {
      skill_id: 'soc-proactive-hunt',
      task: '',
    });
    expect(task.status.state).toBe('failed');
    expect(task.status.error?.code).toBe('invalid_input');
    expect(d.history).toHaveLength(0);
  });

  it('marks the task failed with dispatch_failed when the dispatcher throws', async () => {
    const { core, d, taskStore } = buildCore();
    d.setFailure(new Error('kibana converse 500'));
    const task = await core.handleSendTask(operator(), {
      skill_id: 'soc-proactive-hunt',
      task: 'hunt',
      correlation_id: 'my-corr',
    });
    expect(task.status.state).toBe('failed');
    expect(task.status.error?.code).toBe('dispatch_failed');
    expect(task.metadata.correlation_id).toBe('my-corr');

    const persisted = await taskStore.get(task.id);
    expect(persisted?.status.state).toBe('failed');
  });

  it('never leaks the skill system prompt into any task field', async () => {
    const { core } = buildCore();
    const task = await core.handleSendTask(operator(), {
      skill_id: 'soc-proactive-hunt',
      task: 'hunt',
    });
    const flat = JSON.stringify(task);
    expect(flat).not.toContain('SYSTEM PROMPT');
    expect(flat).not.toContain('MUST NOT LEAK');
  });

  it('namespaces actor ids with the protocol so a2a and mcp do not collide', async () => {
    const { core, taskStore } = buildCore();
    await core.handleSendTask(operator(), {
      skill_id: 'soc-proactive-hunt',
      task: 'hunt',
    });
    const a2aTasks = await taskStore.listForActor('a2a:peer-alice');
    const mcpTasks = await taskStore.listForActor('mcp:peer-alice');
    expect(a2aTasks).toHaveLength(1);
    expect(mcpTasks).toHaveLength(0);
  });
});

describe('ArgusA2aCore.handleGetTask', () => {
  it('returns a task the caller owns', async () => {
    const { core } = buildCore();
    const created = await core.handleSendTask(operator(), {
      skill_id: 'soc-proactive-hunt',
      task: 'hunt',
    });
    const got = await core.handleGetTask(operator(), created.id);
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.task.id).toBe(created.id);
  });

  it('returns not_found for unknown ids', async () => {
    const { core } = buildCore();
    const got = await core.handleGetTask(operator(), 'no-such-task');
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('not_found');
  });

  it('REJECTS cross-actor task reads with forbidden', async () => {
    const { core } = buildCore();
    const owned = await core.handleSendTask(operator(), {
      skill_id: 'soc-proactive-hunt',
      task: 'hunt',
    });
    const stranger: Principal = {
      protocol: 'a2a',
      client_id: 'peer-eve',
      profile: 'operator',
    };
    const got = await core.handleGetTask(stranger, owned.id);
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.code).toBe('forbidden');
  });
});
