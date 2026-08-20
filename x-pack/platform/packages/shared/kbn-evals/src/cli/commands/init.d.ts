/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Command } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
export declare const ensureLocalConfig: (repoRoot: string, log: ToolingLog) => Promise<void>;
export declare const runConfigInit: (
  repoRoot: string,
  log: ToolingLog,
  options?: {
    profile?: string;
  }
) => Promise<boolean>;
export declare const ensureVaultAuth: (log: ToolingLog) => Promise<void>;
export declare const runConnectorSetup: (repoRoot: string, log: ToolingLog) => Promise<void>;
export declare const initCmd: Command<void>;
