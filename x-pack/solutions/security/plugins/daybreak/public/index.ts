/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DaybreakPublicPlugin } from './plugin';

/**
 * Browser-side entry point for the Daybreak plugin (FR-008).
 *
 * Flipping `kibana.jsonc` to `browser: true` requires this module so the
 * kbn-optimizer can resolve a bundle entry point. The full application shell,
 * route registration, and Throughline UI components are layered in by
 * subsequent plan tasks.
 */
export function plugin() {
  return new DaybreakPublicPlugin();
}
