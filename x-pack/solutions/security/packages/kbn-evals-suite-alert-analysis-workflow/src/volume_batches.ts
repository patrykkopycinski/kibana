/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Volume fixtures for the alert-analysis managed-workflow eval (card t_3b083536).
 *
 * `batch_alerts.ts` exercises ONE batch (at most `consts.batch_size` = 50 alerts). This file
 * exercises the sizes the batching contract has to survive in production:
 *
 *   - `aa-eval-vol-120`  ONE rule execution of 120 alerts → `chunk: consts.batch_size` produces
 *                        THREE model calls (50 + 50 + 20). This is the case that shows whether a
 *                        partial final batch is classified at all, and whether per-batch state
 *                        (`all_verdicts`, matched-id counts) survives more than one iteration.
 *   - `aa-eval-vol-60-dup` 60 alerts that form 30 near-duplicate PAIRS: both members of a pair carry
 *                        the same rule, the same host and the same technique, and their ids differ
 *                        by ONE hex character (`…c2` / `…c3`). Each member keeps its own user,
 *                        binary name and entity ids, so a correct answer is still reachable — but a
 *                        model that merges a pair returns 59 verdicts for 60 alerts (coverage and
 *                        integrity fail), and a model that repeats one id for both members does the
 *                        same. The near-duplicate temptation is the production risk that no
 *                        single-alert fixture can reach.
 *
 * Labels come from the same archetypes the single-alert Tier 2/Tier 3 fixtures already use
 * (`unsignedInjectorObservable` → true_positive, `signedVendorObservable` → false_positive, …), so
 * a volume fixture is a composition of already-labelled archetypes rather than a new claim.
 */

import { buildDoc, type LabeledAlert } from './synthetic_alerts';
import {
  INJECTION_RULE,
  RUN_TAG_PLACEHOLDER,
  hostFor,
  pad2,
  signedVendorObservable,
  signedWmiObservable,
  unsignedInjectorObservable,
  unsignedWmiObservable,
  type BatchAlertSpec,
  type BatchRule,
  type LabeledAlertBatch,
} from './batch_alerts';

/** A batch fixture plus the resolved ids of the near-duplicate pairs it contains. */
export interface VolumeBatch extends LabeledAlertBatch {
  /** `[memberA, memberB]` id templates whose ids differ by one hex character. */
  nearDuplicatePairs: Array<[string, string]>;
}

/**
 * One archetype per index, alternating true/false positive so a volume batch is label-balanced and
 * no constant answer can look competent. `variant` keeps each alert's observable distinct (its own
 * host/user/binary token), which is what a model needs to answer 120 alerts one by one.
 */
const archetypeFor = (
  index: number,
  variant: number
): { observable: Record<string, unknown>; markers: string[]; expected: 'true_positive' | 'false_positive' } => {
  const slot = index % 4;
  if (slot === 0) {
    return { ...unsignedInjectorObservable(variant), expected: 'true_positive' };
  }
  if (slot === 1) {
    return { ...signedVendorObservable(variant), expected: 'false_positive' };
  }
  if (slot === 2) {
    return { ...unsignedWmiObservable(variant), expected: 'true_positive' };
  }
  return { ...signedWmiObservable(variant), expected: 'false_positive' };
};

const volumeRule = (): BatchRule => ({ ...INJECTION_RULE });

/**
 * 120 alerts in ONE rule execution: two full batches plus a partial batch of 20. The final partial
 * batch is the interesting one — a `slice: 0, consts.batch_size` applied to the wrong array, or a
 * post-parse filter that assumes a full batch, drops it entirely.
 */
const buildVolume120 = (): BatchAlertSpec[] =>
  Array.from({ length: 120 }, (_, i) => {
    const { observable, markers, expected } = archetypeFor(i, i + 1);
    return {
      id: `aa-eval-vol120-${RUN_TAG_PLACEHOLDER}-p${pad2(i + 1)}`,
      expected,
      description: `Volume batch 120 alert ${i + 1}/120 (${
        i < 50 ? 'batch 1' : i < 100 ? 'batch 2' : 'partial batch 3 of 20'
      }) — ${expected === 'true_positive' ? 'unsigned, Office-launched behaviour (Gate C)' : 'signed vendor behaviour (Gate D)'}.`,
      markers,
      observable,
    };
  });

/**
 * 60 alerts = 30 near-duplicate pairs. Both members share rule + host + technique and differ by one
 * hex character in the id; they keep distinct users, binary names and entity ids, so a model CAN
 * answer both. The pair members' shared host is deliberate: a merged verdict looks locally
 * reasonable, which is exactly the failure the fixture has to expose.
 */
const buildVolume60NearDup = (): BatchAlertSpec[] =>
  Array.from({ length: 60 }, (_, i) => {
    const pair = Math.floor(i / 2);
    const member = i % 2;
    // Same archetype (so same label) for both members; member 2 takes a different variant so its
    // user and binary/script token differ, then its host is forced onto member 1's host.
    const { observable, markers: variantMarkers, expected } = archetypeFor(
      pair,
      member === 0 ? pair + 1 : pair + 31
    );
    const host = hostFor(pair + 1);
    const markers = [host, ...variantMarkers.slice(1)];
    return {
      id: `aa-eval-vol60-${RUN_TAG_PLACEHOLDER}-p${pad2(pair + 1)}-${member === 0 ? 'c2' : 'c3'}`,
      expected,
      description: `Near-duplicate pair ${pair + 1}/30, member ${member + 1} — shares rule, host ${host} and technique with its sibling (id differs by one hex character) → ${expected}.`,
      markers,
      // Same host for both members; the per-alert token that distinguishes them is the user and
      // the binary/script name inside `markers`/`observable`.
      observable: { ...observable, 'host.name': host },
    };
  });

export const ALERT_ANALYSIS_VOLUME_BATCHES: VolumeBatch[] = [
  {
    id: 'aa-eval-vol-120',
    description:
      'One rule execution of 120 alerts → three model calls (50 + 50 + 20); the partial final batch is the one a mis-sliced post-parse filter loses.',
    rule: volumeRule(),
    alerts: buildVolume120(),
    nearCollisionPairs: [],
    nearDuplicatePairs: [],
  },
  {
    id: 'aa-eval-vol-60-dup',
    description:
      'One rule execution of 60 alerts forming 30 near-duplicate pairs (same rule, same host, ids one hex character apart); merging or repeating a pair costs a verdict and shows up as a coverage/integrity failure.',
    rule: volumeRule(),
    alerts: buildVolume60NearDup(),
    nearCollisionPairs: [],
    nearDuplicatePairs: Array.from({ length: 30 }, (_, pair) => [
      `aa-eval-vol60-${RUN_TAG_PLACEHOLDER}-p${pad2(pair + 1)}-c2`,
      `aa-eval-vol60-${RUN_TAG_PLACEHOLDER}-p${pad2(pair + 1)}-c3`,
    ]),
  },
];

export const buildVolumeBatchAlerts = (batch: VolumeBatch, runTag: string): LabeledAlert[] => {
  const ruleUuid = `${batch.id}-rule-${runTag}`;
  return batch.alerts.map((spec, index) => {
    const id = spec.id.replaceAll(RUN_TAG_PLACEHOLDER, runTag);
    return {
      id,
      expected: spec.expected,
      description: spec.description,
      markers: [...spec.markers],
      doc: {
        ...buildDoc({
          id,
          index,
          ruleUuid,
          ruleName: batch.rule.name,
          ruleDescription: batch.rule.description,
          severity: batch.rule.severity,
          riskScore: batch.rule.riskScore,
          tactic: batch.rule.tactic,
          technique: batch.rule.technique,
          observable: {
            ...spec.observable,
            'process.entity_id': `entity-${id}`,
            'host.id': `host-${id}`,
          },
        }),
      },
    };
  });
};

/** Batch size the workflow chunks by; the fixtures assert their own size against it. */
export const VOLUME_BATCH_SIZE = 50;
