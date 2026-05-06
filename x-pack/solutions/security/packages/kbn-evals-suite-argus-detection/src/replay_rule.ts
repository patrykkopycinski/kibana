/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { CandidateRule } from '../datasets/rule_pack';

/**
 * Narrow, testable seam for grading a candidate detection rule against the
 * labelled Mythos-era corpus held in `.soc-eval-corpus-<corpus_id>`.
 *
 * The shape is deliberately coarse — one call per (rule, corpus) rather than
 * per (rule, variant) — so the replay runs in O(rules) Elasticsearch round
 * trips instead of O(rules × variants). This matters at demo time: the
 * M2.1 acceptance criteria require the end-to-end eval to complete inside
 * the 4-minute "polymorphic variant swarm" scenario in the demo storyboard.
 */
export interface ReplayClient {
  /**
   * Returns the set of variant document IDs (as produced by
   * `variantDocId(primitive_id, variant_axis, variant_index)`) for which the
   * rule's query matches an event in the given corpus index.
   */
  replayRule(input: ReplayRuleInput): Promise<ReplayRuleResult>;
}

export interface ReplayRuleInput {
  rule: CandidateRule;
  corpusIndex: string;
  corpusId: string;
}

export interface ReplayRuleResult {
  rule_id: string;
  /** Variant doc IDs the rule fires on (both true and false positives). */
  fired_variant_ids: string[];
  /** Total hits across the fired variants (may exceed the ID count under re-emission). */
  fire_count: number;
  /** Captured so the orchestrator can attribute failures without a second round trip. */
  error?: string;
}

/**
 * Deterministic variant document identifier shared by `setup.sh`,
 * `soc_argus_frontier_simulator.yaml`, and the replay client.
 *
 * Keeping the format frozen here — instead of letting each producer invent
 * its own — means the eval can round-trip `_id`s back to the variant bank
 * source files without guessing axis ordering.
 */
export const variantDocId = (
  primitiveId: string,
  variantAxis: string,
  variantIndex: number
): string => `${primitiveId}-${variantAxis}-${variantIndex}`;

interface ArgusCorpusHitSource {
  _argus: {
    corpus_id: string;
    primitive_id: string;
    variant_axis: string;
    variant_index: number;
    should_fire?: boolean;
  };
}

/**
 * Production replay client: one Elasticsearch `search` per rule, scoped to the
 * corpus and combined with `rule.query` via a top-level bool filter.
 *
 * The client never writes — persistence of eval outcomes is the orchestrator's
 * job (see `createEvaluateDetectionRules`). This keeps the replay client
 * reusable from the CLI, the Playwright suite, and future interactive tooling.
 */
export const createEsReplayClient = (esClient: Client): ReplayClient => ({
  async replayRule({ rule, corpusIndex, corpusId }: ReplayRuleInput): Promise<ReplayRuleResult> {
    const filteredQuery: QueryDslQueryContainer = {
      bool: {
        filter: [
          { term: { '_argus.corpus_id': corpusId } },
          // Exclude re-emissions (frontier simulator output) from grading.
          // The simulator copies `_argus.*` labels verbatim but flips
          // `is_simulation_emission: true`, which we match on a must_not so the
          // rule is graded against the canonical variant bank only.
          { bool: { must_not: { term: { '_argus.is_simulation_emission': true } } } },
          rule.query,
        ],
      },
    };

    try {
      const response = await esClient.search<ArgusCorpusHitSource>({
        index: corpusIndex,
        size: 10_000,
        _source: ['_argus.primitive_id', '_argus.variant_axis', '_argus.variant_index'],
        query: filteredQuery,
        // track_total_hits so the orchestrator gets accurate fire counts even
        // when hits saturate size.
        track_total_hits: true,
      });

      const hits = response.hits?.hits ?? [];
      const firedVariantIds = new Set<string>();
      for (const hit of hits) {
        const argus = hit._source?._argus;
        if (argus) {
          firedVariantIds.add(
            variantDocId(argus.primitive_id, argus.variant_axis, argus.variant_index)
          );
        }
      }

      const totalHits =
        typeof response.hits?.total === 'number'
          ? response.hits.total
          : response.hits?.total?.value ?? hits.length;

      return {
        rule_id: rule.rule_id,
        fired_variant_ids: [...firedVariantIds].sort(),
        fire_count: totalHits,
      };
    } catch (error) {
      return {
        rule_id: rule.rule_id,
        fired_variant_ids: [],
        fire_count: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Deprecated — retained only so existing imports compile while consumers
 * migrate to {@link createEsReplayClient}. Throws on first call so an
 * accidental wire-up fails loudly instead of silently returning zero data.
 */
export const createNoopReplayClient = (): ReplayClient => ({
  async replayRule(): Promise<ReplayRuleResult> {
    throw new Error(
      'createNoopReplayClient: the M2.1 skeleton stub is retired — use createEsReplayClient(esClient).'
    );
  },
});
