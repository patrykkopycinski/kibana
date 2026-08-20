/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export declare const KBN_EVALS_VAULT_CONFIG_FIELD = 'config';
export declare const DEFAULT_VAULT_ADDR = 'https://secrets.elastic.co:8200';
export type KbnEvalsVaultType = 'ci-prod' | 'dev';
export declare const KBN_EVALS_VAULT_TYPES: ReadonlyArray<KbnEvalsVaultType>;
export declare const KBN_EVALS_VAULT_PATHS: Record<KbnEvalsVaultType, string>;
export declare const getVaultAddr: () => string;
export declare const safeExec: (command: string, args: string[]) => string | null;
