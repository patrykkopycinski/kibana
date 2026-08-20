import type { ToolingLog } from '@kbn/tooling-log';
import type { Config } from './configs';
interface RunElasticsearchOptions {
    log: ToolingLog;
    esFrom?: string;
    esServerlessImage?: string;
    preserveEsData?: boolean;
    config: Config;
    onEarlyExit?: (msg: string) => void;
    logsDir?: string;
    name?: string;
}
export declare function runElasticsearch(options: RunElasticsearchOptions): Promise<() => Promise<void>>;
export {};
