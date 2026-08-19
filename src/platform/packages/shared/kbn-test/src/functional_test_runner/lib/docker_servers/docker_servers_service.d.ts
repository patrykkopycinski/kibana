import * as Rx from 'rxjs';
import type { ToolingLog } from '@kbn/tooling-log';
import type { DockerServer, DockerServerSpec } from '@kbn/test-docker-servers';
import type { Lifecycle } from '../lifecycle';
export declare class DockerServersService {
    private log;
    private lifecycle;
    private disabled?;
    private servers;
    constructor(configs: {
        [name: string]: DockerServerSpec;
    }, log: ToolingLog, lifecycle: Lifecycle, disabled?: boolean | undefined);
    isEnabled(name: string): boolean;
    has(name: string): boolean;
    get(name: string): {
        enabled: boolean;
        portInContainer: number;
        port: number;
        image: string;
        preferCached?: boolean;
        waitForLogLine?: RegExp | string;
        waitForLogLineTimeoutMs?: number;
        waitFor?: (server: DockerServer, logLine$: Rx.Observable<string>) => Rx.Observable<unknown>;
        args?: string[];
        name: string;
        url: string;
    };
    private dockerRun;
    private startServer;
    private isImageAvailableLocally;
    private startServers;
}
