/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ARGUS_A2A_AGENT_ID, assembleAgentCard } from './agent_card';
import { projectManifestFor } from './projection';
import type { ArgusSkillDescriptor, GovernanceSnapshot, Principal } from './types';

const SKILLS: readonly ArgusSkillDescriptor[] = Object.freeze([
  {
    id: 'soc-proactive-hunt',
    name: 'Proactive Hunt',
    description: 'Hypothesis-driven hunts.',
    content: 'SYSTEM PROMPT',
    tool_ids: ['platform.core.search'],
  },
]);

const HEALTHY: GovernanceSnapshot = Object.freeze({
  adversarial_gate: 'pass',
  adversarial_min_no_secret_leakage: 1,
  reasoning_gate: 'pass',
  watchdog_frozen: false,
});

const PEER: Principal = Object.freeze({
  protocol: 'a2a',
  client_id: 'sentinel-copilot',
  profile: 'advisory',
});

describe('assembleAgentCard', () => {
  it('declares only sync tasks/send in v1', () => {
    const card = assembleAgentCard(projectManifestFor(PEER, SKILLS, HEALTHY));
    expect(card.capabilities.tasks_send).toBe(true);
    expect(card.capabilities.tasks_send_subscribe).toBe(false);
    expect(card.capabilities.tasks_cancel).toBe(false);
    expect(card.capabilities.streaming).toBe(false);
  });

  it('carries the projected skill list into the card', () => {
    const card = assembleAgentCard(projectManifestFor(PEER, SKILLS, HEALTHY));
    expect(card.skills.map((s) => s.id)).toEqual(['soc-proactive-hunt']);
    expect(card.agent_id).toBe(ARGUS_A2A_AGENT_ID);
  });

  it('propagates governance_hold when the manifest is held back', () => {
    const card = assembleAgentCard(
      projectManifestFor({ ...PEER, profile: 'operator' }, SKILLS, {
        ...HEALTHY,
        adversarial_gate: 'fail',
      })
    );
    expect(card.governance_hold).toMatch(/adversarial_gate=fail/);
  });
});
