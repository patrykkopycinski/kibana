/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import { ENTITY_LATEST, getEntitiesAlias } from '@kbn/entity-store/server';
import { i18n } from '@kbn/i18n';
import {
  resolveEntityContextInputSchema,
  resolveEntityContextStepCommonDefinition,
} from '../../../../common/workflows/step_types/resolve_entity_context_step';

export { resolveEntityContextInputSchema };

const getNestedString = (doc: Record<string, unknown>, keys: string[]): string | undefined => {
  let cur: unknown = doc;
  for (const key of keys) {
    if (cur && typeof cur === 'object' && key in cur) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' && cur.length > 0 ? cur : undefined;
};

const extractAlertIdentifiers = (
  alertDocument: Record<string, unknown>
): { hostName?: string; userName?: string; sourceIp?: string } => {
  const hostName =
    getNestedString(alertDocument, ['host', 'name']) ??
    (typeof alertDocument['host.name'] === 'string' ? alertDocument['host.name'] : undefined);
  const userName =
    getNestedString(alertDocument, ['user', 'name']) ??
    (typeof alertDocument['user.name'] === 'string' ? alertDocument['user.name'] : undefined);
  const sourceIp =
    getNestedString(alertDocument, ['source', 'ip']) ??
    (typeof alertDocument['source.ip'] === 'string' ? alertDocument['source.ip'] : undefined);
  return { hostName, userName, sourceIp };
};

const activeBehaviorKeys = (behaviors: unknown): string[] => {
  if (!behaviors || typeof behaviors !== 'object' || Array.isArray(behaviors)) {
    return [];
  }
  return Object.entries(behaviors as Record<string, unknown>)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
};

const readWatchlists = (source: Record<string, unknown>): string[] => {
  const w = source.watchlists ?? source.watchlist_ids;
  if (Array.isArray(w)) {
    return w.filter((x): x is string => typeof x === 'string');
  }
  return [];
};

const buildEntityShouldClauses = (ids: {
  hostName?: string;
  userName?: string;
  sourceIp?: string;
}): estypes.QueryDslQueryContainer[] => {
  const clauses: estypes.QueryDslQueryContainer[] = [];
  if (ids.hostName) {
    clauses.push({
      bool: {
        should: [
          { match: { 'host.name': { query: ids.hostName, operator: 'and' } } },
          { term: { 'host.name': ids.hostName } },
        ],
        minimum_should_match: 1,
      },
    });
  }
  if (ids.userName) {
    clauses.push({
      bool: {
        should: [
          { match: { 'user.name': { query: ids.userName, operator: 'and' } } },
          { term: { 'user.name': ids.userName } },
        ],
        minimum_should_match: 1,
      },
    });
  }
  if (ids.sourceIp) {
    clauses.push({
      bool: {
        should: [
          { term: { 'host.ip': ids.sourceIp } },
          { term: { 'source.ip': ids.sourceIp } },
          { term: { 'client.ip': ids.sourceIp } },
        ],
        minimum_should_match: 1,
      },
    });
  }
  return clauses;
};

export const resolveEntityContextStepDefinition = createServerStepDefinition({
  ...resolveEntityContextStepCommonDefinition,
  handler: async (context) => {
    try {
      const { alert_document: alertDocument } = context.input;
      const doc = alertDocument as Record<string, unknown>;
      const ids = extractAlertIdentifiers(doc);
      const should = buildEntityShouldClauses(ids);

      if (should.length === 0) {
        return { output: { entities: [] } };
      }

      const esClient = context.contextManager.getScopedEsClient();
      const spaceId = context.contextManager.getContext().workflow.spaceId;
      const index = getEntitiesAlias(ENTITY_LATEST, spaceId);

      const res = await esClient.search<Record<string, unknown>>({
        index,
        ignore_unavailable: true,
        allow_no_indices: true,
        size: 50,
        query: {
          bool: {
            should,
            minimum_should_match: 1,
          },
        },
      });

      const hits = res.hits.hits;
      const byId = new Map<
        string,
        {
          entity_id: string;
          entity_type: string;
          risk_score: number;
          asset_criticality?: string | null;
          first_seen?: string;
          last_activity?: string;
          watchlists: string[];
          behaviors: string[];
        }
      >();

      hits.forEach((hit) => {
        const source = hit._source;
        const entity = source?.entity as Record<string, unknown> | undefined;
        // Drop hits without a usable entity envelope; the upstream search
        // is best-effort so partial documents shouldn't crash the step.
        if (!source || !entity || typeof entity.id !== 'string') return;
        const entityId = entity.id;
        const entityType = typeof entity.type === 'string' ? entity.type : 'unknown';
        const riskBlock = entity.risk as Record<string, unknown> | undefined;
        const riskScore =
          typeof riskBlock?.calculated_score_norm === 'number'
            ? riskBlock.calculated_score_norm
            : typeof riskBlock?.calculated_score === 'number'
            ? riskBlock.calculated_score
            : 0;
        const asset = source.asset as Record<string, unknown> | undefined;
        const assetCriticality =
          typeof asset?.criticality === 'string'
            ? asset.criticality
            : typeof entity.asset === 'object' &&
              entity.asset !== null &&
              'criticality' in entity.asset
            ? String((entity.asset as Record<string, unknown>).criticality ?? '')
            : undefined;
        const lifecycle = entity.lifecycle as Record<string, unknown> | undefined;
        const firstSeen =
          typeof lifecycle?.first_seen === 'string' ? lifecycle.first_seen : undefined;
        const lastActivity =
          typeof lifecycle?.last_activity === 'string'
            ? lifecycle.last_activity
            : typeof lifecycle?.last_seen === 'string'
            ? lifecycle.last_seen
            : undefined;

        byId.set(entityId, {
          entity_id: entityId,
          entity_type: entityType,
          risk_score: riskScore,
          asset_criticality: assetCriticality ?? null,
          first_seen: firstSeen,
          last_activity: lastActivity,
          watchlists: readWatchlists(source),
          behaviors: activeBehaviorKeys(entity.behaviors),
        });
      });

      return {
        output: {
          entities: Array.from(byId.values()),
        },
      };
    } catch (error) {
      context.logger.error(
        i18n.translate('xpack.securitySolution.workflows.steps.resolveEntityContext.errorLog', {
          defaultMessage: 'Failed to resolve entity context',
        }),
        error instanceof Error ? error : new Error(String(error))
      );
      return {
        error: new Error(
          error instanceof Error ? error.message : 'Failed to resolve entity context'
        ),
      };
    }
  },
});
