/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { Config } from '@jest/types';
/**
 * Runs Jest tests with automatic config discovery and argument forwarding.
 *
 * Searches for jest.config.js files starting from the working directory
 * and walking up the directory tree until reaching the repo root.
 *
 * @param configName - Name of the Jest config file to search for
 */
export declare function runJest(configName?: string): Promise<void>;
interface ParsedJestArguments {
  parsedArguments: any;
  unknownFlags: string[];
}
/**
 * Parses command line arguments and validates Jest flags.
 *
 * @returns Object containing parsed arguments and any unknown flags
 * @throws Error if unknown flags are detected
 */
export declare function parseJestArguments(): ParsedJestArguments;
/**
 * Searches for Jest config files in the directory tree, starting from a given path
 * and walking up to the repository root.
 *
 * @param startPath - Directory path to start searching from
 * @param configNames - Array of config file names to search for (in priority order)
 * @returns Path to the first config file found, or null if none found
 */
export declare function findConfigInDirectoryTree(
  startPath: string,
  configNames: string[]
): string | null;
/**
 * Discovers Jest configuration file by searching the directory tree.
 *
 * @param testFiles - Array of test file paths
 * @param currentWorkingDirectory - Current working directory
 * @param configName - Standard config file name to search for
 * @param log - Logger instance for verbose output
 * @returns Path to discovered config file
 * @throws Error if no config file is found
 */
export declare function discoverJestConfig(
  testFiles: string[],
  currentWorkingDirectory: string,
  configName: string,
  log: ToolingLog
): string;
/**
 * Resolve the Jest configuration from either an inline JSON value (via `--config`)
 * or from a filesystem config file path.
 *
 * Resolution rules:
 * - If `parsedArguments.config` is present and valid JSON, that object is used as the config.
 * - Otherwise, `parsedArguments.config` (or `resolvedConfigPath`) is treated as a path to a Jest
 *   config file and loaded via `readInitialOptions(...)`.
 *
 * @param parsedArguments - CLI args as parsed by `getopts`; may include `config`.
 * @param resolvedConfigPath - Absolute path to a Jest config file, when already discovered.
 * @returns Promise resolving to an object with:
 *   - `config`: the resolved Jest `Config.InitialOptions`.
 *   - `configPath`: the path used to load the config when loaded from file, or `undefined` when
 *     the config was provided inline via JSON.
 * @throws If neither a valid inline config nor a readable config file path can be determined,
 *   or if the supplied file path does not exist.
 */
export declare function resolveJestConfig(
  parsedArguments: any,
  resolvedConfigPath?: string
): Promise<{
  config: Config.InitialOptions;
  configPath: string | undefined;
}>;
interface JestExecutionContext {
  jestArgv: string[];
  originalArgv: string[];
}
/**
 * Prepares Jest execution context by setting up configuration and arguments.
 * This will make sure Jest uses an inline JSON config which has a cache directory set.
 *
 * @param baseConfig - Base Jest configuration
 * @returns Jest execution context with processed arguments (already sliced for Jest consumption)
 */
export declare function prepareJestExecution(
  baseConfig: Config.InitialOptions
): Promise<JestExecutionContext>;
/**
 * Finds the common base path by sorting the array and comparing the first and last element.
 * This leverages the fact that string sorting ensures the first and last elements
 * will have the maximum difference, so their common prefix is the common base for all paths.
 *
 * @param paths - Array of file/directory paths
 * @param sep - Path separator (defaults to OS separator)
 * @returns Common base path shared by all input paths
 */
export declare function commonBasePath(paths?: string[], sep?: '/' | '\\'): string;
/**
 * Removes occurrences of a CLI flag (and its following value if present) from argv array.
 * Supports both --flag value and --flag=value forms.
 *
 * @param argv - Array of command line arguments
 * @param flag - Flag name (without the -- prefix)
 * @returns New array with the specified flag and its values removed
 */
export declare function removeFlagFromArgv(argv: string[], flag: string): string[];
export {};
