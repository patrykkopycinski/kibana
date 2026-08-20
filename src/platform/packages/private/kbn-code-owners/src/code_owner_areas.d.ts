/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Code owner area names
 */
export declare const CODE_OWNER_AREAS: readonly [
  'platform',
  'search',
  'observability',
  'security',
  'workplaceai',
  'vectordb'
];
export type CodeOwnerArea = (typeof CODE_OWNER_AREAS)[number];
/**
 * Area mappings for code owners, derived from the team registry (`teams.jsonc`).
 *
 * A team appears under every area in its `areas`, preserving multi-area
 * membership. Computed lazily and memoized on first call so merely importing
 * this module (e.g. for {@link findAreaForCodeOwner}) does not read the registry
 * from disk; consumers that never need the mapping pay no IO or parse cost.
 */
export declare function getCodeOwnerAreaMappings(): {
  [area in CodeOwnerArea]: string[];
};
/**
 * Find what area a code owner belongs to
 *
 * A team may belong to several areas; the primary area is the first one in
 * {@link CODE_OWNER_AREAS} order, preserving the historical lookup behavior.
 *
 * @param owner Owner to find an area name
 * @returns The code owner area if a match for the given owner is found
 */
export declare function findAreaForCodeOwner(owner: string): CodeOwnerArea | undefined;
