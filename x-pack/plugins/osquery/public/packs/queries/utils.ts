/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import ECSSchema from '../../common/schemas/ecs/v8.2.0.json';

export const ECSSchemaOptions = ECSSchema.map((ecs) => ({
  label: ecs.field,
  value: ecs,
}));

export type ECSSchemaOption = typeof ECSSchemaOptions[0];
