import type { Command } from '@kbn/dev-cli-runner';
import type { FlagsReader } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
export declare const runStartServer: (flagsReader: FlagsReader, log: ToolingLog) => Promise<void>;
/**
 * Start servers
 */
export declare const startServerCmd: Command<void>;
