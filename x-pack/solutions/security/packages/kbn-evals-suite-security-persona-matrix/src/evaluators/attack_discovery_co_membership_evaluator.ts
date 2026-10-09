/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the
 * Elastic License 2.0. Use of this file is governed by the Elastic License 2.0
 * that can be found in the licenses directory at the root of this repository.
 */

import type { Evaluator } from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';
import type {
  AttackDiscoveryDatasetExample,
  AttackDiscoveryTaskOutput,
} from '@kbn/evals-suite-attack-discovery/src/types';

export const ATTACK_DISCOVERY_CO_MEMBERSHIP_EVALUATOR_NAME = 'AttackDiscoveryCoMembership';

export interface CoMembershipScores {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  label: string;
}

const nonEmptyStringArray = (v: unknown): v is readonly string[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string');

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Unordered (i < j) pairs within one group, as canonical keys. */
const pairKeys = (group: readonly string[]): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      keys.push(pairKey(group[i] as string, group[j] as string));
    }
  }
  return keys;
};

/**
 * Pairwise co-membership scoring of output alert groups against reference
 * chains. Judge-free: only alert ids are compared, never prose.
 *
 * - True pairs: an (a, b) alert pair co-occurring in the same output group AND
 *   the same reference chain.
 * - Precision = true pairs / output pairs; unknown alert ids in the output
 *   form pairs that can never be true, so they count against precision.
 * - Recall = true pairs / reference pairs.
 * - Empty reference (or an example carrying none) scores null and is labeled
 *   `no_reference` instead of being silently skipped or scored 0.
 */
export const scoreCoMembership = ({
  outputGroups,
  referenceChains,
}: {
  outputGroups: ReadonlyArray<readonly string[]>;
  referenceChains: ReadonlyArray<readonly string[]>;
}): CoMembershipScores => {
  const refPairs = new Set<string>();
  for (const chain of referenceChains) {
    for (const key of pairKeys(chain)) refPairs.add(key);
  }

  if (refPairs.size === 0) {
    return { precision: null, recall: null, f1: null, label: 'no_reference' };
  }

  const outputPairs = outputGroups.flatMap((group) => pairKeys(group));
  if (outputPairs.length === 0) {
    return { precision: null, recall: 0, f1: 0, label: 'no_output_groups' };
  }

  let truePairCount = 0;
  for (const key of outputPairs) {
    if (refPairs.has(key)) truePairCount++;
  }

  const precision = truePairCount / outputPairs.length;
  const recall = truePairCount / refPairs.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, label: `${truePairCount}/${outputPairs.length} pairs` };
};

const extractAlertIdGroups = (output: AttackDiscoveryTaskOutput | undefined) => {
  const insights = output?.insights;
  if (!Array.isArray(insights)) return null;
  const groups: string[][] = [];
  for (const insight of insights) {
    if (typeof insight !== 'object' || insight === null) {
      // skip malformed entries; they cannot contribute alert ids
    } else {
      const raw =
        (insight as Record<string, unknown>).alertIds ??
        (insight as Record<string, unknown>).alert_ids;
      if (nonEmptyStringArray(raw)) groups.push([...raw]);
    }
  }
  return groups;
};

/**
 * Reads reference chains from the example's expected output. Each
 * `attackDiscoveries` entry contributes its `alertIds` as one chain.
 */
export const createAttackDiscoveryCoMembershipEvaluator = ({
  log,
}: {
  log: ToolingLog;
}): Evaluator<AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput> => {
  return {
    name: ATTACK_DISCOVERY_CO_MEMBERSHIP_EVALUATOR_NAME,
    kind: 'CODE',
    direction: 'maximize',
    evaluate: async ({ output, expected }) => {
      const referenceChains = (expected?.attackDiscoveries ?? [])
        .map((d) => d.alertIds)
        .filter(nonEmptyStringArray);

      const scores = scoreCoMembership({
        outputGroups: extractAlertIdGroups(output) ?? [],
        referenceChains,
      });

      log.info(`[co-membership] p=${scores.precision} r=${scores.recall} f1=${scores.f1}`);

      return {
        score: scores.f1 ?? 0,
        label: scores.label,
        metadata: { precision: scores.precision, recall: scores.recall },
      };
    },
  };
};
