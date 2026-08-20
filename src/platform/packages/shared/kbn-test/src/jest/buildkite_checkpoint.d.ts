/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Returns true when running inside a Buildkite CI environment.
 */
export declare function isInBuildkite(): boolean;
/**
 * Builds a deterministic checkpoint key for a given config path.
 * The key incorporates the Buildkite step ID and parallel job index
 * so checkpoints are scoped to the specific CI worker.
 */
export declare function getCheckpointKey(config: string): string;
/**
 * Marks a config as completed in Buildkite meta-data.
 * Best-effort: errors are silently ignored.
 */
export declare function markConfigCompleted(config: string): Promise<void>;
/**
 * Synchronous version of markConfigCompleted.
 * Intended for use inside process.on('exit') handlers where async is not supported.
 * Best-effort: errors are silently ignored.
 */
export declare function markConfigCompletedSync(config: string): void;
/**
 * Checks whether a config was already completed on a previous attempt.
 * Returns false outside of Buildkite or on any error.
 */
export declare function isConfigCompleted(config: string): Promise<boolean>;
