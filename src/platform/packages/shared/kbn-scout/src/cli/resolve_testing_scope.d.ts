import type { Command, FlagsReader } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Decides which Scout tests to run for a PR diff and writes the result to
 * `testing_scope.json`. The same file is then read by
 * `discover-playwright-configs` (configs strategy) and `create-test-tracks`
 * (lanes strategy), so the decision is made once per build.
 */
export declare const runResolveTestingScope: (flagsReader: FlagsReader, log: ToolingLog) => void;
export declare const resolveTestingScopeCmd: Command<void>;
