/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ActivityEvent,
  ActivityFeedFilters,
  ActivityFeedResponse,
  ActivityLayer,
  ActivityPressure,
} from '../types/activity_feed';

const ALL_LAYERS: readonly ActivityLayer[] = [
  'telemetry',
  'detection',
  'mutation',
  'response',
  'governance',
] as const;

const VALID_PRESSURE: ReadonlySet<ActivityPressure> = new Set([
  'low',
  'moderate',
  'high',
  'critical',
]);

/**
 * Minimal raw-hit shape the builder accepts. The server route passes the
 * already-decorated `source_index` (because ES returns it in `_index`), the
 * doc id, and the `_source` body. We stay loose on the body because each of
 * the five `.soc-*` indices has its own schema.
 */
export interface RawActivityHit {
  readonly layer: ActivityLayer;
  readonly index: string;
  readonly doc_id: string;
  readonly source: Record<string, unknown>;
}

export interface BuildActivityFeedArgs {
  readonly hits: readonly RawActivityHit[];
  readonly filters?: ActivityFeedFilters;
  readonly limit?: number;
}

const DEFAULT_LIMIT = 50;
const HARD_CAP = 200;

/**
 * Turn a mixed set of `.soc-*` documents into the normalised activity-feed
 * event shape. Every field is defensive — unknown indices produce a "raw"
 * row instead of a crash.
 *
 * Input fields are read with shallow lookups and explicit coercion:
 *   - strings are cast via `String()` then trimmed
 *   - numbers are validated via `Number.isFinite`
 *   - pressure strings are normalised to lowercase and whitelisted
 *
 * Events are deduped by `id` (so the same hit appearing under two layer
 * queries doesn't show twice), sorted newest-first, optionally filtered by
 * the request, then trimmed to `limit`.
 */
export const buildActivityFeed = ({
  hits,
  filters,
  limit = DEFAULT_LIMIT,
}: BuildActivityFeedArgs): ActivityFeedResponse => {
  const effectiveLimit = Math.max(1, Math.min(limit, HARD_CAP));

  const seen = new Set<string>();
  const events: ActivityEvent[] = [];
  for (const hit of hits) {
    const event = hitToEvent(hit);
    if (event && !seen.has(event.id)) {
      seen.add(event.id);
      events.push(event);
    }
  }

  // Sort newest-first. Timestamps are ISO8601 so lexicographic sort matches
  // chronological order.
  events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  // Count BEFORE applying user filters so the UI chip badges always reflect
  // "how many events of this layer exist", not "how many are currently
  // visible".
  const countsByLayer: Record<ActivityLayer, number> = {
    telemetry: 0,
    detection: 0,
    mutation: 0,
    response: 0,
    governance: 0,
  };
  for (const ev of events) countsByLayer[ev.layer] += 1;

  const filtered = events.filter((ev) => matches(ev, filters));
  const truncated = filtered.length > effectiveLimit;
  const visible = truncated ? filtered.slice(0, effectiveLimit) : filtered;

  return {
    events: visible,
    truncated,
    counts_by_layer: countsByLayer,
  };
};

/**
 * Factory that maps a single raw hit into an `ActivityEvent`. Returns `null`
 * when the hit cannot produce a renderable event (no timestamp, no title
 * material). Called per-index rather than per-layer so we can use the source
 * index to pick the title/subtitle fields.
 */
export const hitToEvent = ({
  layer,
  index,
  doc_id: docId,
  source,
}: RawActivityHit): ActivityEvent | null => {
  const timestamp = readString(source['@timestamp']);
  if (!timestamp) return null;

  const baseActor = readActorId(source) ?? defaultActorId(index);

  // Per-layer title/subtitle builders. These switch statements keep the
  // UI-copy concerns at the edge of the system — the panel never touches
  // raw ES shapes.
  const { title, subtitle } = buildTitleSubtitle(layer, index, source);
  if (!title) return null;

  const rawPressure = readString(source.pressure);
  const pressure =
    rawPressure && VALID_PRESSURE.has(rawPressure.toLowerCase() as ActivityPressure)
      ? (rawPressure.toLowerCase() as ActivityPressure)
      : undefined;

  return {
    id: `${index}:${docId}`,
    layer,
    timestamp,
    actor_id: baseActor,
    actor_trust_tier: readString(source.actor_trust_tier) ?? readString(source.tier),
    pressure,
    title,
    subtitle,
    source_index: index,
    source_doc_id: docId,
    alert_id: readAlertId(source),
    run_id: readString(source.run_id),
    rule_id: readString(source.rule_id),
    mutation_intent_id: readString(source.mutation_intent_id),
  };
};

/**
 * Matching predicate for the optional filter set. Matches the server-side
 * behaviour the UI expects — OR within a filter kind, AND across kinds.
 */
export const matches = (ev: ActivityEvent, filters: ActivityFeedFilters | undefined): boolean => {
  if (!filters) return true;
  if (filters.layers?.length && !filters.layers.includes(ev.layer)) return false;
  if (filters.pressure?.length && (!ev.pressure || !filters.pressure.includes(ev.pressure))) {
    return false;
  }
  if (filters.actorIds?.length && !filters.actorIds.includes(ev.actor_id)) return false;
  if (
    filters.trustTiers?.length &&
    (!ev.actor_trust_tier || !filters.trustTiers.includes(ev.actor_trust_tier))
  ) {
    return false;
  }
  return true;
};

const buildTitleSubtitle = (
  layer: ActivityLayer,
  index: string,
  source: Record<string, unknown>
): { title?: string; subtitle?: string } => {
  // Prefer an explicit `title` field when the doc carries one (custom
  // activity-feed ingestion). `label` is the legacy field name some of our
  // seed/ticker docs use and also the field the mutation lineage panel
  // reads — accept both so the activity feed surfaces the same human-
  // readable copy the drilldown panels use.
  const explicitTitle = readString(source.title) ?? readString(source.label);
  if (explicitTitle) {
    return { title: explicitTitle, subtitle: readString(source.subtitle) };
  }

  switch (layer) {
    case 'telemetry': {
      const processName = readString((source.process as { name?: unknown } | undefined)?.name);
      const summary = processName ?? readString(source.summary);
      return {
        title: 'Telemetry signal observed',
        subtitle: summary,
      };
    }
    case 'detection': {
      const prob = readFiniteNumber(source.exploit_probability);
      if (prob !== undefined) {
        return {
          title: `Exploit probability ${prob.toFixed(2)}`,
          subtitle: readString(source.rationale ?? source.subtitle),
        };
      }
      return {
        title: readString(source.summary) ?? 'Detection event',
        subtitle: readString(source.subtitle),
      };
    }
    case 'mutation': {
      const status = readString(source.status ?? source.stage) ?? 'queued';
      return {
        title: `Mutation intent ${status}`,
        subtitle: readMeaningfulRuleOrIntentId(source),
      };
    }
    case 'response': {
      const pipeline = readString(source.pipeline);
      const stage = readString(source.stage);
      // Alert-sweeper per-alert verdicts. These docs don't carry a rule_id
      // (or carry the placeholder "unknown") and don't fit the apply/rollback
      // shape below. Surface the verdict + disposition instead of the
      // useless "Response action — unknown" fallback.
      if (pipeline === 'soc-alert-sweeper' || stage === 'per_alert_verdict') {
        const classification = readString(source.classification);
        const verdict = readString(source.verdict);
        const disposition = readString(source.disposition);
        const label = classification ?? verdict ?? 'processed';
        const subtitleParts = [disposition, readMeaningfulRuleOrAlertId(source)].filter(
          (part): part is string => Boolean(part)
        );
        return {
          title: `Alert triage verdict: ${label.toLowerCase()}`,
          subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined,
        };
      }
      const action = readString(source.action ?? source.recommendation_type ?? source.status);
      return {
        title: action ? `Response action: ${action}` : 'Response action',
        subtitle: readMeaningfulRuleOrIntentId(source),
      };
    }
    case 'governance': {
      const code = readString(source.code);
      if (code) {
        return {
          title: `Governance flag: ${code}`,
          subtitle: readString(source.reason ?? source.subtitle),
        };
      }
      const tier = readString(source.tier);
      if (tier) {
        return {
          title: `Trust tier set to ${tier}`,
          subtitle: readString(source.actor_id ?? source.reason),
        };
      }
      return {
        title: `Governance event (${index})`,
        subtitle: readString(source.reason),
      };
    }
    default:
      return {};
  }
};

const readString = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  // Some indices store identifiers as numbers; coerce so the feed keeps working.
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
};

/**
 * Reject placeholder identifier values that upstream pipelines stamp when
 * they can't resolve a real id. Surfacing "unknown" as a subtitle is noisy
 * and strictly worse than showing nothing.
 */
const PLACEHOLDER_IDS: ReadonlySet<string> = new Set(['unknown', 'n/a', 'none', '-', '']);

const readMeaningfulString = (value: unknown): string | undefined => {
  const str = readString(value);
  if (str === undefined) return undefined;
  return PLACEHOLDER_IDS.has(str.toLowerCase()) ? undefined : str;
};

const readMeaningfulRuleOrIntentId = (source: Record<string, unknown>): string | undefined =>
  readMeaningfulString(source.rule_id) ?? readMeaningfulString(source.mutation_intent_id);

const readMeaningfulRuleOrAlertId = (source: Record<string, unknown>): string | undefined =>
  readMeaningfulString(source.rule_id) ??
  readMeaningfulString(source.alert_id) ??
  readMeaningfulString(source.rule_name);

const readFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
};

const readActorId = (source: Record<string, unknown>): string | undefined => {
  return (
    readString(source.actor_id) ??
    readString(source['agent.id']) ??
    readString((source.agent as Record<string, unknown> | undefined)?.id) ??
    readString(source.author)
  );
};

const readAlertId = (source: Record<string, unknown>): string | undefined => {
  return (
    readString(source.alert_id) ??
    readString(source['kibana.alert.uuid']) ??
    readString((source.kibana as { alert?: { uuid?: unknown } } | undefined)?.alert?.uuid)
  );
};

const defaultActorId = (index: string): string => {
  // When no actor id can be read we fall back to a short label derived from
  // the source index, so the UI never shows an empty actor column.
  return index.replace(/^\.+/, '').replace(/^soc-/, 'soc/');
};

export const allActivityLayers = (): readonly ActivityLayer[] => ALL_LAYERS;
