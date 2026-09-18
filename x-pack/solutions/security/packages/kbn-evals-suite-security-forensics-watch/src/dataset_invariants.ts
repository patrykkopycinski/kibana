/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SeededForensicEvent } from './data_generators/forensic_data';
import type { ForensicExample } from './types';

/**
 * Binds the golden IoC labels in `dataset.ts` to the telemetry
 * `data_generators/forensic_data.ts` inserts.
 *
 * The deterministic IoC evaluator scores the agent against the golden labels,
 * so a label the seeded telemetry contradicts (a `not_found` for an IP the
 * seeder does insert) penalizes a correct validator. That mismatch is
 * invisible to the eval itself, which is why it is asserted here instead.
 */

export interface SeededIocIndex {
  networkDestinations: string[];
  fileHashes: string[];
  registryPaths: string[];
  processNames: string[];
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

const getPath = (source: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => asRecord(acc)?.[key], source);

const collectStrings = (target: string[], ...values: unknown[]): void => {
  values.forEach((value) => {
    if (typeof value === 'string' && value.length > 0) target.push(value);
  });
};

/**
 * Extracts the IoC-bearing field values from built seed events, using the same
 * ECS paths the skill's IoC validation queries read.
 */
export const buildSeededIocIndex = (events: ReadonlyArray<SeededForensicEvent>): SeededIocIndex => {
  const index: SeededIocIndex = {
    networkDestinations: [],
    fileHashes: [],
    registryPaths: [],
    processNames: [],
  };

  events.forEach(({ document }) => {
    collectStrings(
      index.networkDestinations,
      getPath(document, 'destination.ip'),
      getPath(document, 'destination.address'),
      getPath(document, 'destination.domain')
    );
    collectStrings(
      index.fileHashes,
      getPath(document, 'process.hash.sha256'),
      getPath(document, 'file.hash.sha256')
    );
    collectStrings(index.registryPaths, getPath(document, 'registry.path'));
    collectStrings(index.processNames, getPath(document, 'process.name'));
  });

  return {
    networkDestinations: [...new Set(index.networkDestinations)],
    fileHashes: [...new Set(index.fileHashes)],
    registryPaths: [...new Set(index.registryPaths)],
    processNames: [...new Set(index.processNames)],
  };
};

/**
 * Whether the seeded telemetry contains the given IoC. Registry labels may
 * name a key whose seeded path carries a value suffix, so they match by prefix.
 */
export const seededTelemetryHasIoc = (
  index: SeededIocIndex,
  type: string,
  value: string
): boolean => {
  switch (type) {
    case 'network_destination':
      return index.networkDestinations.includes(value);
    case 'file_hash':
      return index.fileHashes.includes(value);
    case 'process_name':
      return index.processNames.includes(value);
    case 'registry_key':
      return index.registryPaths.some(
        (path) => path === value || path.startsWith(`${value}\\`) || path.startsWith(`${value}/`)
      );
    default:
      return false;
  }
};

/**
 * Reports every golden label the seeded telemetry contradicts.
 *
 * `unable_to_validate` labels carry no assertion: they describe IoC types the
 * suite deliberately does not seed evidence for.
 */
export const findDatasetTelemetryViolations = (
  cases: ReadonlyArray<ForensicExample>,
  index: SeededIocIndex
): string[] => {
  const violations: string[] = [];
  const seededAny = Object.values(index).some((values) => values.length > 0);
  if (!seededAny) {
    violations.push('seeder produced no IoC-bearing telemetry — the labels cannot be checked');
  }

  cases.forEach((example) => {
    example.output.expectedIocs.forEach(({ type, value, status }) => {
      const present = seededTelemetryHasIoc(index, type, value);

      if (status === 'confirmed' && !present) {
        violations.push(
          `${example.id}: expects ${type}=${value} confirmed but the seeder inserts no matching telemetry`
        );
      }
      if (status === 'not_found' && present) {
        violations.push(
          `${example.id}: expects ${type}=${value} not_found but the seeder inserts matching telemetry`
        );
      }
    });
  });

  return violations;
};
