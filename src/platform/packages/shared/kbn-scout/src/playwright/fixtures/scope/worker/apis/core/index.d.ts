import type { KbnClient, ScoutLogger } from '../../../../../../common';
export interface CoreApiService {
    /** * When running in test environments, the Config overrides can be updated without restarting Kibana
     * @param configOverrides - The configuration overrides to apply.
     * @example
     * ```ts
     * await coreApi.settings({
     *   'feature_flags.overrides': {
     *     'my-feature-flag': 'my-forced-value',
     *   }
     * });
     * ```
     */
    settings: (configOverrides: Record<string, any>) => Promise<void>;
}
export declare const getCoreApiHelper: (log: ScoutLogger, kbnClient: KbnClient) => CoreApiService;
