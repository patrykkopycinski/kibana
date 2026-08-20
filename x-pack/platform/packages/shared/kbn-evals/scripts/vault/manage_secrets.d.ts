import { type KbnEvalsVaultType } from '../../src/cli/utils';
/**
 * Vault-backed config used by @kbn/evals CI and local development.
 *
 * This is intentionally minimal: we store only the LiteLLM key + base URL,
 * and credentials for the centralized Elasticsearch cluster where eval results
 * are exported.
 */
export declare const KBN_EVALS_VAULT_ENV_VAR = "KIBANA_EVALS_CI_CONFIG";
export declare const getVaultPath: (vault: KbnEvalsVaultType) => string;
declare const configSchema: import("@kbn/config-schema").ObjectType<{
    description: import("@kbn/config-schema").Type<string | undefined>;
    contact: import("@kbn/config-schema").Type<string | undefined>;
    owner: import("@kbn/config-schema").Type<string | undefined>;
    environment: import("@kbn/config-schema").Type<string | undefined>;
    creation_date: import("@kbn/config-schema").Type<string | undefined>;
    refresh_interval: import("@kbn/config-schema").Type<string | undefined>;
    litellm: import("@kbn/config-schema").ObjectType<{
        baseUrl: import("@kbn/config-schema").Type<string>;
        /**
         * LiteLLM *virtual key* (sk-...) used to call the proxy (and to query team metadata).
         * This should not be the proxy master key.
         */
        virtualKey: import("@kbn/config-schema").Type<string>;
        /**
         * Optional team id used by CI to discover models for connector generation.
         * If omitted, CI may use a baked-in default.
         */
        teamId: import("@kbn/config-schema").Type<string | undefined>;
        /**
         * Optional, human-readable team name (not used for auth).
         */
        teamName: import("@kbn/config-schema").Type<string | undefined>;
    }>;
    /**
     * Connector used for LLM-as-a-judge evaluators. Must match a connector ID present
     * in the generated `KIBANA_TESTING_AI_CONNECTORS` payload.
     */
    evaluationConnectorId: import("@kbn/config-schema").Type<string>;
    evaluationsEs: import("@kbn/config-schema").ObjectType<{
        url: import("@kbn/config-schema").Type<string>;
        apiKey: import("@kbn/config-schema").Type<string>;
    }>;
    tracingEs: import("@kbn/config-schema").Type<Readonly<{} & {
        url: string;
        apiKey: string;
    }> | undefined>;
    evaluationsKbn: import("@kbn/config-schema").Type<Readonly<{} & {
        url: string;
        apiKey: string;
    }> | undefined>;
    gcsDatasetAccessCredentials: import("@kbn/config-schema").Type<Readonly<{} & {}> | undefined>;
}>;
export type KbnEvalsConfig = ReturnType<typeof configSchema.validate>;
export declare const validateKbnEvalsConfig: (config: unknown) => KbnEvalsConfig;
export declare const retrieveFromVault: (vaultPath: string, filePath: string, field: string) => Promise<void>;
export declare const retrieveConfigFromVault: (vault: KbnEvalsVaultType) => Promise<void>;
export declare const uploadToVault: (vaultPath: string, filePath: string, field: string) => Promise<void>;
export declare const uploadConfigToVault: (vault: KbnEvalsVaultType) => Promise<void>;
export declare const getCommand: (format: 'vault-write' | 'env-var' | undefined, vault: KbnEvalsVaultType) => Promise<string>;
export declare const getKbnEvalsConfigFromEnvVar: () => KbnEvalsConfig;
export {};
