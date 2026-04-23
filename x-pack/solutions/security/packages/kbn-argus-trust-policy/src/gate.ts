/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Argus R7 — pure TypeScript spec for the trust-gate verdict matrix.
 *
 * The authoritative runtime implementation is Liquid inside
 * `soc-simulation/workflows/soc-argus-trust-gate.yaml`. This module is the
 * spec: it's exhaustively unit-tested and the YAML Liquid MUST mirror it
 * one-for-one. Any change to one side must be made on the other in the
 * same commit or the `trust_gate_liquid_matches_spec` consistency test
 * (see `src/gate.spec_alignment.test.ts`) will fail.
 *
 * This module is also importable from any future in-process gate (for
 * example the `@kbn/argus-mcp-server` policy bundle projector) so the MCP
 * and A2A surfaces enforce exactly the same matrix as the scheduled
 * YAML gate — Argus's governance invariant is "the same caller gets the
 * same answer no matter which transport they arrived on".
 */

export type DoorClass = 'one_way' | 'two_way';

export type BlastTier = 'small' | 'medium' | 'large' | 'critical';

export type TrustTier = 'frontier' | 'trusted' | 'probationary' | 'quarantined';

export type MutationOrigin =
  | 'exploit_to_detection'
  | 'drift_detected'
  | 'analyst'
  | 'triage'
  | 'recovery'
  | string;

export type GateVerdict = 'allow' | 'pending_review' | 'rejected_trust';

export type GateReason =
  | 'trust_policy_gate'
  | 'one_way_door_requires_human'
  | 'blast_tier_critical_requires_human'
  | 'blast_tier_large_exceeds_actor_cap'
  | 'no_actor_tier'
  | 'actor_quarantined'
  | 'frontier_origin_requires_frontier_tier';

export interface TrustGateInput {
  /** `argus.decision.door_class`. Missing defaults to `two_way`. */
  door_class?: DoorClass;
  /** `expected_impact.blast_tier`. Missing defaults to `small`. */
  blast_tier?: BlastTier;
  /** Trust tier of the producing actor. `null` means no tier row found. */
  tier: TrustTier | null;
  /** Producing agent origin. Missing defaults to `analyst`. */
  origin?: MutationOrigin;
}

export interface TrustGateResult {
  verdict: GateVerdict;
  reason: GateReason;
}

/**
 * Cap matrix by blast_tier per actor tier. `pending_review` means the
 * rec is downgraded regardless of door or origin; `allow` means the
 * downstream door/origin rules decide. `rejected_trust` only comes from
 * `tier=quarantined`.
 *
 * This matrix is intentionally read as a lookup — not derived — so
 * reviewers can eyeball the full policy in one place.
 */
const BLAST_CAP_BY_TIER: Readonly<
  Record<Exclude<TrustTier, 'quarantined'>, Readonly<Record<BlastTier, 'allow' | 'pending_review'>>>
> = {
  frontier: {
    small: 'allow',
    medium: 'allow',
    large: 'allow',
    critical: 'pending_review',
  },
  trusted: {
    small: 'allow',
    medium: 'allow',
    large: 'pending_review',
    critical: 'pending_review',
  },
  probationary: {
    small: 'pending_review',
    medium: 'pending_review',
    large: 'pending_review',
    critical: 'pending_review',
  },
};

/**
 * Origins classified as "frontier-class" — the synthesis engines that can
 * produce new detection content autonomously. These require tier=frontier
 * to auto-apply even when the door is two_way and the blast is small.
 */
const FRONTIER_ONLY_ORIGINS: ReadonlySet<string> = new Set([
  'exploit_to_detection',
  'drift_detected',
]);

/**
 * Pure trust-gate verdict. Deterministic — never hits the network,
 * never reads clocks, never mutates input. Matches the Liquid in
 * `soc-argus-trust-gate.yaml` verdict-for-verdict.
 */
export const evaluateTrustGate = (input: TrustGateInput): TrustGateResult => {
  const door: DoorClass = input.door_class ?? 'two_way';
  const blast: BlastTier = input.blast_tier ?? 'small';
  const origin: string = input.origin ?? 'analyst';

  // 1) No tier row → always pending_review.
  if (input.tier === null || input.tier === undefined) {
    return { verdict: 'pending_review', reason: 'no_actor_tier' };
  }

  // 2) Quarantined actors are rejected outright, regardless of
  //    door/blast. Mirrors the YAML's `rejected_trust` branch.
  if (input.tier === 'quarantined') {
    return { verdict: 'rejected_trust', reason: 'actor_quarantined' };
  }

  // 3) One-way doors always require a human, regardless of tier.
  if (door === 'one_way') {
    return { verdict: 'pending_review', reason: 'one_way_door_requires_human' };
  }

  // 4) Critical blast always requires a human, regardless of tier.
  if (blast === 'critical') {
    return { verdict: 'pending_review', reason: 'blast_tier_critical_requires_human' };
  }

  // 5) Blast-tier vs actor-tier cap.
  const tierCap = BLAST_CAP_BY_TIER[input.tier];
  const capDecision = tierCap[blast];
  if (capDecision === 'pending_review') {
    // `large` blast on a `trusted` actor fails the cap before origin.
    if (blast === 'large' && input.tier === 'trusted') {
      return { verdict: 'pending_review', reason: 'blast_tier_large_exceeds_actor_cap' };
    }
    return { verdict: 'pending_review', reason: 'trust_policy_gate' };
  }

  // 6) Frontier-origin restriction — content-synthesizing origins only
  //    auto-apply under tier=frontier, even if the blast cap would
  //    otherwise allow it on tier=trusted.
  if (FRONTIER_ONLY_ORIGINS.has(origin) && input.tier !== 'frontier') {
    return { verdict: 'pending_review', reason: 'frontier_origin_requires_frontier_tier' };
  }

  return { verdict: 'allow', reason: 'trust_policy_gate' };
};

/**
 * Exported for documentation / inspection. Useful for admin UIs that want
 * to render the live policy matrix.
 */
export const TRUST_GATE_MATRIX = Object.freeze({
  blastCapByTier: BLAST_CAP_BY_TIER,
  frontierOnlyOrigins: Array.from(FRONTIER_ONLY_ORIGINS),
});
