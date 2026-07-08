/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializerContext, PluginConfigDescriptor } from '@kbn/core/server';

import { configSchema, type ConfigType } from '../common/config';

//  This exports static code and TypeScript types,
//  as well as, Kibana Platform `plugin()` initializer.

export const config: PluginConfigDescriptor<ConfigType> = {
  schema: configSchema,
};

export async function plugin(initializerContext: PluginInitializerContext) {
  const { DaybreakPlugin } = await import('./plugin');
  return new DaybreakPlugin(initializerContext);
}

export type { DaybreakPluginSetup, DaybreakPluginStart } from './types';
