/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — ES|QL draft guard and sandbox-count query builder.
 *
 * The only security boundary on model-drafted ES|QL: everything later steps
 * preview, attach or propose has passed through `validateDraftRuleQuery`, and
 * every re-check of a stored rule (`propose_enable`, the flyout Enable-trial
 * control) calls it again on the rule as it exists at that moment. All
 * decisions come from the parsed AST — never string matching — so a source
 * written with quoting, date-math or a selector is judged on what it is.
 *
 * The sandbox builder replaces the source command wholesale with a fresh
 * `FROM` node (never a by-name mutation) and re-parses its own output before
 * handing it to anyone: a builder that cannot prove what it built throws.
 */

import type { ESQLAstItem, ESQLAstQueryExpression, ESQLSource } from '@elastic/esql/types';
import { Parser, Builder, BasicPrettyPrinter, mutate } from '@elastic/esql';

import {
  DETONATE_SANDBOX_STREAM_PREFIX,
  detonateSandboxStreamName,
} from '../../common/detonate_prototype';

/** Why a draft was rejected. One guard rule per code; stable for jest and skip_reason. */
export type DetonateDraftGuardCode =
  | 'parse'
  | 'set_header'
  | 'not_from'
  | 'not_esql_rule'
  | 'multiple_source_commands'
  | 'subquery'
  | 'cluster_prefix'
  | 'sandbox_match'
  | 'bare_wildcard'
  | 'outside_default_index'
  | 'selector_or_exclusion_or_datemath'
  | 'command_not_allowed';

export interface DetonateDraftGuardFailure {
  code: DetonateDraftGuardCode;
  /** Human-readable, names the offending source when there is one. */
  reason: string;
}

export type DetonateDraftGuardResult = { ok: true } | DetonateDraftGuardFailure;

const fail = (code: DetonateDraftGuardCode, reason: string): DetonateDraftGuardFailure => ({
  ok: false,
  code,
  reason,
});

/**
 * Fields of a rule that the shape check and re-guard read. Kept structural so
 * the same function judges a draft from `draft_creation` and a rule fetched
 * back from the detection engine.
 */
export interface DetonateDraftRuleShape {
  type?: unknown;
  language?: unknown;
  index?: unknown;
  data_view_id?: unknown;
  query?: unknown;
}

/**
 * Rule-shape check (runs before any parse): only an ES|QL rule — `type` and
 * `language` both `esql`, no `index`, no `data_view_id` — reaches the parse.
 * A KQL rule with a sandbox `index` and an ES|QL-looking query string would
 * otherwise sail through a parse-only check.
 */
export const validateDraftRuleShape = (rule: DetonateDraftRuleShape): DetonateDraftGuardResult => {
  if (rule.type !== 'esql' || rule.language !== 'esql') {
    return fail('not_esql_rule', 'rule is not an ES|QL rule (type/language must be "esql")');
  }
  if (rule.index != null) {
    return fail(
      'not_esql_rule',
      'rule sets `index`; an ES|QL rule must carry its source in the query'
    );
  }
  if (rule.data_view_id != null) {
    return fail(
      'not_esql_rule',
      'rule sets `data_view_id`; an ES|QL rule must carry its source in the query'
    );
  }
  return { ok: true };
};

/** Every source node anywhere in the AST of the source command and its joins/enriches. */
interface DraftSources {
  from: ESQLSource[];
  join: ESQLSource[];
  enrich: ESQLSource[];
  ts: ESQLSource[];
}

const isSourceItem = (item: ESQLAstItem): item is ESQLSource => item.type === 'source';

const collectSources = (query: ESQLAstQueryExpression): DraftSources => {
  const sources: DraftSources = { from: [], join: [], enrich: [], ts: [] };
  for (const cmd of query.commands) {
    for (const arg of cmd.args) {
      if (isSourceItem(arg)) {
        if (cmd.name === 'from') sources.from.push(arg);
        else if (cmd.name === 'join') sources.join.push(arg);
        else if (cmd.name === 'enrich') sources.enrich.push(arg);
        else if (cmd.name === 'ts') sources.ts.push(arg);
      }
    }
  }
  return sources;
};

/** True when any node in the tree is a parenthesized subquery. */
const hasSubquery = (query: ESQLAstQueryExpression): boolean => {
  let found = false;
  const walk = (item: ESQLAstItem): void => {
    if (found || item == null) return;
    if (item.type === 'parens') {
      const paren = item as { child?: { type?: string } };
      if (paren.child?.type === 'query') {
        found = true;
        return;
      }
    }
    if (Array.isArray(item.args)) item.args.forEach(walk);
    if (Array.isArray(item.commands)) item.commands.forEach(walk);
  };
  query.commands.forEach(walk);
  return found;
};

const sourceParts = (source: ESQLSource): { prefix: string; index: string; selector: string } => ({
  prefix: (source.prefix?.value ?? source.prefix ?? '') as string,
  index: (source.index?.value ?? source.index ?? '') as string,
  selector: (source.selector?.value ?? source.selector ?? '') as string,
});

/**
 * Glob vs literal: does `pattern` match the concrete name `name`? `*` spans
 * `.` and `-` in ES index patterns, so this is segment-agnostic, anchored
 * both ends.
 */
export const globMatches = (pattern: string, name: string): boolean => {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(name);
};

/**
 * Glob vs glob: can the two patterns match at least one common name? Exact
 * for `*`-only patterns: a product reachability search over the two patterns
 * read as automata, where a `*` either matches empty (advance itself) or eats
 * one character while only the other side advances. So `logs-*` intersects
 * `logs-secret*` (both match `logs-secret-x`) while `logs-endpoint.*` is
 * disjoint from it, and `logs-*-x` is disjoint from `logs-*-y` (a witness
 * would have to end in both).
 */
export const globsIntersect = (a: string, b: string): boolean => {
  const seen = new Set<number>();
  const stack: Array<[number, number]> = [[0, 0]];
  while (stack.length > 0) {
    const [i, j] = stack.pop() as [number, number];
    if (i === a.length && j === b.length) return true;
    const key = i * (b.length + 1) + j;
    if (!seen.has(key)) {
      seen.add(key);
      const ca = a[i];
      const cb = b[j];
      if (ca !== undefined && cb !== undefined && ca !== '*' && cb !== '*' && ca === cb) {
        stack.push([i + 1, j + 1]);
      }
      if (ca === '*') {
        stack.push([i + 1, j]);
        if (cb !== undefined && cb !== '*') stack.push([i, j + 1]);
      }
      if (cb === '*') {
        stack.push([i, j + 1]);
        if (ca !== undefined && ca !== '*') stack.push([i + 1, j]);
      }
    }
  }
  return false;
};

/** All sources in one flat list, with the command they came from. */
interface TaggedSource {
  source: ESQLSource;
  origin: 'from' | 'join' | 'enrich' | 'ts';
}

const allSources = (sources: DraftSources): TaggedSource[] => [
  ...sources.from.map((source) => ({ source, origin: 'from' as const })),
  ...sources.join.map((source) => ({ source, origin: 'join' as const })),
  ...sources.enrich.map((source) => ({ source, origin: 'enrich' as const })),
  ...sources.ts.map((source) => ({ source, origin: 'ts' as const })),
];

/**
 * FROM guard rules 1–7 over the parsed AST. `defaultIndex` is the space's
 * `securitySolution:defaultIndex`, already resolved (fallback applied).
 */
export const validateDraftQueryAst = (
  query: ESQLAstQueryExpression,
  defaultIndex: readonly string[]
): DetonateDraftGuardResult => {
  // Rule 1: SET header (project routing / unmapped_fields can route or reveal
  // unqualified reads), and the source command must be FROM (ROW/SHOW/PROMQL/TS
  // are not rules).
  if (query.header?.some((cmd) => cmd.name === 'set')) {
    return fail('set_header', 'query has a SET header; drafted rules must not use SET');
  }

  const commands = query.commands;
  const sourceCommands = commands.filter((cmd) =>
    ['from', 'row', 'show', 'ts', 'metrics', 'promql'].includes(cmd.name)
  );
  const first = sourceCommands[0];
  if (sourceCommands.length > 1) {
    return fail('multiple_source_commands', 'query has more than one source command');
  }
  if (first == null || first.name !== 'from') {
    return fail(
      'not_from',
      `source command is ${first?.name ?? 'missing'}; drafted rules must read with FROM`
    );
  }

  // Rule 2: no subqueries anywhere.
  if (hasSubquery(query)) {
    return fail('subquery', 'query contains a subquery');
  }

  const sources = collectSources(query);

  for (const { source, origin } of allSources(sources)) {
    const { prefix, index, selector } = sourceParts(source);
    const originText =
      origin === 'from'
        ? 'FROM'
        : origin === 'join'
        ? 'LOOKUP JOIN'
        : origin === 'enrich'
        ? 'ENRICH'
        : 'TS';

    // Rule 3: no cluster prefix anywhere (CCS/CPS: local only).
    if (prefix !== '') {
      return fail(
        'cluster_prefix',
        `${originText} source "${prefix}:${index}" has a cluster prefix`
      );
    }

    // Rule 7: selectors, exclusions and date-math are rejected, not reasoned about.
    if (selector !== '') {
      return fail(
        'selector_or_exclusion_or_datemath',
        `${originText} source "${index}::${selector}" uses a :: selector`
      );
    }
    if (index.startsWith('-')) {
      return fail(
        'selector_or_exclusion_or_datemath',
        `${originText} source "${index}" is an exclusion entry`
      );
    }
    if (index.startsWith('<')) {
      return fail(
        'selector_or_exclusion_or_datemath',
        `${originText} source "${index}" uses date math`
      );
    }

    // Rule 5: bare wildcards.
    if (index === '*' || index === '*-*') {
      return fail('bare_wildcard', `${originText} source "${index}" is a bare wildcard`);
    }

    // Rule 4: anything that could match the sandbox stream — glob
    // intersection, not prefix. Any source starting with `.` is rejected
    // outright (hidden/system family, sandbox included).
    if (index.startsWith('.')) {
      return fail(
        'sandbox_match',
        `${originText} source "${index}" starts with "." (hidden/system)`
      );
    }
    if (globsIntersect(index, `${DETONATE_SANDBOX_STREAM_PREFIX}*`)) {
      return fail(
        'sandbox_match',
        `${originText} source "${index}" could match the detonate sandbox stream`
      );
    }
  }

  // Rule 6: containment in defaultIndex for FROM sources. JOIN/ENRICH/TS
  // targets are auxiliary (lookup tables, enrich indices, metrics), not event
  // indices — rules 3–5 above already keep them local, visible and
  // non-sandbox; containment is not required for them.
  //
  // Containment (plan §267): the source must equal a default pattern or be a
  // literal prefix-extension of one (`logs-endpoint.*` is inside `logs-*`).
  // A wildcard superset of a default (`l*`, `log*`) is rejected even though
  // it matches it, so a `defaultIndex` of `['*']` — which names no concrete
  // family — contains only itself, never a narrower wildcard.
  const includes = defaultIndex.filter((p) => !p.startsWith('-'));
  const excludes = defaultIndex.filter((p) => p.startsWith('-')).map((p) => p.slice(1));
  for (const source of sources.from) {
    const { index } = sourceParts(source);
    if (excludes.some((ex) => globsIntersect(index, ex))) {
      return fail('outside_default_index', `source "${index}" matches a default-index exclusion`);
    }
    const contained = includes.some((pattern) => {
      if (index === pattern) return true;
      // A wildcard source is contained only when it narrows a concrete
      // default family: its literal head must extend a default pattern's
      // literal head, and that default must itself name a family (its literal
      // head is non-empty).
      if (index.includes('*')) {
        const defaultLiteralHead = pattern.split('*')[0];
        return defaultLiteralHead !== '' && index.startsWith(defaultLiteralHead);
      }
      // A literal source is contained when a default pattern matches it.
      return globMatches(pattern, index);
    });
    if (!contained) {
      return fail(
        'outside_default_index',
        `source "${index}" is not contained in the space default indices`
      );
    }
  }

  return { ok: true };
};

/**
 * Commands an internal-user sandbox count may run. The FROM guard (rules 1–7)
 * already bounds the sources; this list bounds the pipeline so the read
 * cannot reach a lookup index, enrich index, remote cluster or linked
 * project whatever the source patterns say.
 */
const SANDBOX_COUNT_ALLOWED_COMMANDS = new Set([
  'from',
  'where',
  'eval',
  'stats',
  'keep',
  'drop',
  'rename',
  'sort',
  'limit',
  'dissect',
  'grok',
  'mv_expand',
]);

/** Every command in the pipeline is on the sandbox-count allow-list. */
export const validateSandboxCountCommandAllowlist = (
  query: ESQLAstQueryExpression
): DetonateDraftGuardResult => {
  if (query.header?.some((cmd) => cmd.name === 'set')) {
    return fail('set_header', 'query has a SET header; sandbox counts must not use SET');
  }
  for (const cmd of query.commands) {
    if (!SANDBOX_COUNT_ALLOWED_COMMANDS.has(cmd.name)) {
      return fail(
        'command_not_allowed',
        `command "${cmd.name}" is not allowed in a sandbox count query`
      );
    }
  }
  return { ok: true };
};

/**
 * The `sandbox_count` route's whole judgement in one parse: the FROM guard
 * (rules 1–7) against the space default index, then the command allow-list
 * over the same AST. The route builds the query it runs; this proves the
 * text it was handed is bounded first.
 */
export const validateSandboxCountRuleQuery = (
  queryText: string,
  defaultIndex: readonly string[]
): DetonateDraftGuardResult => {
  let query: ESQLAstQueryExpression;
  try {
    const parsed = Parser.parse(queryText);
    if (parsed.errors.length > 0) {
      return fail('parse', 'query does not parse as ES|QL');
    }
    ({ root: query } = parsed);
  } catch {
    return fail('parse', 'query does not parse as ES|QL');
  }
  const guard = validateDraftQueryAst(query, defaultIndex);
  if (!guard.ok) return guard;
  return validateSandboxCountCommandAllowlist(query);
};

/** Parse + guard in one call. Parse errors are guard failures, not exceptions. */
export const validateDraftRuleQuery = (
  queryText: string,
  defaultIndex: readonly string[]
): DetonateDraftGuardResult => {
  let query: ESQLAstQueryExpression;
  try {
    // The parser is lenient: it returns an `errors` list rather than throwing
    // (it is built for autocomplete), so an empty `FROM` slips through as an
    // AST with zero sources. Errors on the list, or no FROM sources at all,
    // are parse failures.
    const parsed = Parser.parse(queryText);
    if (parsed.errors.length > 0) {
      return fail('parse', 'query does not parse as ES|QL');
    }
    ({ root: query } = parsed);
  } catch {
    return fail('parse', 'query does not parse as ES|QL');
  }
  return validateDraftQueryAst(query, defaultIndex);
};

export interface DetonateSandboxCountQuery {
  sandbox_query: string;
  production_query: string;
}

/**
 * Build the sandbox and production count variants from a validated query.
 *
 * The sandbox variant swaps the whole source command for a fresh
 * `FROM .kibana-detonate-sandbox-<spaceId>`, inserts
 * `WHERE detonate.task_id == <task_id>` directly after the source command,
 * drops any trailing LIMIT, and appends `STATS c = COUNT(*)` last. The
 * production variant keeps the original sources, still drops the LIMIT and
 * appends the count — the count must not be capped by a page-size LIMIT.
 *
 * Both variants are re-parsed after building; the printed sandbox query must
 * have no SET header and exactly one FROM with exactly one source equal to the
 * sandbox stream, unprefixed, unselected. Anything else throws.
 */
export const buildDetonateCountQueries = (
  queryText: string,
  taskId: string,
  spaceId: string
): DetonateSandboxCountQuery => {
  // Both variants parse from the same text, each into its own AST.
  const sandboxAst = Parser.parse(queryText).root;
  sandboxAst.commands[0] = Builder.command({
    name: 'from',
    args: [Builder.expression.source.index(detonateSandboxStreamName(spaceId))],
  });
  mutate.commands.limit.remove(sandboxAst);
  sandboxAst.commands.splice(
    1,
    0,
    Builder.command({
      name: 'where',
      args: [
        Builder.expression.func.binary('==', [
          Builder.expression.column('detonate.task_id'),
          Builder.expression.literal.string(taskId),
        ]),
      ],
    })
  );
  sandboxAst.commands.push(Builder.command({ name: 'stats', args: [countStar()] }));
  const sandboxQuery = BasicPrettyPrinter.print(sandboxAst);
  assertSandboxCountQuery(sandboxQuery, spaceId);

  // Production variant: sources untouched, LIMIT removed, count appended.
  const productionAst = Parser.parse(queryText).root;
  mutate.commands.limit.remove(productionAst);
  productionAst.commands.push(Builder.command({ name: 'stats', args: [countStar()] }));
  const productionQuery = BasicPrettyPrinter.print(productionAst);

  return { sandbox_query: sandboxQuery, production_query: productionQuery };
};

const countStar = () =>
  Builder.expression.func.binary('=', [
    Builder.expression.column('c'),
    Builder.expression.func.call('count', [Builder.expression.column('*')]),
  ]);

/**
 * Post-build assertion: re-parse the printed query and prove its shape. A
 * builder that cannot prove what it built never hands it to a caller.
 */
export const assertSandboxCountQuery = (sandboxQuery: string, spaceId: string): void => {
  const expected = detonateSandboxStreamName(spaceId);
  const { root } = Parser.parse(sandboxQuery);
  if (root.header?.some((cmd) => cmd.name === 'set')) {
    throw new Error('sandbox count query unexpectedly has a SET header');
  }
  const fromCommands = root.commands.filter((cmd) => cmd.name === 'from');
  if (fromCommands.length !== 1) {
    throw new Error(`sandbox count query has ${fromCommands.length} FROM commands`);
  }
  const fromSources = fromCommands[0].args.filter((arg) => arg.type === 'source');
  if (fromSources.length !== 1) {
    throw new Error(`sandbox count FROM has ${fromSources.length} sources`);
  }
  const source = fromSources[0] as ESQLSource;
  const { prefix, index, selector } = sourceParts(source);
  if (prefix !== '' || selector !== '' || index !== expected) {
    throw new Error(
      `sandbox count FROM source is "${prefix}:${index}${
        selector ? `::${selector}` : ''
      }", expected "${expected}"`
    );
  }
};
