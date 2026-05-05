/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import {
  coverageGapToAdvisory,
  validateCoverageGap,
  type CoverageGapInput,
  type StructuredAdvisory,
  type VariantProvider,
} from '@kbn/argus-exploit-to-detection';

import {
  evaluateCrownJewelImpact,
  type CrownJewelAssessment,
  type MutationTargets,
} from '../governance/crown_jewel_impact';
import type { SocCrownJewelDocument } from './contracts';
import { synthesizeOne, type SynthesizeOneOutcome } from './synthesize_one';

/**
 * B17 — Coverage-gap → Path A bridge.
 *
 * The bridge is split into three pure layers:
 *
 *   1. **Severity resolver** — `resolveCoverageGapSeverity` consumes the
 *      base severity the scanner reports + the crown-jewel assessment of
 *      the gap's affected targets and returns the *effective* severity to
 *      use for synthesis. Asset-aware: a gap on a `gold+` crown-jewel
 *      asset is bumped one tier up (capped at `critical`); a `crown`
 *      match is always pushed to `critical`.
 *   2. **Advisory adapter** — `coverageGapToAdvisory` (in
 *      `@kbn/argus-exploit-to-detection`) wraps the gap in a
 *      `StructuredAdvisory` so Path A's `synthesizeOne` runs unchanged.
 *   3. **Synthesis driver** — `synthesizeFromCoverageGap` calls
 *      `synthesizeOne` with `callerId='coverage_gap'` and post-decorates
 *      the produced envelope's `argus.origin` to `'coverage_gap'`. The
 *      crown-jewel assessment travels alongside the outcome so the
 *      caller can persist it on `.soc-autonomy-decisions` for audit.
 *
 * The driver itself is dependency-free of `@kbn/core`'s ES client — the
 * caller (workflow step / chat tool / CLI) loads the crown-jewel snapshot
 * and hands it in. That mirrors how `evaluateCrownJewelImpact` is wired
 * (B5) and keeps `synthesizeFromCoverageGap` trivially unit-testable.
 */
export type CoverageGapBaseSeverity = NonNullable<StructuredAdvisory['severity']>;

const SEVERITY_RANK: Record<CoverageGapBaseSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const RANK_TO_SEVERITY: readonly CoverageGapBaseSeverity[] = ['low', 'medium', 'high', 'critical'];

export interface ResolveCoverageGapSeverityResult {
  readonly effective_severity: CoverageGapBaseSeverity;
  readonly base_severity: CoverageGapBaseSeverity;
  readonly bumped: boolean;
  readonly reason: string;
}

/**
 * Resolve the effective severity of a coverage-gap-driven synthesis run
 * given the caller-supplied base severity and the crown-jewel assessment
 * of the gap's affected targets.
 *
 * Escalation matrix:
 *
 *   - `crown_match=true`        → effective = `critical` (always).
 *   - `max_tier='platinum'`     → effective = `max(base, 'critical')`.
 *   - `max_tier='gold'`         → effective = `max(base, 'high')`.
 *   - `max_tier='silver'`       → effective = `max(base, 'medium')`.
 *   - `max_tier='none'`         → effective = base (no bump).
 *
 * The "max" semantics mean a scanner-supplied `critical` is never demoted.
 * The bump is asymmetric — assets only ever raise severity, never lower
 * it. This stays consistent with the crown-jewel gate's "never auto-deny,
 * always escalate to pending_review" philosophy (B5).
 */
export const resolveCoverageGapSeverity = (
  base: CoverageGapBaseSeverity,
  assessment: CrownJewelAssessment
): ResolveCoverageGapSeverityResult => {
  if (assessment.crown_match) {
    return {
      effective_severity: 'critical',
      base_severity: base,
      bumped: base !== 'critical',
      reason: `crown_match=true → severity pinned to critical (base=${base}).`,
    };
  }

  let floor: CoverageGapBaseSeverity;
  switch (assessment.max_tier) {
    case 'platinum':
      floor = 'critical';
      break;
    case 'gold':
      floor = 'high';
      break;
    case 'silver':
      floor = 'medium';
      break;
    case 'crown':
      // Already handled by crown_match branch above; defensive.
      floor = 'critical';
      break;
    case 'none':
    default:
      return {
        effective_severity: base,
        base_severity: base,
        bumped: false,
        reason: 'No crown-jewel assets matched → severity unchanged.',
      };
  }

  const baseRank = SEVERITY_RANK[base];
  const floorRank = SEVERITY_RANK[floor];
  const winnerRank = Math.max(baseRank, floorRank);
  const effective = RANK_TO_SEVERITY[winnerRank];
  return {
    effective_severity: effective,
    base_severity: base,
    bumped: effective !== base,
    reason:
      effective === base
        ? `max_tier=${assessment.max_tier} (floor=${floor}) but base ${base} already meets it.`
        : `max_tier=${assessment.max_tier} (floor=${floor}) bumped severity from ${base} to ${effective}.`,
  };
};

/**
 * Translate a `CoverageGapInput.affected_targets` shape into the
 * `MutationTargets` shape the crown-jewel helper consumes. Pure +
 * deliberately field-by-field (the two shapes are intentionally aligned
 * but typed separately so each module can evolve without coupling).
 */
const toMutationTargets = (affected: CoverageGapInput['affected_targets']): MutationTargets => {
  if (!affected) return {};
  return {
    host_names: affected.host_names,
    host_ips: affected.host_ips,
    user_names: affected.user_names,
    user_ids: affected.user_ids,
    service_names: affected.service_names,
    index_patterns: affected.index_patterns,
    tags: affected.tags,
  };
};

export interface SynthesizeFromCoverageGapInput {
  readonly gap: CoverageGapInput;
  /**
   * Snapshot of `.soc-crown-jewels`. Caller is responsible for loading +
   * Zod-validating against `CrownJewelDocSchema` before passing in.
   * Empty array means no crown-jewel register is configured (or the
   * caller hasn't loaded one) — synthesis still runs but with no asset
   * bump.
   */
  readonly crownJewels: readonly SocCrownJewelDocument[];
  readonly provider?: VariantProvider;
  readonly providerName?: string;
  readonly logger: Logger;
  readonly now: number;
}

export interface SynthesizeFromCoverageGapOutcome extends SynthesizeOneOutcome {
  readonly origin: 'coverage_gap';
  readonly gap_id: string;
  readonly severity_resolution: ResolveCoverageGapSeverityResult;
  readonly crown_jewel_assessment: CrownJewelAssessment;
}

/**
 * Drive `synthesizeOne` from a coverage gap.
 *
 * Steps:
 *   1. Validate the gap (fail-loud).
 *   2. Evaluate crown-jewel impact on affected targets (B5 gate).
 *   3. Resolve effective severity using the assessment.
 *   4. Adapt to `StructuredAdvisory` (B17 adapter).
 *   5. Call `synthesizeOne` with `callerId='coverage_gap'`.
 *   6. Post-decorate the produced envelope's `argus.origin` to
 *      `'coverage_gap'` (the engine is still `argus.exploit_to_detection`
 *      but the upstream channel differs — see `mutation_intent.ts` doc).
 *
 * The function preserves the `dead_letter_high_rejection_rate` outcome
 * verbatim — coverage-gap synthesis is held to the same dead-letter
 * threshold as CVE-driven synthesis, deliberately. Path A's gates apply
 * uniformly across lanes.
 */
export const synthesizeFromCoverageGap = async ({
  gap,
  crownJewels,
  provider,
  providerName,
  logger,
  now,
}: SynthesizeFromCoverageGapInput): Promise<SynthesizeFromCoverageGapOutcome> => {
  const validationErrors = validateCoverageGap(gap);
  if (validationErrors.length > 0) {
    throw new Error(
      `synthesizeFromCoverageGap: invalid gap input — ${validationErrors.join('; ')}`
    );
  }

  const targets = toMutationTargets(gap.affected_targets);
  const assessment = evaluateCrownJewelImpact(targets, crownJewels);
  const severityResolution = resolveCoverageGapSeverity(gap.severity, assessment);

  if (severityResolution.bumped) {
    logger.info(
      `[argus-coverage-gap] gap=${gap.gap_id} severity bumped: ${severityResolution.reason}`
    );
  }

  const advisory = coverageGapToAdvisory({
    ...gap,
    severity: severityResolution.effective_severity,
  });

  const outcome = await synthesizeOne({
    advisory,
    provider,
    providerName,
    logger,
    now,
    callerId: 'coverage_gap',
  });

  const decoratedIntent = outcome.mutation_intent
    ? {
        ...outcome.mutation_intent,
        argus: { ...outcome.mutation_intent.argus, origin: 'coverage_gap' as const },
      }
    : undefined;

  return {
    ...outcome,
    mutation_intent: decoratedIntent,
    origin: 'coverage_gap',
    gap_id: gap.gap_id,
    severity_resolution: severityResolution,
    crown_jewel_assessment: assessment,
  };
};
