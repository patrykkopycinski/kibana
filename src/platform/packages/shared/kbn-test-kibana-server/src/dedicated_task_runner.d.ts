/**
 * Static helpers for the split UI / background-tasks Kibana processes used in tests.
 * The FTR service class {@link DedicatedTaskRunner} in `@kbn/test` wraps these helpers
 * with runtime state (port, URL, KbnClient, etc.).
 */
export declare class DedicatedTaskRunnerConfig {
    private constructor();
    static getPort(uiPort: number): number;
    static getUuid(mainUuid: string): string;
}
