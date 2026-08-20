/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InferenceConnector } from './connectors';
/**
 * Retrieve the context window size for the default model of the given connector, if available.
 */
export declare const getContextWindowSize: (connector: InferenceConnector) => number | undefined;
export declare const contextWindowFromModelName: (modelName: string) => number | undefined;
