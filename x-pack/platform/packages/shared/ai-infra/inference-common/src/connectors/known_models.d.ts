/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ModelFamily, ModelProvider } from '../model_provider';
export interface ModelDefinition {
  id: string;
  provider: ModelProvider;
  family: ModelFamily;
  contextWindow: number;
}
/**
 * Retrieve a model definition from the given full model name, if available.
 */
export declare const getModelDefinition: (fullModelName: string) => ModelDefinition | undefined;
/**
 * List of manually maintained model definitions to use as fallback for feature detection.
 */
export declare const knownModels: ModelDefinition[];
