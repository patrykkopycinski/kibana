/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutTestTarget } from '@kbn/scout-info';
export declare const stripRunCommand: (commandArgs: string[]) => string;
/**
 * Returns the command line used to run Scout tests.
 *
 * When Scout starts Playwright, the Playwright process argv no longer contains the Scout CLI invocation.
 * In those cases, Scout sets SCOUT_RUN_COMMAND and we prefer it for reporting.
 */
export declare function getRunCommand(argv?: string[]): string;
/**
 * Tries to determine the Scout test target from process attributes.
 *
 * @param argv Process argument values
 *
 * @return ScoutTestTarget if necessary information was found in process arguments
 *
 * This won't return a target if '--grep' is not provided in the command line
 */
export declare function getTestTargetFromProcessArguments(
  argv?: string[]
): ScoutTestTarget | undefined;
