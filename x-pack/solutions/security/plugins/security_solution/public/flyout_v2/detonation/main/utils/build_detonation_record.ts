/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord, EsHitRecord } from '@kbn/discover-utils';
import { buildDataTableRecord } from '@kbn/discover-utils';
import type { DetonateTask } from '../../../../../common/detonate_prototype';
import { redactDetonateTask } from '../../../../../common/detonate_prototype';

const DETONATION_INDEX = 'detonate-tasks';

type FieldValues = unknown[];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toFieldValue = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? JSON.stringify(value) : value;

const flattenInto = (target: Record<string, FieldValues>, value: unknown, path: string): void => {
  if (value === undefined || value === null) return;
  if (isPlainObject(value)) {
    Object.entries(value).forEach(([key, child]) =>
      flattenInto(target, child, path ? `${path}.${key}` : key)
    );
    return;
  }
  target[path] = (Array.isArray(value) ? value : [value]).map(toFieldValue);
};

/**
 * Builds the `DataTableRecord` the shared flyout Table tab renders for a run.
 * The task is flattened to dot-path fields (arrays of objects become JSON
 * strings) and the Fleet enrollment token is redacted.
 */
export const buildDetonationRecord = (task: DetonateTask): DataTableRecord => {
  const rest = redactDetonateTask(task);
  const fields: Record<string, FieldValues> = {};
  flattenInto(fields, rest, '');

  return buildDataTableRecord({
    _id: task.id,
    _index: DETONATION_INDEX,
    _source: { ...rest },
    fields,
  } as EsHitRecord);
};
