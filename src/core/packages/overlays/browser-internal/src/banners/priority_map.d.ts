/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

interface PriorityValue {
  readonly priority: number;
}
/**
 * Immutable map that ensures entries are always in descending order based on
 * the values 'priority' property.
 */
export declare class PriorityMap<K, V extends PriorityValue> implements Iterable<[K, V]> {
  private readonly map;
  constructor(map?: ReadonlyMap<K, V>);
  add(key: K, value: V): PriorityMap<K, V>;
  remove(key: K): PriorityMap<K, V>;
  has(key: K): boolean;
  [Symbol.iterator](): MapIterator<[K, V]>;
  values(): MapIterator<V>;
}
export {};
