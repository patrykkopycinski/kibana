import type { ToolingLog } from '@kbn/tooling-log';
import type { Config } from '../../functional_test_runner';
interface RunElasticsearchOptions {
    log: ToolingLog;
    esFrom?: string;
    esServerlessImage?: string;
    config: Config;
    onEarlyExit?: (msg: string) => void;
    logsDir?: string;
    name?: string;
}
export declare function runElasticsearch(options: RunElasticsearchOptions): Promise<() => Promise<void>>;
export {};
