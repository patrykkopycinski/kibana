/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type {
  ArgusEventSample,
  ArgusEventSampleClassification,
  ArgusMutationPostApplyObservation,
  DetailRawOutcomeDoc,
} from '@kbn/argus-console-common';

const SECURITY_ALERTS_INDEX_PATTERN = '.alerts-security.alerts-*';
const POST_APPLY_SAMPLE_LIMIT = 5;
/**
 * Cap the observation window at 60 minutes for applied-but-still-running
 * mutations. The flyout is scoped to the canary/watch window, not "every
 * alert this rule has ever fired".
 */
const OPEN_OBSERVATION_WINDOW_MS = 60 * 60 * 1000;

interface RawAlertDoc {
  readonly '@timestamp'?: string | null;
  readonly 'kibana.alert.uuid'?: string | null;
  readonly 'kibana.alert.rule.rule_id'?: string | null;
  readonly 'kibana.alert.rule.name'?: string | null;
  readonly 'host.name'?: string | null;
  readonly 'user.name'?: string | null;
  readonly 'process.executable'?: string | null;
  readonly 'process.command_line'?: string | null;
  readonly argus?: {
    readonly mutation_intent_id?: string | null;
    readonly classification?: string | null;
    readonly reason?: string | null;
  } | null;
}

const readStringField = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readArgusClassification = (value: unknown): ArgusEventSampleClassification => {
  const normalised = readStringField(value);
  if (normalised === 'fp' || normalised === 'tp') return normalised;
  return 'unclassified';
};

const buildAlertsDeepLink = (
  ruleId: string | null,
  mutationIntentId: string,
  windowStart: string,
  windowEnd: string
): string => {
  const filter = ruleId
    ? `kibana.alert.rule.rule_id:"${ruleId}"`
    : `argus.mutation_intent_id:"${mutationIntentId}"`;
  const params = new URLSearchParams({
    query: filter,
    timerange: `(from:'${windowStart}',to:'${windowEnd}',kind:absolute)`,
  });
  return `/app/security/alerts?${params.toString()}`;
};

export interface FetchPostApplyObservationArgs {
  readonly esClient: ElasticsearchClient;
  readonly logger: Logger;
  readonly outcome: DetailRawOutcomeDoc | undefined;
  readonly ruleId: string | null;
  readonly mutationIntentId: string;
}

/**
 * Observe alerts fired by the rule inside the canary/applied window. Gracefully
 * degrades to `null` when the outcome never applied, the alerts index is
 * missing, or ES refuses the query — callers should treat `null` as "no
 * observation available" rather than "zero alerts observed".
 */
export const fetchPostApplyObservation = async ({
  esClient,
  logger,
  outcome,
  ruleId,
  mutationIntentId,
}: FetchPostApplyObservationArgs): Promise<ArgusMutationPostApplyObservation | null> => {
  if (!outcome?.applied_at) return null;
  const appliedAt = readStringField(outcome.applied_at);
  if (!appliedAt) return null;

  const windowStart = appliedAt;
  const windowEnd =
    readStringField(outcome.rolled_back_at) ??
    new Date(
      Math.min(Date.parse(appliedAt) + OPEN_OBSERVATION_WINDOW_MS, Date.now())
    ).toISOString();

  // `match_phrase` tolerates `rule_id` being mapped as `text` on some
  // cluster shapes; `term` handles the common keyword mapping. We OR
  // against a custom `argus.mutation_intent_id` tag so the seed script
  // can correlate alerts without depending on `rule_id` wiring.
  const ruleFilters = [
    ...(ruleId
      ? [
          { term: { 'kibana.alert.rule.rule_id': ruleId } },
          { term: { 'kibana.alert.rule.rule_id.keyword': ruleId } },
          { match_phrase: { 'kibana.alert.rule.rule_id': ruleId } },
        ]
      : []),
    { term: { 'argus.mutation_intent_id.keyword': mutationIntentId } },
    { match_phrase: { 'argus.mutation_intent_id': mutationIntentId } },
  ];

  try {
    const res = await esClient.search<RawAlertDoc>({
      index: SECURITY_ALERTS_INDEX_PATTERN,
      ignore_unavailable: true,
      size: POST_APPLY_SAMPLE_LIMIT,
      sort: [{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }],
      track_total_hits: true,
      query: {
        bool: {
          filter: [
            { range: { '@timestamp': { gte: windowStart, lte: windowEnd } } },
            { bool: { should: ruleFilters, minimum_should_match: 1 } },
          ],
        },
      },
      aggs: {
        by_classification: {
          terms: {
            field: 'argus.classification.keyword',
            size: 5,
            missing: 'unclassified',
          },
        },
      },
    });

    const total =
      typeof res.hits.total === 'number'
        ? res.hits.total
        : res.hits.total?.value ?? 0;

    const buckets =
      (
        res.aggregations as
          | { by_classification?: { buckets?: Array<{ key: string; doc_count: number }> } }
          | undefined
      )?.by_classification?.buckets ?? [];

    let fp = 0;
    let tp = 0;
    for (const bucket of buckets) {
      if (bucket.key === 'fp') fp = bucket.doc_count;
      else if (bucket.key === 'tp') tp = bucket.doc_count;
    }

    const sampleEvents: ArgusEventSample[] = [];
    for (const hit of res.hits.hits) {
      const source = hit._source ?? {};
      const id =
        readStringField(source['kibana.alert.uuid']) ?? readStringField(hit._id);
      if (!id) continue;
      sampleEvents.push({
        event_id: id,
        timestamp: readStringField(source['@timestamp']),
        host_name: readStringField(source['host.name']),
        user_name: readStringField(source['user.name']),
        process_executable: readStringField(source['process.executable']),
        command_line: readStringField(source['process.command_line']),
        classification: readArgusClassification(source.argus?.classification),
        reason: readStringField(source.argus?.reason),
      });
    }

    return {
      window_start: windowStart,
      window_end: windowEnd,
      alerts_total: total,
      alerts_classified_fp: fp,
      alerts_classified_tp: tp,
      sample_events: sampleEvents,
      alerts_deep_link_url: buildAlertsDeepLink(
        ruleId,
        mutationIntentId,
        windowStart,
        windowEnd
      ),
    };
  } catch (err) {
    logger.debug(
      `Argus post-apply observation failed for ${mutationIntentId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
};
