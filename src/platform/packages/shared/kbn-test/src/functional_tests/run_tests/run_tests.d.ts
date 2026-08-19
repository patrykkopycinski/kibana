import type { ToolingLog } from '@kbn/tooling-log';
import type { RunTestsOptions } from './flags';
/**
 * Run servers and tests for each config
 */
export declare function runTests(log: ToolingLog, options: RunTestsOptions): Promise<void>;
