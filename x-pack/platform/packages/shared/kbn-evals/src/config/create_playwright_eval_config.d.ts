/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutTestOptions } from '@kbn/scout';
import type { PlaywrightTestConfig } from '@playwright/test';
import type { AvailableConnectorWithId } from '@kbn/gen-ai-functional-testing';
export interface EvaluationTestOptions extends ScoutTestOptions {
  connectorParam: AvailableConnectorWithId;
  evaluationConnectorParam: AvailableConnectorWithId;
  repetitions: number;
  timeout?: number;
}
/**
 * Exports a Playwright configuration specifically for offline evals
 */
export declare function createPlaywrightEvalsConfig({
  testDir,
  testIgnore,
  repetitions,
  timeout,
  runGlobalSetup,
  workers,
}: {
  testDir: string;
  testIgnore?: PlaywrightTestConfig['testIgnore'];
  repetitions?: number;
  timeout?: number;
  runGlobalSetup?: boolean;
  workers?: 1 | 2 | 3;
}): PlaywrightTestConfig<{}, EvaluationTestOptions>;
