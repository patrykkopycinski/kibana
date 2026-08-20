/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type JsonValue = null | boolean | number | string | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = Array<JsonValue>;
export type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | SerializableArray
  | SerializableRecord;
export type SerializableArray = Array<Serializable>;
export type SerializableRecord = Record<string, Serializable>;
