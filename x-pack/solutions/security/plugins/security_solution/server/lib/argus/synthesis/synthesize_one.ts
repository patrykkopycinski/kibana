/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import {
  buildMutationIntent,
  DEFAULT_TRADEOFF_WEIGHTS,
  generateLlmVariants,
  synthesizeRuleCandidates,
  type MutationIntent,
  type RuleCandidate,
  type StructuredAdvisory,
  type VariantProvider,
  type VariantTraceEvent,
} from '@kbn/argus-exploit-to-detection';

import { SYNTHESIS_REJECTION_RATE_DEAD_LETTER_THRESHOLD } from './constants';

/**
 * Per-advisory synthesis tick — Path A end-to-end.
 *
 * This is the single, shared entry point used by:
 *   1. The autonomous TaskManager driver (`synthesis_driver.ts`).
 *   2. The chat skill `argus.synthesize_rule_candidate` tool that lets a
 *      human kick off synthesis on demand without bypassing the gates.
 *   3. The future `argus.synthesize_rule_from_gap` workflow step that
 *      converges Path B onto the same primitives (RFC B1, §3.3).
 *
 * The function is intentionally I/O-free — callers handle the ES writes.
 * Keeping the policy logic (Pareto, variant generation, dead-letter rate
 * gate) in one pure function is what makes the three convergence paths
 * provably equivalent.
 */
export type SynthesizeOneOutcomeKind = 'synthesized' | 'dead_letter_high_rejection_rate';

export interface SynthesizeOneOutcome {
  readonly advisory_id: string;
  readonly kind: SynthesizeOneOutcomeKind;
  readonly reason?: string;
  readonly mutation_intent?: MutationIntent;
  readonly traces: readonly VariantTraceEvent[];
  readonly rule_candidate?: RuleCandidate;
}

export interface SynthesizeOneInput {
  readonly advisory: StructuredAdvisory;
  readonly provider?: VariantProvider;
  readonly providerName?: string;
  readonly logger: Logger;
  readonly now: number;
  /**
   * Identifier hint embedded in the per-tick `corpus_id`. Lets downstream
   * audit queries (`.soc-evolution-log`, `.soc-reasoning-trace`) attribute
   * the synthesis attempt back to its caller (driver / chat skill /
   * workflow). Defaults to `'driver'` to preserve the existing audit
   * stream.
   */
  readonly callerId?: string;
}

export const synthesizeOne = async ({
  advisory,
  provider,
  providerName,
  logger,
  now,
  callerId = 'driver',
}: SynthesizeOneInput): Promise<SynthesizeOneOutcome> => {
  const paretoResult = synthesizeRuleCandidates({
    advisory,
    weights: DEFAULT_TRADEOFF_WEIGHTS,
  });
  const chosen = paretoResult.chosen;

  const corpusId = `${callerId}-${advisory.advisory_id}-${now}`;
  const traces: VariantTraceEvent[] = [];
  const variantResult = await generateLlmVariants({
    advisory,
    corpus_id: corpusId,
    provider,
    provider_name: providerName,
    trace_sink: (event) => traces.push(event),
  });

  const totalCandidates = variantResult.variants.length + variantResult.rejected_count;
  const rejectionRate = totalCandidates > 0 ? variantResult.rejected_count / totalCandidates : 0;

  if (rejectionRate >= SYNTHESIS_REJECTION_RATE_DEAD_LETTER_THRESHOLD) {
    logger.warn(
      `[argus-synthesis] advisory=${
        advisory.advisory_id
      } dead-lettered: rejection rate ${rejectionRate.toFixed(
        2
      )} >= threshold ${SYNTHESIS_REJECTION_RATE_DEAD_LETTER_THRESHOLD}`
    );
    return {
      advisory_id: advisory.advisory_id,
      kind: 'dead_letter_high_rejection_rate',
      reason: `rejection_rate=${rejectionRate.toFixed(2)} accepted=${
        variantResult.variants.length
      } rejected=${variantResult.rejected_count}`,
      traces,
    };
  }

  if (variantResult.variants.length === 0) {
    logger.warn(
      `[argus-synthesis] advisory=${advisory.advisory_id} produced zero accepted variants; dead-lettering`
    );
    return {
      advisory_id: advisory.advisory_id,
      kind: 'dead_letter_high_rejection_rate',
      reason: 'no_accepted_variants',
      traces,
    };
  }

  const mutationIntent = buildMutationIntent({
    advisory,
    draftRule: chosen.draft_rule,
    variantCorpusId: corpusId,
    variantCount: variantResult.variants.length,
    now: () => new Date(now),
    synthesis: {
      chosen,
      frontier: paretoResult.frontier,
      dominated: paretoResult.dominated,
      weights: paretoResult.applied_weights,
    },
  });

  return {
    advisory_id: advisory.advisory_id,
    kind: 'synthesized',
    mutation_intent: mutationIntent,
    rule_candidate: chosen,
    traces,
  };
};
