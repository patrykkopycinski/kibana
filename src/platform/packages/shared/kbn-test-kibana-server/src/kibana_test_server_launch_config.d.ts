/**
 * Minimal config surface used to spawn Kibana (and optional dedicated task runner) for tests.
 * Satisfied by the FTR {@link Config} type and Scout server configs.
 */
export interface KibanaTestServerLaunchConfig {
    get(path: string): unknown;
}
