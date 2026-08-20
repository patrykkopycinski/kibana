/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type KibanaCliArg = string & {
  readonly __cliArgBrand: unique symbol;
};
export type ArgValue = boolean | string | number | Record<string, unknown> | unknown[] | null;
/**
 * Get the value of an arg from the CliArg flags.
 */
export declare function getArgValue(
  args: KibanaCliArg[],
  name: string
): ArgValue | ArgValue[] | undefined;
export declare function parseRawFlags(rawFlags: string[]): KibanaCliArg[];
/**
 * Parse a list of Kibana CLI Arg flags and find the flag with the given name. If the flag has no
 * value then a boolean will be returned (assumed to be a switch flag). If the flag does have a value
 * that can be parsed by `JSON.stringify()` the parsed result is returned. Otherwise the raw string
 * value is returned.
 */
export declare function getKibanaCliArg(
  rawFlags: string[],
  name: string
): ArgValue[] | ArgValue | undefined;
/**
 * Parse the list of Kibana CLI Arg flags and extract the loggers config so that they can be extended
 * in a subsequent FTR config
 */
export declare function getKibanaCliLoggers(rawFlags: string[]): unknown[];
/**
 * Parse the list of Kibana CLI Arg flags and extract the loggers config so that they can be extended
 * in a subsequent FTR config
 */
export declare function remapPluginPaths(
  args: KibanaCliArg[],
  kibanaInstallDir: string
): KibanaCliArg[];
