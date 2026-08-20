import type { ProcRunner } from '@kbn/dev-proc-runner';
import type { Config } from './configs';
export declare function runKibanaServer(options: {
    procs: ProcRunner;
    config: Config;
    installDir?: string;
    extraKbnOpts?: string[];
    logsDir?: string;
    onEarlyExit?: (msg: string) => void;
}): Promise<void>;
export declare function getExtraKbnOpts(installDir: string | undefined, isServerless: boolean): string[];
