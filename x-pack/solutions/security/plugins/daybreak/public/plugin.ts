/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';

/**
 * Public-side plugin for Daybreak (FR-008).
 *
 * This is a minimal stub that satisfies the `browser: true` entry-point
 * requirement. Application registration, route mounting, and the Throughline
 * UI port are added in subsequent plan tasks.
 */
export class DaybreakPublicPlugin implements Plugin {
  public setup(_core: CoreSetup) {
    return {};
  }

  public start(_core: CoreStart) {
    return {};
  }

  public stop() {}
}
