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
 *   | variant | TP | FP | spread                                  | timestamps                  |
 *   | v0      | 3  | 6  | original fixture values                  | original                    |
 *   | v1      | 4  | 8  | FP cluster across 4 hosts / 2 users      | shifted -2d, same window    |
 *   | v2      | 5  | 10 | FP cluster on 1 host / 1 user            | spread over the full window |
 *
 * Entity names for v1/v2 are generated from (case id, variant index) so they are
 * stable across runs. The FP signature field value that the golden exception or
 * query targets stays fixed per base rule.
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

const VARIANT_SHAPE: Record<number, Omit<TuningVariantSpec, 'caseId' | 'baseId' | 'expected'>> = {
  0: { variant: 0, tpCount: 3, fpCount: 6, spread: 'original', timeShiftMs: 0 },
  1: { variant: 1, tpCount: 4, fpCount: 8, spread: 'multi', timeShiftMs: -2 * 24 * 3600 * 1000 },
  2: { variant: 2, tpCount: 5, fpCount: 10, spread: 'single', timeShiftMs: 0 },
};

/** Deterministic 32-bit hash of a string, used to derive per-case entity names. */
export const stableHash = (s: string): number => fnv1a(s);

/** Expands the base list into the full 30-case matrix. */
export const buildTuningVariantMatrix = (): TuningVariantSpec[] =>
  TUNING_BASE_RULES.flatMap((base) =>
    [0, 1, 2].map((v) => ({
      ...VARIANT_SHAPE[v],
      caseId: `${base.id}-v${v}`,
      baseId: base.id,
      expected: base.expected,
    }))
  );

/**
 * Host name for one FP slot. v0 keeps the original fixture host; `single` collapses every
 * slot onto one generated host; `multi` fans out over 4 generated hosts. Deterministic in
 * (case id, variant index, slot).
 */
export const fpHostFor = (spec: TuningVariantSpec, slot: number, original: string): string => {
  if (spec.spread === 'original') return original;
  const bucket = spec.spread === 'single' ? 0 : slot % 4;
  return `eval-${stableHash(`${spec.caseId}:${spec.variant}`).toString(16).slice(0, 6)}-h${bucket}`;
};

/** Generated user name: `multi` spreads over 2 users, `single` uses 1, `original` keeps the fixture user. */
export const fpUserFor = (spec: TuningVariantSpec, slot: number, original: string): string => {
  if (spec.spread === 'original') return original;
  const bucket = spec.spread === 'single' ? 0 : slot % 2;
  return `eval-user-${stableHash(spec.caseId).toString(16).slice(0, 4)}-${bucket}`;
};

export interface SeededTpAlert extends AlertDoc {
  'az-eval:tp': true;
  'az-eval:case': string;
}

/**
 * Labelled TRUE POSITIVE alerts for one case. Each carries the deterministic tag
 * `az-eval:tp` plus the case id so the grader finds them without a model. TP docs use
 * a host distinct from the FP cluster so an FP-targeting exception cannot suppress them
 * by accident (the TPSuppressedByTuning gate then measures a real decision).
 */
export const buildTpCohort = (spec: TuningVariantSpec, tpProcess: string): SeededTpAlert[] =>
  Array.from({ length: spec.tpCount }, (_, i) => ({
    'host.name': `eval-tp-${stableHash(spec.caseId).toString(16).slice(0, 6)}-${i}`,
    'user.name': `eval-tp-user-${i}`,
    'process.name': tpProcess,
    'az-eval:tp': true,
    'az-eval:case': spec.caseId,
  }));
