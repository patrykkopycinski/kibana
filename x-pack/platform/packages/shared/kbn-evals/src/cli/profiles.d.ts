/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FlagsReader } from '@kbn/dev-cli-runner';
export declare const VAULT_CONFIG_DIR = 'x-pack/platform/packages/shared/kbn-evals/scripts/vault';
/**
 * Virtual profile: load golden-cluster config from dev Vault at runtime (no config file).
 * Use with `--datasets-profile dev-vault` or `--profile dev-vault`.
 */
export declare const DEV_VAULT_PROFILE = 'dev-vault';
export declare const isDevVaultProfile: (profile?: string) => boolean;
export declare const stripTrailingSlash: (url: string) => string;
export declare const probeHttp: (url: string) => Promise<boolean>;
export declare const isExportProfileImplicitLocal: (
  flagsReader: FlagsReader,
  exportProfile?: string
) => boolean;
interface VaultConfig {
  evaluationsKbn?: {
    url?: string;
    apiKey?: string;
  };
  tracingEs?: {
    url?: string;
    apiKey?: string;
  };
  tracingExporters?: unknown;
  gcsDatasetAccessCredentials?: unknown;
}
export declare const resolveVaultConfigPath: (repoRoot: string, profile?: string) => string;
export declare const defaultExportProfile: (repoRoot: string) => string | undefined;
export declare const readVaultConfigFromFile: (
  repoRoot: string,
  profile?: string
) => VaultConfig | undefined;
export declare const readVaultConfigFromDevVault: () => VaultConfig | undefined;
/**
 * Resolves golden-cluster config for CLI commands.
 * Order: dev Vault (`dev-vault` profile) → config file (default: config.json).
 */
export declare const loadVaultConfig: (
  repoRoot: string,
  profile?: string
) => VaultConfig | undefined;
export declare const envFromDatasetsProfile: (
  repoRoot: string,
  profile?: string
) => Record<string, string>;
export declare const envFromExportProfile: (
  repoRoot: string,
  profile?: string,
  options?: {
    defaultTracingExporters?: boolean;
  }
) => Record<string, string>;
export {};
