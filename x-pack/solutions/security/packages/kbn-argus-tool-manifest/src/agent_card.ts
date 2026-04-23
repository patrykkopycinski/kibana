/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { A2aSkillCapability, ProjectedManifest } from './types';

/**
 * A2A agent card served at GET /.well-known/agent.json. Minimal viable shape
 * (A2A v0.2 draft): an id, name, description, capabilities list, and the
 * set of skills the caller is authorized to invoke.
 *
 * `capabilities` states what task-lifecycle features the server supports.
 * v1 ships sync `tasks/send` only; streaming + cancellation land with
 * `@kbn/argus-a2a-server` v2 (tracked in roadmap/r12-a2a.md).
 */
export interface A2aAgentCard {
  readonly schema_version: '0.2.0';
  readonly agent_id: string;
  readonly name: string;
  readonly description: string;
  readonly owner: {
    readonly name: string;
    readonly url: string;
  };
  readonly capabilities: {
    readonly tasks_send: boolean;
    readonly tasks_send_subscribe: boolean;
    readonly tasks_cancel: boolean;
    readonly tasks_resubscribe: boolean;
    readonly streaming: boolean;
    readonly push_notifications: boolean;
  };
  readonly skills: readonly A2aSkillCapability[];
  readonly governance_hold?: string;
}

export const ARGUS_A2A_AGENT_ID = 'elastic.security.argus';

/**
 * Assemble the agent card from a projected manifest. Split out so the server
 * only needs to call `projectManifestFor` + `assembleAgentCard` per request.
 */
export const assembleAgentCard = (manifest: ProjectedManifest): A2aAgentCard => {
  return {
    schema_version: '0.2.0',
    agent_id: ARGUS_A2A_AGENT_ID,
    name: 'Argus — Elastic Autonomous SOC',
    description:
      'Elastic Security Argus: autonomous SOC skill surface. Every tool call is funneled through the same trust-tier, door-class, blast-radius, adversarial, and reasoning-watchdog gates that native Argus actors face.',
    owner: {
      name: 'Elastic',
      url: 'https://www.elastic.co/security',
    },
    capabilities: {
      tasks_send: true,
      tasks_send_subscribe: false,
      tasks_cancel: false,
      tasks_resubscribe: false,
      streaming: false,
      push_notifications: false,
    },
    skills: manifest.a2a_skills,
    ...(manifest.governance_hold ? { governance_hold: manifest.governance_hold } : {}),
  };
};
