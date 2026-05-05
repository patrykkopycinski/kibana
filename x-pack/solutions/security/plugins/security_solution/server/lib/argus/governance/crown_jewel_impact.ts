/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AssetMatcher, AssetTier, SocCrownJewelDocument } from '../synthesis/contracts';

/**
 * Crown-jewel asset-aware governance gate (B5 — closes 6.3 + completes the
 * HITL contract).
 *
 * The autonomous applier consults this helper between the trust-tier gate
 * and the budget gate. It answers a single question:
 *
 *   "Given the affected targets of this mutation intent, which crown-jewel
 *    assets are touched, what's the highest tier touched, and should the
 *    intent be auto-applied or routed to `pending_review`?"
 *
 * The helper is a pure function so it stays trivially unit-testable. Loading
 * the crown-jewel snapshot from `.soc-crown-jewels` is the caller's job (the
 * workflow step `security.argusEvaluateCrownJewelImpact` does this with a
 * scoped Elasticsearch client). The split keeps the `evaluateCrownJewelImpact`
 * function dependency-free of `@kbn/core` so the same logic is reusable from
 * the chat tool (where the inference connector loads the snapshot) and from
 * the CLI (where a fixture file does).
 *
 * Tier → recommended-action escalation:
 *
 *   - `silver` matched → `pending_review` unless the gate is explicitly
 *     opted out of via `gate_active=false` on the asset doc itself. Silver
 *     is "sensitive but not unique" — auto-apply is OK in principle, but
 *     the intent is logged for visibility.
 *   - `gold`     → always `pending_review`.
 *   - `platinum` → always `pending_review`.
 *   - `crown`    → always `pending_review`. Plus, the assessment carries a
 *                  `crown_match: true` flag so the audit-trail / reviewer UI
 *                  can highlight it loudly.
 *
 * The helper never blocks outright — `recommended_action` is only ever
 * `proceed` or `pending_review`. Hard blocks remain the operator's job
 * via `.soc-kill-switch` (per the existing applier cascade). The escalation
 * matrix above is intentionally simple: the goal is to be loud about
 * crown-jewel impact, not to auto-deny everything that grazes a tier.
 */
export interface MutationTargets {
  readonly host_names?: readonly string[];
  readonly host_ips?: readonly string[];
  readonly user_names?: readonly string[];
  readonly user_ids?: readonly string[];
  readonly service_names?: readonly string[];
  readonly index_patterns?: readonly string[];
  readonly tags?: readonly string[];
}

export interface AffectedAsset {
  readonly asset_id: string;
  readonly asset_type: SocCrownJewelDocument['asset_type'];
  readonly tier: AssetTier;
  readonly owner: string;
  readonly name: string;
  /** Which matcher kind triggered the match. */
  readonly matched_kind: AssetMatcher['kind'];
  /** Which matcher value triggered the match. */
  readonly matched_value: string;
  /** Mirrors the source doc; `gate_active=false` assets still report. */
  readonly gate_active: boolean;
}

export type RecommendedAction = 'proceed' | 'pending_review';

export interface CrownJewelAssessment {
  readonly affected: readonly AffectedAsset[];
  readonly affected_count: number;
  /** Highest tier among affected assets, or 'none' if no asset matched. */
  readonly max_tier: AssetTier | 'none';
  /** Convenience flag set when any matched asset is tier `crown`. */
  readonly crown_match: boolean;
  readonly recommended_action: RecommendedAction;
  /**
   * Reason string suitable for an audit-trail row. Always populated for the
   * benefit of `.soc-autonomy-decisions`.
   */
  readonly reason: string;
}

const TIER_ORDER: readonly AssetTier[] = ['silver', 'gold', 'platinum', 'crown'];

const tierRank = (tier: AssetTier): number => TIER_ORDER.indexOf(tier);

/**
 * Wildcard match supporting `*` only (no character classes / regex). Mirrors
 * the simple glob semantics Elasticsearch uses for wildcard queries on
 * keyword fields.
 */
const wildcardMatch = (pattern: string, value: string): boolean => {
  if (!pattern.includes('*')) return pattern === value;
  // Escape regex specials except `*`, then translate `*` to `.*`.
  const reSrc = pattern
    .split('*')
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${reSrc}$`).test(value);
};

/**
 * Match a single matcher against the targets. Returns the first matched
 * `(kind, value)` tuple, or `null` if no match.
 */
const matchMatcher = (
  matcher: AssetMatcher,
  targets: MutationTargets
): { kind: AssetMatcher['kind']; value: string } | null => {
  const targetsForKind: Record<AssetMatcher['kind'], readonly string[] | undefined> = {
    host_name: targets.host_names,
    host_ip: targets.host_ips,
    host_ip_range: targets.host_ips,
    user_name: targets.user_names,
    user_id: targets.user_ids,
    service_name: targets.service_names,
    index_pattern: targets.index_patterns,
    tag: targets.tags,
  };
  const candidates = targetsForKind[matcher.kind] ?? [];
  if (candidates.length === 0) return null;

  const mode = matcher.match_mode ?? 'terms';

  let matched: { kind: AssetMatcher['kind']; value: string } | null = null;
  if (matcher.kind === 'host_ip_range') {
    // CIDR semantics. Each `values[]` entry is a CIDR; each candidate is a
    // dotted-quad. IPv6 is intentionally out of scope for v1 — operators
    // who need it can mark match_mode='wildcard' and use a network prefix
    // as a wildcard.
    for (const cidr of matcher.values) {
      for (const ip of candidates) {
        if (cidrIncludes(cidr, ip)) {
          matched = { kind: matcher.kind, value: cidr };
          break;
        }
      }
      if (matched) break;
    }
    return matched;
  }

  if (mode === 'wildcard') {
    for (const pattern of matcher.values) {
      for (const candidate of candidates) {
        if (wildcardMatch(pattern, candidate)) {
          matched = { kind: matcher.kind, value: pattern };
          break;
        }
      }
      if (matched) break;
    }
    return matched;
  }

  // 'terms' (default) — exact-string compare.
  const candidateSet = new Set(candidates);
  for (const value of matcher.values) {
    if (candidateSet.has(value)) {
      matched = { kind: matcher.kind, value };
      break;
    }
  }
  return matched;
};

/**
 * IPv4 CIDR inclusion. Returns false for malformed input rather than throwing
 * — a malformed CIDR in the asset register should not crash the applier; it
 * should fail-silent on that one matcher and be caught by the registry doc's
 * Zod validator at write-time.
 *
 * Implemented with arithmetic only (no bitwise ops) per project lint policy.
 * The check walks octet by octet: the first `floor(prefix / 8)` octets must
 * match exactly; the next partial-octet (if any) must match in its high
 * `prefix % 8` bits, computed via integer division by `2 ** (8 - bits)`;
 * the remaining octets are unconstrained.
 */
const cidrIncludes = (cidr: string, ip: string): boolean => {
  const slashIdx = cidr.indexOf('/');
  if (slashIdx === -1) return false;
  const networkStr = cidr.slice(0, slashIdx);
  const prefixStr = cidr.slice(slashIdx + 1);
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const networkOctets = ipv4Octets(networkStr);
  const ipOctets = ipv4Octets(ip);
  if (!networkOctets || !ipOctets) return false;
  if (prefix === 0) return true;

  const fullOctetCount = Math.floor(prefix / 8);
  const partialBits = prefix - fullOctetCount * 8;

  for (let i = 0; i < fullOctetCount; i += 1) {
    if (networkOctets[i] !== ipOctets[i]) return false;
  }
  if (partialBits === 0) return true;
  const partialOctetIdx = fullOctetCount;
  const ignoreBits = 8 - partialBits;
  const divisor = 2 ** ignoreBits;
  return (
    Math.floor(networkOctets[partialOctetIdx] / divisor) ===
    Math.floor(ipOctets[partialOctetIdx] / divisor)
  );
};

const ipv4Octets = (ip: string): number[] | null => {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets;
};

/**
 * Pure evaluator. Takes the affected targets of a mutation intent + a snapshot
 * of `.soc-crown-jewels` and returns the assessment.
 *
 * `jewels` should already be Zod-validated (the workflow step does this when
 * loading from ES). The helper is forgiving: any document whose
 * `match_patterns[]` is missing or empty is silently skipped — there is
 * nothing to match against.
 */
export const evaluateCrownJewelImpact = (
  targets: MutationTargets,
  jewels: readonly SocCrownJewelDocument[]
): CrownJewelAssessment => {
  const affected: AffectedAsset[] = [];
  for (const jewel of jewels) {
    if (jewel.match_patterns && jewel.match_patterns.length > 0) {
      let matched: { kind: AssetMatcher['kind']; value: string } | null = null;
      for (const matcher of jewel.match_patterns) {
        matched = matchMatcher(matcher, targets);
        if (matched) break;
      }
      if (matched) {
        affected.push({
          asset_id: jewel.asset_id,
          asset_type: jewel.asset_type,
          tier: jewel.tier,
          owner: jewel.owner,
          name: jewel.name,
          matched_kind: matched.kind,
          matched_value: matched.value,
          gate_active: jewel.gate_active ?? true,
        });
      }
    }
  }

  if (affected.length === 0) {
    return {
      affected: [],
      affected_count: 0,
      max_tier: 'none',
      crown_match: false,
      recommended_action: 'proceed',
      reason: 'No crown-jewel assets matched the mutation targets.',
    };
  }

  const maxTier = affected.reduce<AssetTier>(
    (acc, a) => (tierRank(a.tier) > tierRank(acc) ? a.tier : acc),
    affected[0].tier
  );
  const crownMatch = affected.some((a) => a.tier === 'crown');

  // Escalation matrix: gold/platinum/crown always escalate. Silver only
  // escalates if at least one matched asset has gate_active=true.
  const anyActiveSilverOrAbove = affected.some(
    (a) => a.gate_active !== false && tierRank(a.tier) >= tierRank('silver')
  );
  const recommendedAction: RecommendedAction =
    tierRank(maxTier) >= tierRank('gold') || (maxTier === 'silver' && anyActiveSilverOrAbove)
      ? 'pending_review'
      : 'proceed';

  const reason =
    recommendedAction === 'pending_review'
      ? `Crown-jewel gate triggered (max_tier=${maxTier}${crownMatch ? ', CROWN match' : ''}, ` +
        `affected=${affected.length}). Routing to pending_review.`
      : `Crown-jewel match recorded (max_tier=${maxTier}, affected=${affected.length}) ` +
        `but no asset has gate_active=true.`;

  return {
    affected,
    affected_count: affected.length,
    max_tier: maxTier,
    crown_match: crownMatch,
    recommended_action: recommendedAction,
    reason,
  };
};
