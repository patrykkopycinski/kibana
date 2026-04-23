/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { computeToolAnnotations } from './annotations';
import { ARGUS_SKILL_INPUT_SCHEMA, ARGUS_SKILL_OUTPUT_SCHEMA } from './schemas';
import type {
  A2aSkillCapability,
  ArgusSkillDescriptor,
  GovernanceSnapshot,
  McpToolDescriptor,
  Principal,
  PrincipalProfile,
  ProjectedManifest,
} from './types';

export const MCP_TOOL_NAMESPACE = 'argus.skill.';

/**
 * The principal's *effective* profile after governance preconditions are
 * applied. Returns null instead of a reason string when no hold is needed.
 */
interface GovernanceDecision {
  readonly effective_profile: PrincipalProfile;
  readonly hold_reason: string | null;
}

const describeGate = (
  gate: 'pass' | 'marginal' | 'fail' | 'unknown',
  allowedForWrites: readonly ('pass' | 'marginal' | 'fail' | 'unknown')[]
): boolean => allowedForWrites.includes(gate);

/**
 * Apply the scaffold's hard preconditions (Section 2 of the R12 scaffold):
 *   1. latest adversarial run passes / marginal AND no_secret_leakage == 1.0
 *   2. latest reasoning run passes / marginal
 *   3. principal is not watchdog_frozen
 *
 * A `read-only` principal is never held back — they don't touch any write
 * path. Any write-capable profile downshifts to `read-only` if any
 * precondition fails, with `hold_reason` explaining which one.
 */
export const applyGovernance = (
  requested: PrincipalProfile,
  snapshot: GovernanceSnapshot
): GovernanceDecision => {
  if (requested === 'read-only') {
    return { effective_profile: 'read-only', hold_reason: null };
  }

  if (snapshot.watchdog_frozen) {
    return {
      effective_profile: 'read-only',
      hold_reason: 'principal is watchdog_frozen',
    };
  }

  if (
    !describeGate(snapshot.adversarial_gate, ['pass', 'marginal']) ||
    snapshot.adversarial_min_no_secret_leakage < 1
  ) {
    return {
      effective_profile: 'read-only',
      hold_reason: `adversarial_gate=${snapshot.adversarial_gate} leakage=${snapshot.adversarial_min_no_secret_leakage}`,
    };
  }

  if (!describeGate(snapshot.reasoning_gate, ['pass', 'marginal'])) {
    return {
      effective_profile: 'read-only',
      hold_reason: `reasoning_gate=${snapshot.reasoning_gate}`,
    };
  }

  return { effective_profile: requested, hold_reason: null };
};

/**
 * A skill is exposed to a given profile iff:
 *   read-only → the skill's tool_ids have no write/destructive pattern
 *   advisory  → all skills; server will force propose_only=true at dispatch
 *   operator  → all skills; server hands through to the trust gate
 */
export const isSkillExposedToProfile = (
  annotations: ReturnType<typeof computeToolAnnotations>,
  profile: PrincipalProfile
): boolean => {
  if (profile === 'read-only') return annotations.readOnlyHint;
  return true;
};

export const projectSkillToMcp = (
  skill: ArgusSkillDescriptor,
  owningActor: string
): McpToolDescriptor => {
  const annotations = computeToolAnnotations(skill.id, skill.tool_ids);
  return {
    name: `${MCP_TOOL_NAMESPACE}${skill.id}`,
    description: skill.description,
    inputSchema: ARGUS_SKILL_INPUT_SCHEMA,
    outputSchema: ARGUS_SKILL_OUTPUT_SCHEMA,
    annotations,
    _meta: {
      skill_id: skill.id,
      owning_actor: owningActor,
    },
  };
};

export const projectSkillToA2a = (skill: ArgusSkillDescriptor): A2aSkillCapability => {
  const annotations = computeToolAnnotations(skill.id, skill.tool_ids);
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    input_schema: ARGUS_SKILL_INPUT_SCHEMA,
    output_schema: ARGUS_SKILL_OUTPUT_SCHEMA,
    annotations,
  };
};

/**
 * The single entry point the server should call on every list_tools /
 * agent-card request. Pure — given the same inputs it produces the same
 * output. Must not be cached across requests because the governance
 * snapshot changes as new eval runs land.
 */
export const projectManifestFor = (
  principal: Principal,
  skills: readonly ArgusSkillDescriptor[],
  governance: GovernanceSnapshot
): ProjectedManifest => {
  const decision = applyGovernance(principal.profile, governance);
  const effectivePrincipal: Principal = {
    ...principal,
    profile: decision.effective_profile,
  };

  const owningActor = `${principal.protocol}:${principal.client_id}`;
  const eligible = skills.filter((skill) => {
    const annotations = computeToolAnnotations(skill.id, skill.tool_ids);
    return isSkillExposedToProfile(annotations, decision.effective_profile);
  });

  const manifest: ProjectedManifest = {
    principal: effectivePrincipal,
    mcp_tools: eligible.map((s) => projectSkillToMcp(s, owningActor)),
    a2a_skills: eligible.map((s) => projectSkillToA2a(s)),
    ...(decision.hold_reason ? { governance_hold: decision.hold_reason } : {}),
  };

  return manifest;
};
