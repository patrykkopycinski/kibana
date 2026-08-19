import type { Command } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
export declare const runScoutPlaywrightConfig: (log: ToolingLog) => Promise<void>;
/**
 * Validates that the Playwright 'test' command can run successfully
 */
export declare const runPlaywrightTestCheckCmd: Command<void>;
