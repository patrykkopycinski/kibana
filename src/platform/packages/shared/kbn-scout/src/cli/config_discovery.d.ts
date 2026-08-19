import type { Command, FlagsReader } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
export type { FlattenedConfigGroup, ModuleDiscoveryInfo } from '../tests_discovery/types';
export declare const runDiscoverPlaywrightConfigs: (flagsReader: FlagsReader, log: ToolingLog) => void;
/**
 * CLI command to discover Playwright configuration files with Scout tests.
 *
 * This command scans the codebase for Playwright configuration files that contain
 * Scout tests, filters them based on deployment target tags, and optionally saves
 * or validates the results.
 *
 * The command supports five deployment targets:
 * - 'all': Finds configs with deployment-agnostic tags
 * - 'local': Finds configs with @local-* tags (local stateful + local serverless)
 * - 'local-stateful-only': Finds configs with @local-stateful-* tags only
 * - 'mki': Finds configs with @cloud-serverless-* tags
 * - 'ech': Finds configs with @cloud-stateful-* tags
 *
 * Output formats:
 * - Standard: Lists modules grouped by plugin/package with their configs and tags
 * - Flattened: Groups configs by deployment mode (stateful/serverless), group, and run mode
 *
 * Selective testing (PR pipelines):
 * - The selective-testing decision (full / tests-only / dependency-tree) is made
 *   upstream by `scout resolve-testing-scope`, which writes a `testing_scope.json`
 *   hand-off artifact. Pass it via --testing-scope <file>.
 *   - kind: 'full'             -> no filtering, run every module
 *   - kind: 'tests-only'       -> filter to the Playwright configs owning the diff
 *   - kind: 'dependency-tree'  -> filter to modules in scope.affectedModules
 *   In all cases, scope.affectedModules is used to mark each module's `isAffected`
 *   flag so CI step labels can carry an "affected " prefix.
 */
export declare const discoverPlaywrightConfigsCmd: Command<void>;
