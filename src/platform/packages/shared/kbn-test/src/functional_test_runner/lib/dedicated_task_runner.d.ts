import type { ToolingLog } from '@kbn/tooling-log';
import type Supertest from 'supertest';
import type { KbnClient } from '@kbn/kbn-client';
import type { Config } from './config';
export declare class DedicatedTaskRunner {
    static getPort(uiPort: number): number;
    static getUuid(mainUuid: string): string;
    /**
     * True when the FTR config indicates that Kibana has a dedicated task runner process, otherwise false. If this
     * property is false then all other methods on this class will throw when they are called, so if you're not
     * certain where your code will be run make sure to check `dedicatedTaskRunner.enabled` before calling
     * other methods.
     */
    readonly enabled: boolean;
    private readonly enabledProps?;
    constructor(config: Config, log: ToolingLog);
    private getEnabledProps;
    /**
     * The port number that the dedicated task runner is running on
     */
    getPort(): number;
    /**
     * The full URL for the dedicated task runner process
     */
    getUrl(): string;
    /**
     * Returns true if the `--server.uuid` setting was passed to the Kibana server, allowing the UUID to
     * be deterministic and ensuring that `dedicatedTaskRunner.getUuid()` won't throw.
     */
    hasUuid(): boolean;
    /**
     * If `--server.uuid` is passed to Kibana in the FTR config file then the dedicated task runner will
     * use a UUID derived from that and it will be synchronously available to users via this function.
     * Otherwise this function will through.
     */
    getUuid(): string;
    /**
     * @returns a `KbnClient` instance that is configured to talk directly to the dedicated task runner. Not really sure how useful this is.
     */
    getClient(): KbnClient;
    /**
     * @returns a Supertest instance that will send requests to the dedicated task runner.
     *
     * @example
     *  const supertest = dedicatedTaskRunner.getSupertest();
     *  const response = await supertest.get('/status');
     */
    getSupertest(): import("supertest/lib/agent")<Supertest.SuperTestStatic.Test>;
}
