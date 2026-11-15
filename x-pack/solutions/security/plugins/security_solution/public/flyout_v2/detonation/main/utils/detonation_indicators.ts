/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v5 as uuidv5 } from 'uuid';
import type { DetonationRecord } from '../../../../../common/detonate_prototype';
import * as i18n from '../../../../detonate_prototype/translations';

export type IndicatorType = 'domain' | 'ip' | 'file_hash';

export interface IndicatorRow {
  type: IndicatorType;
  value: string;
}

/**
 * `not_read`: no alert read succeeded, so the record carries no indicator arrays.
 * `none`: the alerts were read and held no indicators.
 */
export type IndicatorsState = 'not_read' | 'none' | 'found';

export interface DetonationIndicators {
  state: IndicatorsState;
  rows: IndicatorRow[];
}

/** Reads the three indicator arrays off a record, keeping "not read" apart from "none found". */
export const getDetonationIndicators = (
  record: DetonationRecord | undefined
): DetonationIndicators => {
  const domains = record?.['detonate.iocs.domains'];
  const ips = record?.['detonate.iocs.ips'];
  const hashes = record?.['detonate.iocs.file_hashes'];
  if (!domains && !ips && !hashes) return { state: 'not_read', rows: [] };

  const rows: IndicatorRow[] = [
    ...(domains ?? []).map((value) => ({ type: 'domain' as const, value })),
    ...(ips ?? []).map((value) => ({ type: 'ip' as const, value })),
    ...(hashes ?? []).map((value) => ({ type: 'file_hash' as const, value })),
  ];
  return { state: rows.length ? 'found' : 'none', rows };
};

/** STIX 2.1 hash names by hex length; any other length is not a hash STIX can name. */
const HASH_ALGORITHM_BY_LENGTH: Readonly<Record<number, string>> = {
  32: 'MD5',
  40: 'SHA-1',
  64: 'SHA-256',
  128: 'SHA-512',
};

/** STIX patterns quote values with single quotes; backslash and quote must be escaped. */
const escapeStixString = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** The STIX pattern for one indicator, or undefined when it cannot be expressed (unknown hash length). */
export const toStixPattern = ({ type, value }: IndicatorRow): string | undefined => {
  const escaped = escapeStixString(value);
  switch (type) {
    case 'domain':
      return `[domain-name:value = '${escaped}']`;
    case 'ip':
      return `[${value.includes(':') ? 'ipv6-addr' : 'ipv4-addr'}:value = '${escaped}']`;
    case 'file_hash': {
      const algorithm = HASH_ALGORITHM_BY_LENGTH[value.length];
      return algorithm ? `[file:hashes.'${algorithm}' = '${escaped}']` : undefined;
    }
  }
};

/** Fixed namespace so the same pattern always maps to the same indicator id. */
const STIX_ID_NAMESPACE = 'c0a1f6a4-5d1b-4a3e-9a6e-2b8f4a3b7d10';

export interface StixIndicator {
  type: 'indicator';
  spec_version: '2.1';
  id: string;
  created: string;
  modified: string;
  name: string;
  indicator_types: ['malicious-activity'];
  pattern: string;
  pattern_type: 'stix';
  valid_from: string;
}

export interface StixBundle {
  type: 'bundle';
  id: string;
  objects: StixIndicator[];
}

/**
 * A STIX 2.1 bundle with one indicator per row. Ids come from the task id and
 * the pattern, and `createdAt` (the run's creation time) is passed in, so the
 * same input always gives the same bundle. Rows whose pattern cannot be
 * expressed are left out.
 */
export const buildStixBundle = (
  taskId: string,
  rows: IndicatorRow[],
  createdAt: string
): StixBundle | undefined => {
  const seen = new Set<string>();
  const objects: StixIndicator[] = [];
  for (const row of rows) {
    const pattern = toStixPattern(row);
    if (pattern && !seen.has(pattern)) {
      seen.add(pattern);
      objects.push({
        type: 'indicator',
        spec_version: '2.1',
        id: `indicator--${uuidv5(`${taskId}:${pattern}`, STIX_ID_NAMESPACE)}`,
        created: createdAt,
        modified: createdAt,
        name: row.value,
        indicator_types: ['malicious-activity'],
        pattern,
        pattern_type: 'stix',
        valid_from: createdAt,
      });
    }
  }
  // STIX 2.1 requires `objects` to be non-empty when present, so an empty bundle is not valid.
  if (objects.length === 0) return undefined;
  return {
    type: 'bundle',
    id: `bundle--${uuidv5(
      `${taskId}:${objects.map(({ id }) => id).join(',')}`,
      STIX_ID_NAMESPACE
    )}`,
    objects,
  };
};

/** Markdown comment listing the indicators, for a case. */
export const buildIndicatorsComment = (taskId: string, rows: IndicatorRow[]): string =>
  [
    i18n.OVERVIEW_INDICATORS_COMMENT_HEADER({ taskId }),
    '',
    ...rows.map(({ type, value }) => i18n.OVERVIEW_INDICATORS_COMMENT_LINE({ type, value })),
  ].join('\n');
