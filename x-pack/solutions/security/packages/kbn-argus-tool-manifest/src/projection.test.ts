/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MCP_TOOL_NAMESPACE, applyGovernance, projectManifestFor } from './projection';
import type { ArgusSkillDescriptor, GovernanceSnapshot, Principal } from './types';

const SKILLS: readonly ArgusSkillDescriptor[] = Object.freeze([
  {
    id: 'soc-proactive-hunt',
    name: 'Proactive Hunt',
    description: 'Hypothesis-driven hunts.',
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
  {
    id: 'soc-rule-retirement',
    name: 'Rule Retirement',
    description: 'Retires stale rules.',
    content: 'SYSTEM PROMPT — MUST NOT LEAK',
    tool_ids: ['platform.core.search', 'security.rule_delete'],
  },
]);

const HEALTHY_GOVERNANCE: GovernanceSnapshot = Object.freeze({
  adversarial_gate: 'pass',
  adversarial_min_no_secret_leakage: 1,
  reasoning_gate: 'pass',
  watchdog_frozen: false,
});

const CLAUDE_DESKTOP: Principal = Object.freeze({
  protocol: 'mcp',
  client_id: 'claude-desktop',
  profile: 'operator',
});

const READONLY_CURSOR: Principal = Object.freeze({
  protocol: 'mcp',
  client_id: 'cursor',
  profile: 'read-only',
});

describe('applyGovernance', () => {
  it('passes the requested profile when all preconditions hold', () => {
    const d = applyGovernance('operator', HEALTHY_GOVERNANCE);
    expect(d.effective_profile).toBe('operator');
    expect(d.hold_reason).toBeNull();
  });

  it('downshifts to read-only when the adversarial gate fails', () => {
    const d = applyGovernance('operator', {
      ...HEALTHY_GOVERNANCE,
      adversarial_gate: 'fail',
    });
    expect(d.effective_profile).toBe('read-only');
    expect(d.hold_reason).toMatch(/adversarial_gate=fail/);
  });

  it('downshifts to read-only on ANY secret leakage, even if the gate is pass', () => {
    const d = applyGovernance('advisory', {
      ...HEALTHY_GOVERNANCE,
      adversarial_min_no_secret_leakage: 0.5,
    });
    expect(d.effective_profile).toBe('read-only');
    expect(d.hold_reason).toMatch(/leakage=0\.5/);
  });

  it('downshifts when reasoning gate fails', () => {
    const d = applyGovernance('operator', {
      ...HEALTHY_GOVERNANCE,
      reasoning_gate: 'fail',
    });
    expect(d.effective_profile).toBe('read-only');
    expect(d.hold_reason).toMatch(/reasoning_gate=fail/);
  });

  it('downshifts when the principal is watchdog-frozen', () => {
    const d = applyGovernance('advisory', { ...HEALTHY_GOVERNANCE, watchdog_frozen: true });
    expect(d.effective_profile).toBe('read-only');
    expect(d.hold_reason).toMatch(/watchdog_frozen/);
  });

  it('never holds a read-only principal (there is nothing to hold back)', () => {
    const d = applyGovernance('read-only', {
      ...HEALTHY_GOVERNANCE,
      adversarial_gate: 'fail',
      watchdog_frozen: true,
    });
    expect(d.effective_profile).toBe('read-only');
    expect(d.hold_reason).toBeNull();
  });
});

describe('projectManifestFor', () => {
  it('exposes the full catalog to a healthy operator', () => {
    const m = projectManifestFor(CLAUDE_DESKTOP, SKILLS, HEALTHY_GOVERNANCE);
    expect(m.mcp_tools).toHaveLength(3);
    expect(m.a2a_skills).toHaveLength(3);
    expect(m.governance_hold).toBeUndefined();
    expect(m.principal.profile).toBe('operator');
  });

  it('exposes ONLY read-only skills to a read-only principal', () => {
    const m = projectManifestFor(READONLY_CURSOR, SKILLS, HEALTHY_GOVERNANCE);
    expect(m.mcp_tools.map((t) => t._meta.skill_id)).toEqual(['soc-proactive-hunt']);
    expect(m.a2a_skills.map((s) => s.id)).toEqual(['soc-proactive-hunt']);
  });

  it('shrinks an operator principal to read-only when the adversarial gate fails', () => {
    const m = projectManifestFor(CLAUDE_DESKTOP, SKILLS, {
      ...HEALTHY_GOVERNANCE,
      adversarial_gate: 'fail',
    });
    expect(m.principal.profile).toBe('read-only');
    expect(m.mcp_tools).toHaveLength(1);
    expect(m.governance_hold).toMatch(/adversarial_gate=fail/);
  });

  it('namespaces MCP tool names under argus.skill.*', () => {
    const m = projectManifestFor(CLAUDE_DESKTOP, SKILLS, HEALTHY_GOVERNANCE);
    for (const t of m.mcp_tools) {
      expect(t.name.startsWith(MCP_TOOL_NAMESPACE)).toBe(true);
    }
  });

  it('stamps owning_actor with the protocol-qualified client id', () => {
    const m = projectManifestFor(CLAUDE_DESKTOP, SKILLS, HEALTHY_GOVERNANCE);
    for (const t of m.mcp_tools) {
      expect(t._meta.owning_actor).toBe('mcp:claude-desktop');
    }
  });

  it('never leaks the skill system prompt into the MCP descriptor', () => {
    const m = projectManifestFor(CLAUDE_DESKTOP, SKILLS, HEALTHY_GOVERNANCE);
    const flat = JSON.stringify(m);
    expect(flat).not.toContain('SYSTEM PROMPT');
    expect(flat).not.toContain('MUST NOT LEAK');
  });

  it('never leaks the skill system prompt into the A2A agent card', () => {
    const m = projectManifestFor(CLAUDE_DESKTOP, SKILLS, HEALTHY_GOVERNANCE);
    const flat = JSON.stringify(m.a2a_skills);
    expect(flat).not.toContain('SYSTEM PROMPT');
  });
});
