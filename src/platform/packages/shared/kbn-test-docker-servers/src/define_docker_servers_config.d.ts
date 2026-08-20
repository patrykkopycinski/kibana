import type * as Rx from 'rxjs';
export interface DockerServerSpec {
    enabled: boolean;
    portInContainer: number;
    port: number;
    image: string;
    preferCached?: boolean;
    waitForLogLine?: RegExp | string;
    waitForLogLineTimeoutMs?: number;
    /** a function that should return an observable that will allow the tests to execute as soon as it emits anything */
    waitFor?: (server: DockerServer, logLine$: Rx.Observable<string>) => Rx.Observable<unknown>;
    args?: string[];
}
export interface DockerServer extends DockerServerSpec {
    name: string;
    url: string;
}
/**
 * Helper that helps authors use the type definitions for the section of the FTR config
 * under the `dockerServers` key.
 */
export declare function defineDockerServersConfig(config: {
    [name: string]: DockerServerSpec;
} | {}): {
    [name: string]: DockerServerSpec;
} | {};
