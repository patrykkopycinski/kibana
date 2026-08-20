/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreEnv } from '@kbn/core-base-browser-internal';
/**
 * Hook to access the environment context
 * @throws Error if used outside of KibanaEnvContext
 */
export declare const useCoreEnv: () => CoreEnv;
/**
 * The environment context provider
 */
export declare const CoreEnvContextProvider: import('react').Provider<CoreEnv | undefined>;
