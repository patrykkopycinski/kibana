/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeType } from './constants';
import type { AlertDoc } from './backtest_grader';

/** djb2 hash modulo 2^32: pure arithmetic, deterministic across runs and platforms. */
const fnv1a = (input: string): number =>
  [...input].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 4294967296, 5381);

/**
 * Variant expansion for the rule-tuning eval (#19982 P3b).
 *
 * 10 base rules (6 ported from #19901 + 4 picked from the 39 existing fixtures)
 * × 3 variants = 30 cases. Variants change only the data, never the expected
 * decision. Case id = `<base>-v<n>`.
 *
 *   | variant | TP | FP (threshold bases) | spread (exception bases only)  | timestamps                  |
 *   | v0      | 3  | 6  (12)              | the fixture's own structure    | original                    |
 *   | v1      | 4  | 8  (16)              | FP cluster across 4 hosts/2 users | shifted -2d, same window |
 *   | v2      | 4  | 10 (20)              | FP cluster on 1 host / 1 user  | spread over the full window |
 *
 * Only `exception` bases are reshaped: collapsing a query/schedule/risk_score/threshold
 * fixture onto one host or user would make an exception the tightest fix and flip the
 * golden label. Those bases keep their profile's entity diversity and vary counts and
 * timestamps only. Threshold bases burst well above the rule's threshold (12/16/20 events
 * over 3 hosts, each host far past the count of 3).
 *
 * Every seeded entity (FP and TP alike) is named `eval-<hash>-h<n>` / `eval-<hash>-u<n>`,
 * derived from the case id so names are stable across runs but say nothing about the
 * label. FP and TP indexes live in disjoint buckets (TP starts at `TP_ENTITY_INDEX_OFFSET`).
 */

export const TUNING_VARIANT_COUNT = 3;

/** Base rules picked for the 30-case matrix. `fp-*` ids are the existing fixture ids. */
export const TUNING_BASE_RULES: ReadonlyArray<{
  id: string;
  expected: ChangeType;
  gap: 'query-scope' | 'schedule-lookback' | 'exception' | 'threshold' | 'ported';
}> = [
  // 6 ported from #19901 (the gist seeder set).
  { id: 'fp-host-exception', expected: 'exception', gap: 'ported' },
  { id: 'fp-overbroad-query', expected: 'query', gap: 'ported' },
  { id: 'fp-volume-suppression', expected: 'exception', gap: 'ported' },
  { id: 'fp-low-value-risk', expected: 'risk_score', gap: 'ported' },
  { id: 'fp-threshold-bruteforce-burst', expected: 'threshold', gap: 'ported' },
  { id: 'fp-schedule-stale-logins', expected: 'schedule', gap: 'ported' },
  // 4 picked from the existing 39 to cover the missing gap classes.
  // query-scope: an over-broad wildcard that only a narrowed query fixes.
  { id: 'fp-overbroad-any-user', expected: 'query', gap: 'query-scope' },
  // schedule/lookback: a second wide-lookback case, distinct from the ported one.
  { id: 'fp-schedule-offhours-batch', expected: 'schedule', gap: 'schedule-lookback' },
  // exception: a new_terms rule is exception-only (no query change available).
  { id: 'fp-manual-newterms-dns', expected: 'exception', gap: 'exception' },
  // threshold: a second threshold rule, on a different burst source.
  { id: 'fp-threshold-auditflood', expected: 'threshold', gap: 'threshold' },
];

export interface TuningVariantSpec {
  caseId: string;
  baseId: string;
  variant: number;
  expected: ChangeType;
  tpCount: number;
  fpCount: number;
  /** v1: FP cluster spread across hosts/users; v2: concentrated; v0: original. */
  spread: 'original' | 'multi' | 'single';
  /** Milliseconds offset applied to the seeded timestamps (v1 shifts -2 days). */
  timeShiftMs: number;
}

/** FP burst size per variant for threshold bases: every host stays above the rule's threshold. */
const THRESHOLD_FP_COUNTS: Record<number, number> = { 0: 12, 1: 16, 2: 20 };

/** TP entity indexes start here so they can never collide with an FP bucket or profile index. */
export const TP_ENTITY_INDEX_OFFSET = 16;

const VARIANT_SHAPE: Record<number, Omit<TuningVariantSpec, 'caseId' | 'baseId' | 'expected'>> = {
  0: { variant: 0, tpCount: 3, fpCount: 6, spread: 'original', timeShiftMs: 0 },
  1: { variant: 1, tpCount: 4, fpCount: 8, spread: 'multi', timeShiftMs: -2 * 24 * 3600 * 1000 },
  2: { variant: 2, tpCount: 4, fpCount: 10, spread: 'single', timeShiftMs: 0 },
};

/** Deterministic 32-bit hash of a string, used to derive per-case entity names. */
export const stableHash = (s: string): number => fnv1a(s);

/** Expands the base list into the full 30-case matrix. */
export const buildTuningVariantMatrix = (): TuningVariantSpec[] =>
  TUNING_BASE_RULES.flatMap((base) =>
    [0, 1, 2].map((v) => ({
      ...VARIANT_SHAPE[v],
      ...(base.expected === 'threshold' && { fpCount: THRESHOLD_FP_COUNTS[v] }),
      caseId: `${base.id}-v${v}`,
      baseId: base.id,
      expected: base.expected,
    }))
  );

/** Opaque, label-free entity name: `kind` is `h` (host) or `u` (user). */
export const entityName = (spec: TuningVariantSpec, kind: 'h' | 'u', index: number): string =>
  `eval-${stableHash(spec.caseId).toString(16).slice(0, 6)}-${kind}${index}`;

/** Only `exception` bases may have their FP cluster collapsed or fanned out (see header). */
export const reshapesEntities = (spec: TuningVariantSpec): boolean =>
  spec.expected === 'exception' && spec.spread !== 'original';

/**
 * Entity index for one FP slot. `profileIndex` is the position of the profile row's entity among
 * the profile's distinct entities of that kind, so a non-reshaped case keeps exactly the
 * profile's host/user diversity. A reshaped case uses 4 host / 2 user buckets (`multi`) or 1
 * (`single`). Deterministic in (case id, variant, slot).
 */
const fpEntityIndex = (
  spec: TuningVariantSpec,
  kind: 'h' | 'u',
  slot: number,
  profileIndex: number
): number => {
  if (!reshapesEntities(spec)) return profileIndex;
  return spec.spread === 'single' ? 0 : slot % (kind === 'h' ? 4 : 2);
};

export const fpHostFor = (spec: TuningVariantSpec, slot: number, profileIndex: number): string =>
  entityName(spec, 'h', fpEntityIndex(spec, 'h', slot, profileIndex));

export const fpUserFor = (spec: TuningVariantSpec, slot: number, profileIndex: number): string =>
  entityName(spec, 'u', fpEntityIndex(spec, 'u', slot, profileIndex));

/**
 * TP source IPs are drawn from the same value space as the case's FP addresses:
 * the second octet from the second octets that case's FP profiles use, the
 * third from the FP third octets (every profile uses one second octet, so any
 * such pair is a real FP /24), and the fourth from a TP-only band so a TP
 * never shares an address with an FP. When the case's FP /24 holds exactly one
 * distinct FP address, the TPs cluster at neighbouring fourth octets inside
 * that same /24: the exact FP address is then a candidate glob too, and a TP
 * on a different /24 would make that exact glob separate the cohorts. No
 * single wildcard glob (`10.*`, `10.<a>.*`, `10.<a>.<b>.*`, exact) can
 * therefore separate the cohorts — enforced by the brute-force test in
 * seed_fp_cluster.test.ts.
 */
const sortedUnique = (ns: readonly number[]): number[] => [...new Set(ns)].sort((a, b) => a - b);

/** TP source IP: case-derived octets, slot-derived fourth, stable and opaque. */
export const tpSourceIp = (
  spec: TuningVariantSpec,
  slot: number,
  fpSecondOctets: readonly number[],
  fpThirdOctets: readonly number[],
  fpFourthOctets: readonly number[]
): string => {
  const seconds = sortedUnique(fpSecondOctets);
  const thirds = sortedUnique(fpThirdOctets);
  const fourths = sortedUnique(fpFourthOctets);
  if (seconds.length === 0 || thirds.length === 0) {
    throw new Error(`No FP source.ip octets for case ${spec.caseId}`);
  }
  const hash = stableHash(spec.caseId);
  const second = seconds[(hash + slot) % seconds.length];
  const third = thirds[Math.floor(hash / 256) % thirds.length];
  if (fourths.length === 1) {
    return `10.${second}.${third}.${200 + slot}`;
  }
  return `10.${second}.${third}.${TP_ENTITY_INDEX_OFFSET + slot}`;
};

export interface SeededTpAlert extends AlertDoc {
  'az-eval:tp': true;
  'az-eval:case': string;
}

/**
 * Labelled TRUE POSITIVE alerts for one case. Each carries the in-memory tag `az-eval:tp`
 * plus the case id so the grader finds them without a model; the seeder never writes those
 * tags to ES. TP entities are named like FP ones (see `entityName`) but in a disjoint index
 * bucket, so an FP-targeting exception cannot suppress them by accident (the
 * TPSuppressedByTuning gate then measures a real decision) and the name does not reveal the
 * label.
 */
export const buildTpCohort = (
  spec: TuningVariantSpec,
  tpProcess: string,
  fpSourceIpOctets: { second: number[]; third: number[]; fourth: number[] }
): SeededTpAlert[] =>
  Array.from({ length: spec.tpCount }, (_, i) => ({
    'host.name': entityName(spec, 'h', TP_ENTITY_INDEX_OFFSET + i),
    'user.name': entityName(spec, 'u', TP_ENTITY_INDEX_OFFSET + i),
    'source.ip': tpSourceIp(
      spec,
      i,
      fpSourceIpOctets.second,
      fpSourceIpOctets.third,
      fpSourceIpOctets.fourth
    ),
    'process.name': tpProcess,
    'az-eval:tp': true,
    'az-eval:case': spec.caseId,
  }));
