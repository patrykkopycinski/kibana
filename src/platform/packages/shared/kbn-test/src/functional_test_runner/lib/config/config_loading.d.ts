/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { FtrConfigProvider, GenericFtrProviderContext } from '../../public_types';
import type { Config } from './config';
import type { EsVersion } from '../es_version';
interface Journey {
  config: {
    isSkipped(): boolean;
  };
  testProvider(ctx: GenericFtrProviderContext<any, any>): void;
}
export type ConfigModule =
  | {
      type: 'config';
      path: string;
      provider: FtrConfigProvider;
    }
  | {
      type: 'journey';
      path: string;
      provider: FtrConfigProvider;
      journey: Journey;
    };
export declare function readConfigFile(
  log: ToolingLog,
  esVersion: EsVersion,
  path: string,
  settingOverrides?: any,
  extendSettings?: (vars: any) => any
): Promise<Config>;
export {};
