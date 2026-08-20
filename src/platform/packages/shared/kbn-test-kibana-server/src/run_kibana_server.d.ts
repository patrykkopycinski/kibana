import type { ProcRunner } from '@kbn/dev-proc-runner';
import type { KibanaTestServerLaunchConfig } from './kibana_test_server_launch_config';
export interface RunKibanaServerOptions {
    procs: ProcRunner;
    config: KibanaTestServerLaunchConfig;
    installDir?: string;
    extraKbnOpts?: string[];
    logsDir?: string;
    onEarlyExit?: (msg: string) => void;
    inspect?: boolean;
    remote?: boolean;
    /**
     * Prefix for UI process `path.data` temp dir (`${prefix}-ui-<uuid>`). FTR default: `ftr`. Scout uses `scout`.
     */
    uiEphemeralDirPrefix?: string;
    /**
     * Prefix for task-runner `path.data` temp dir (`${prefix}-task-runner-<uuid>`). Default: `ftr`.
     */
    taskRunnerEphemeralDirPrefix?: string;
}
export declare function runKibanaServer(options: RunKibanaServerOptions): Promise<void>;
