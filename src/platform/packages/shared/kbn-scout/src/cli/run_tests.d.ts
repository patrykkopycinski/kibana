import type { Command } from '@kbn/dev-cli-runner';
import type { FlagsReader } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
export declare const runScoutPlaywrightConfig: (flagsReader: FlagsReader, log: ToolingLog) => Promise<void>;
/**
 * Start servers and run the tests
 */
export declare const runTestsCmd: Command<void>;
