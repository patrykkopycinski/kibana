/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { addIdToItem } from '@kbn/securitysolution-utils';
import type { ThreatMapping } from '../../../common/api/detection_engine/model/rule_schema';
import type { FieldValueQueryBar } from '../../detection_engine/rule_creation_ui/components/query_bar_field';

export type DetonationIndicatorType = 'domain' | 'ip' | 'file_hash';

export interface DetonationIndicator {
  type: DetonationIndicatorType;
  value: string;
}

export interface RuleFromDetonation {
  threatQueryBar: FieldValueQueryBar;
  threatMapping: ThreatMapping;
}

/** Most values carried per indicator type, bounding both the URL and the generated query. */
export const MAX_INDICATORS_PER_TYPE = 100;

interface FieldPair {
  /** Event field on the rule's source indices. */
  eventField: string;
  /** ECS threat-intel field the values are matched against. */
  threatField: string;
}

/** Hash digest length -> algorithm; any other length is dropped. */
const HASH_ALGORITHM_BY_LENGTH: Readonly<Record<number, string>> = {
  32: 'md5',
  40: 'sha1',
  64: 'sha256',
  128: 'sha512',
};

const HASH_PATTERN = /^[0-9a-f]+$/i;

const fileHashPair = (value: string): FieldPair | null => {
  const algorithm = HASH_ALGORITHM_BY_LENGTH[value.length];
  if (algorithm === undefined || !HASH_PATTERN.test(value)) return null;
  return {
    eventField: `file.hash.${algorithm}`,
    threatField: `threat.indicator.file.hash.${algorithm}`,
  };
};

/** Domain indicators match both DNS question and destination domain event fields. */
const DOMAIN_EVENT_FIELDS = ['dns.question.name', 'destination.domain'] as const;
const DOMAIN_THREAT_FIELD = 'threat.indicator.domain';

const isValidIndicatorValue = (type: DetonationIndicatorType, value: string): boolean => {
  if (type === 'file_hash') return fileHashPair(value) !== null;
  return true;
};

/**
 * Keeps well-formed indicators only (known type, non-empty string value, recognizable
 * hash algorithm for file hashes), drops duplicates and caps each type at
 * `MAX_INDICATORS_PER_TYPE`. Accepts untrusted (URL-decoded) input.
 */
export const sanitizeDetonationIndicators = (input: unknown): DetonationIndicator[] => {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const perType: Record<DetonationIndicatorType, number> = { domain: 0, ip: 0, file_hash: 0 };
  const result: DetonationIndicator[] = [];

  (input as unknown[]).forEach((item) => {
    if (typeof item !== 'object' || item === null) return;
    const { type, value } = item as { type?: unknown; value?: unknown };
    if (!isIndicatorType(type) || typeof value !== 'string') return;
    const trimmed = value.trim();
    const key = `${type}:${trimmed}`;
    if (
      trimmed === '' ||
      seen.has(key) ||
      perType[type] >= MAX_INDICATORS_PER_TYPE ||
      !isValidIndicatorValue(type, trimmed)
    ) {
      return;
    }
    seen.add(key);
    perType[type] += 1;
    result.push({ type, value: trimmed });
  });
  return result;
};

const isIndicatorType = (type: unknown): type is DetonationIndicatorType =>
  type === 'domain' || type === 'ip' || type === 'file_hash';

const quote = (value: string): string => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const valuesClause = (threatField: string, values: string[]): string =>
  `${threatField} : (${values.map(quote).join(' or ')})`;

/**
 * Builds the threat query and threat mapping of an indicator match rule from detonation
 * indicators. Each file-hash algorithm contributes its own clause and mapping entry, and
 * domain indicators map to both `dns.question.name` and `destination.domain`.
 * Returns null when no valid indicator remains.
 */
export const buildRuleFromDetonation = (input: unknown): RuleFromDetonation | null => {
  const indicators = sanitizeDetonationIndicators(input);
  if (indicators.length === 0) return null;

  const clauses: string[] = [];
  const mapping: ThreatMapping = [];

  const pushPair = (threatField: string, values: string[], eventFields: readonly string[]) => {
    clauses.push(valuesClause(threatField, values));
    eventFields.forEach((eventField) =>
      mapping.push(
        addIdToItem({
          entries: [
            addIdToItem({ field: eventField, type: 'mapping' as const, value: threatField }),
          ],
        })
      )
    );
  };

  // File hashes: one clause and mapping entry per digest algorithm, in first-seen order.
  const hashValuesByAlgorithm = new Map<string, string[]>();
  indicators.forEach(({ type, value }) => {
    if (type !== 'file_hash') return;
    const pair = fileHashPair(value);
    if (pair === null) return;
    const algorithm = pair.eventField.replace('file.hash.', '');
    hashValuesByAlgorithm.set(algorithm, [...(hashValuesByAlgorithm.get(algorithm) ?? []), value]);
  });
  hashValuesByAlgorithm.forEach((values, algorithm) =>
    pushPair(`threat.indicator.file.hash.${algorithm}`, values, [`file.hash.${algorithm}`])
  );

  const ips = indicators.filter((i) => i.type === 'ip').map((i) => i.value);
  if (ips.length > 0) pushPair('threat.indicator.ip', ips, ['destination.ip']);

  const domains = indicators.filter((i) => i.type === 'domain').map((i) => i.value);
  if (domains.length > 0) {
    pushPair(DOMAIN_THREAT_FIELD, domains, DOMAIN_EVENT_FIELDS);
  }

  return {
    threatQueryBar: {
      query: { query: clauses.join(' or '), language: 'kuery' },
      filters: [],
      saved_id: null,
    },
    threatMapping: mapping,
  };
};
