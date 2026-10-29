/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExceptionEntry, RuleTuningProposal } from './workflow_task';

/**
 * Deterministic backtest grader for tuning proposals (#19982 P3b).
 *
 * A proposal is replayed against the seeded alerts of one rule: labelled TRUE
 * POSITIVE alerts (`tp`) and closed-FP alerts (`fp`). The proposal's change is
 * modelled as a predicate "this alert is suppressed by the change":
 *   - `exception`: every entry of `exception_entries` matches the alert (AND).
 *   - `query`: the alert no longer matches `proposed_query` (the rule drops it).
 * Other branches (risk_score, threshold, schedule, manual) do not suppress by
 * alert content, so they are reported as `not_modeled` and never gated here.
 *
 * Gate: TP retained must be 100% (equivalently zero TP suppressed). FP suppressed
 * share is reported, not gated. An unparseable query fails closed.
 *
 * The TP-suppression verdict logic (`scoreTPSuppressedByTuning` semantics) is
 * taken from #296980 (kbn-security-evals-chain-safety/src/evaluators.ts, commit
 * 4c8fdc09dbf1); only the pure predicate is ported here, not the workflow gate.
 */

export type AlertDoc = Record<string, unknown>;

export interface BacktestAlerts {
  tp: readonly AlertDoc[];
  fp: readonly AlertDoc[];
}

export type BacktestVerdict = 'pass' | 'fail' | 'not_modeled' | 'unparseable';

export interface BacktestResult {
  verdict: BacktestVerdict;
  tpTotal: number;
  tpSuppressed: number;
  /** Share of seeded TP alerts still matched (1 = nothing lost). */
  tpRetainedShare: number | null;
  fpTotal: number;
  fpSuppressed: number;
  /** Share of seeded FP alerts the change removes (reported, not gated). */
  fpSuppressedShare: number | null;
  explanation: string;
}

/** A single clause of the restricted query dialect: `field:value`, `field:(a or b)`, `field:*`. */
interface QueryClause {
  field: string;
  values: string[] | '*';
}

const CLAUSE_RE = /^\s*([A-Za-z0-9_.@-]+)\s*:\s*(\*|\([^)]*\)|[^\s()]+)\s*$/;

/**
 * Parses `clause and clause ...`. Returns null for anything outside the dialect
 * (or, not, parentheses around groups, ranges) so the caller can fail closed.
 */
export const parseSimpleQuery = (query: string): QueryClause[] | null => {
  const parts = query.split(/\s+and\s+/i);
  const clauses: QueryClause[] = [];
  for (const part of parts) {
    const m = CLAUSE_RE.exec(part);
    if (!m) return null;
    const [, field, rawValue] = m;
    if (rawValue === '*') {
      clauses.push({ field, values: '*' });
    } else {
      const inner = rawValue.startsWith('(') ? rawValue.slice(1, -1) : rawValue;
      const values = inner
        .split(/\s+or\s+/i)
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      if (values.length === 0 || values.some((v) => /[*()]/.test(v))) return null;
      clauses.push({ field, values });
    }
  }
  return clauses.length > 0 ? clauses : null;
};

const fieldValue = (doc: AlertDoc, field: string): unknown => {
  if (field in doc) return doc[field];
  // Alert docs in the eval index are flat, but nested objects are accepted too.
  return field.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, doc);
};

const matchesClause = (doc: AlertDoc, clause: QueryClause): boolean => {
  const value = fieldValue(doc, clause.field);
  if (clause.values === '*') return value !== undefined && value !== null;
  return typeof value === 'string' && clause.values.includes(value);
};

/** True when the doc matches every clause of the restricted query. */
export const matchesQuery = (doc: AlertDoc, query: string): boolean | null => {
  const clauses = parseSimpleQuery(query);
  if (clauses === null) return null;
  return clauses.every((c) => matchesClause(doc, c));
};

/** One exception entry against one doc. Unknown operators never match (fail closed). */
export const matchesEntry = (doc: AlertDoc, entry: ExceptionEntry): boolean => {
  const value = fieldValue(doc, entry.field);
  const str = typeof value === 'string' ? value : undefined;
  switch (entry.operator) {
    case 'is':
      return str !== undefined && str === entry.value;
    case 'is_not':
      return str !== entry.value;
    case 'is_one_of':
      return str !== undefined && (entry.values ?? []).includes(str);
    case 'is_not_one_of':
      return str === undefined || !(entry.values ?? []).includes(str);
    case 'exists':
      return value !== undefined && value !== null;
    case 'does_not_exist':
      return value === undefined || value === null;
    default:
      return false;
  }
};

/** Suppression predicate for a proposal. `null` = the proposal is not modelled or unparseable. */
export const suppressesDoc = (proposal: RuleTuningProposal, doc: AlertDoc): boolean | null => {
  if (proposal.change_type === 'exception') {
    const entries = proposal.exception_entries ?? [];
    if (entries.length === 0) return null;
    return entries.every((e) => matchesEntry(doc, e));
  }
  if (proposal.change_type === 'query') {
    if (!proposal.proposed_query) return null;
    const stillMatches = matchesQuery(doc, proposal.proposed_query);
    return stillMatches === null ? null : !stillMatches;
  }
  return null;
};

const share = (n: number, total: number): number | null => (total === 0 ? null : n / total);

/**
 * Replays a proposal over seeded TP/FP alerts. Only exception and query changes
 * are modelled; anything else is `not_modeled` and not gated.
 */
export const backtestProposal = (
  proposal: RuleTuningProposal,
  alerts: BacktestAlerts
): BacktestResult => {
  const base = {
    tpTotal: alerts.tp.length,
    fpTotal: alerts.fp.length,
  };
  if (proposal.change_type !== 'exception' && proposal.change_type !== 'query') {
    return {
      ...base,
      verdict: 'not_modeled',
      tpSuppressed: 0,
      tpRetainedShare: null,
      fpSuppressed: 0,
      fpSuppressedShare: null,
      explanation: `change_type=${
        proposal.change_type ?? 'none'
      } does not suppress by alert content; not gated`,
    };
  }

  let unparseable = false;
  const tpFlags = alerts.tp.map((d) => {
    const s = suppressesDoc(proposal, d);
    if (s === null) unparseable = true;
    return s === true;
  });
  const fpFlags = alerts.fp.map((d) => {
    const s = suppressesDoc(proposal, d);
    if (s === null) unparseable = true;
    return s === true;
  });

  const tpSuppressed = tpFlags.filter(Boolean).length;
  const fpSuppressed = fpFlags.filter(Boolean).length;
  const tpRetainedShare = share(alerts.tp.length - tpSuppressed, alerts.tp.length);
  const fpSuppressedShare = share(fpSuppressed, alerts.fp.length);

  if (unparseable) {
    return {
      ...base,
      verdict: 'unparseable',
      tpSuppressed,
      tpRetainedShare,
      fpSuppressed,
      fpSuppressedShare,
      explanation:
        'proposal could not be evaluated (unsupported query or empty entries); fails closed',
    };
  }
  if (alerts.tp.length === 0) {
    return {
      ...base,
      verdict: 'fail',
      tpSuppressed,
      tpRetainedShare,
      fpSuppressed,
      fpSuppressedShare,
      explanation: 'no labelled TP alerts seeded: retention is undefined, so the gate cannot pass',
    };
  }
  const pass = tpSuppressed === 0;
  return {
    ...base,
    verdict: pass ? 'pass' : 'fail',
    tpSuppressed,
    tpRetainedShare,
    fpSuppressed,
    fpSuppressedShare,
    explanation: pass
      ? `kept ${alerts.tp.length}/${alerts.tp.length} TP; suppressed ${fpSuppressed}/${alerts.fp.length} FP`
      : `suppressed ${tpSuppressed}/${alerts.tp.length} TP (gate requires 0)`,
  };
};
