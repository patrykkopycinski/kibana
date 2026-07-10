/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializerContext } from '@kbn/core/public';

/**
 * Browser-side entry point for the Daybreak plugin (FR-008, FR-009, FR-010).
 *
 * Registers the top-level Kibana application route (`public/plugin.ts`'s
 * `core.application.register` call) gated on the server-exposed
 * `xpack.daybreak.enabled` flag (FR-009, NFR-2).
 * The application shell (`public/application/components/shell.tsx`) renders
 * real PD-2 Proposal data via the Daybreak HTTP API — no mocked/seeded data.
 */
export async function plugin(initializerContext: PluginInitializerContext) {
  const { DaybreakPublicPlugin } = await import('./plugin');
  return new DaybreakPublicPlugin(initializerContext);
}
