/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ArgusSkillDescriptor, GovernanceSnapshot, Principal } from '@kbn/argus-tool-manifest';

import { ArgusMcpCore, type CoreLogger } from './core';
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

const FAKE_NOW = () => 1700000000000;

const fakeGovernance = (snap: GovernanceSnapshot): GovernanceClient => ({
  snapshot: async () => snap,
});

interface RecordedCall {
  req: DispatchRequest;
  calls: number;
}

const fakeDispatcher = (): {
  dispatcher: SkillDispatcher;
  history: RecordedCall[];
  setResponse: (r: DispatchResult) => void;
  setFailure: (e: Error) => void;
} => {
  const history: RecordedCall[] = [];
  let response: DispatchResult | null = null;
  let failure: Error | null = null;

  const dispatcher: SkillDispatcher = {
    dispatch: async (req) => {
      const existing = history.find((c) => c.req.correlation_id === req.correlation_id);
      if (existing) {
        existing.calls += 1;
      } else {
        history.push({ req, calls: 1 });
      }
      if (failure) throw failure;
      return (
        response ?? {
          skill_id: req.skill.id,
          summary: `ran ${req.skill.id}`,
          structured_output: {},
          trace: {
            reasoning_trace_id: `trace-${req.correlation_id}`,
            gen_ai_operation: `argus.skill.${req.skill.id}`,
          },
          mutation_intents: [],
        }
      );
    },
  };

  return {
    dispatcher,
    history,
    setResponse: (r) => {
      response = r;
    },
    setFailure: (e) => {
      failure = e;
    },
  };
};

const operator = (): Principal => ({
  protocol: 'mcp',
  client_id: 'claude-desktop',
  profile: 'operator',
});

const advisory = (): Principal => ({
  protocol: 'mcp',
  client_id: 'cursor',
  profile: 'advisory',
});

const readonly = (): Principal => ({
  protocol: 'mcp',
  client_id: 'copilot',
  profile: 'read-only',
});

describe('ArgusMcpCore.handleListTools', () => {
  it('exposes the full catalog to a healthy operator', async () => {
    const d = fakeDispatcher();
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance(HEALTHY),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    const resp = await core.handleListTools(operator());
    expect(resp.tools.map((t) => t._meta.skill_id).sort()).toEqual(
      ['soc-proactive-hunt', 'soc-rule-tuner'].sort()
    );
    expect(resp._meta.effective_profile).toBe('operator');
    expect(resp._meta.server_governance_hold).toBeUndefined();
  });

  it('exposes only read-only skills to a read-only principal', async () => {
    const d = fakeDispatcher();
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance(HEALTHY),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    const resp = await core.handleListTools(readonly());
    expect(resp.tools.map((t) => t._meta.skill_id)).toEqual(['soc-proactive-hunt']);
  });

  it('shrinks to read-only and surfaces governance_hold when adversarial gate fails', async () => {
    const d = fakeDispatcher();
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance({ ...HEALTHY, adversarial_gate: 'fail' }),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    const resp = await core.handleListTools(operator());
    expect(resp._meta.effective_profile).toBe('read-only');
    expect(resp._meta.server_governance_hold).toMatch(/adversarial_gate=fail/);
    expect(resp.tools.map((t) => t._meta.skill_id)).toEqual(['soc-proactive-hunt']);
  });
});

describe('ArgusMcpCore.handleCallTool', () => {
  it('dispatches a valid call and returns the structured content', async () => {
    const d = fakeDispatcher();
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance(HEALTHY),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    const resp = await core.handleCallTool(operator(), 'argus.skill.soc-proactive-hunt', {
      task: 'hunt for T1059 on host-42',
      correlation_id: 'corr-xyz',
    });
    expect(resp.isError).toBeFalsy();
    expect(resp._meta.correlation_id).toBe('corr-xyz');
    expect(resp.structuredContent?.trace).toBeDefined();
    expect(d.history).toHaveLength(1);
    expect(d.history[0].req.propose_only).toBe(false);
  });

  it('REJECTS a tool that is not exposed to the principal', async () => {
    const d = fakeDispatcher();
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance(HEALTHY),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    const resp = await core.handleCallTool(readonly(), 'argus.skill.soc-rule-tuner', {
      task: 'tune noisy rule',
    });
    expect(resp.isError).toBe(true);
    expect(resp._meta.error?.code).toBe('unknown_tool');
    expect(d.history).toHaveLength(0);
  });

  it('REJECTS a tool whose name is outside the argus.skill.* namespace', async () => {
    const d = fakeDispatcher();
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance(HEALTHY),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    const resp = await core.handleCallTool(operator(), 'fs.read_file', { task: 'exfil' });
    expect(resp.isError).toBe(true);
    expect(resp._meta.error?.code).toBe('unknown_tool');
    expect(d.history).toHaveLength(0);
  });

  it('FORCES propose_only=true for the advisory profile regardless of the payload', async () => {
    const d = fakeDispatcher();
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance(HEALTHY),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    const resp = await core.handleCallTool(advisory(), 'argus.skill.soc-rule-tuner', {
      task: 'tune a rule',
      propose_only: false,
    });
    expect(resp.isError).toBeFalsy();
    expect(resp._meta.propose_only).toBe(true);
    expect(d.history[0].req.propose_only).toBe(true);
  });

  it('lets operator callers keep propose_only=false when they want it', async () => {
    const d = fakeDispatcher();
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance(HEALTHY),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    await core.handleCallTool(operator(), 'argus.skill.soc-rule-tuner', {
      task: 'tune a rule',
      propose_only: false,
    });
    expect(d.history[0].req.propose_only).toBe(false);
  });

  it('enforces propose_only=true ALSO when governance has shrunk an operator to read-only-equivalent (advisory effective path)', async () => {
    const d = fakeDispatcher();
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance({
        ...HEALTHY,
        adversarial_min_no_secret_leakage: 0.5,
      }),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    const resp = await core.handleCallTool(operator(), 'argus.skill.soc-rule-tuner', {
      task: 'tune a rule',
    });
    expect(resp.isError).toBe(true);
    expect(resp._meta.error?.code).toBe('unknown_tool');
  });

  it('validates arguments and returns invalid_arguments on bad input', async () => {
    const d = fakeDispatcher();
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance(HEALTHY),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    const resp = await core.handleCallTool(operator(), 'argus.skill.soc-proactive-hunt', {
      task: '',
    });
    expect(resp.isError).toBe(true);
    expect(resp._meta.error?.code).toBe('invalid_arguments');
  });

  it('converts dispatcher failures to dispatch_failed with the correlation id preserved', async () => {
    const d = fakeDispatcher();
    d.setFailure(new Error('kibana converse 500'));
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance(HEALTHY),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    const resp = await core.handleCallTool(operator(), 'argus.skill.soc-proactive-hunt', {
      task: 'hunt',
      correlation_id: 'my-corr',
    });
    expect(resp.isError).toBe(true);
    expect(resp._meta.error?.code).toBe('dispatch_failed');
    expect(resp._meta.correlation_id).toBe('my-corr');
  });

  it('never leaks the skill system prompt into any response field', async () => {
    const d = fakeDispatcher();
    const core = new ArgusMcpCore({
      skills: SKILLS,
      governance: fakeGovernance(HEALTHY),
      dispatcher: d.dispatcher,
      logger: noopLogger,
      now: FAKE_NOW,
    });
    const list = await core.handleListTools(operator());
    const call = await core.handleCallTool(operator(), 'argus.skill.soc-proactive-hunt', {
      task: 'hunt',
    });
    const flat = JSON.stringify(list) + JSON.stringify(call);
    expect(flat).not.toContain('SYSTEM PROMPT');
    expect(flat).not.toContain('MUST NOT LEAK');
  });
});
