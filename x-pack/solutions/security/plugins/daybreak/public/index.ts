/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializerContext } from '@kbn/core/public';
import { DaybreakPublicPlugin } from './plugin';

/**
 * Browser-side entry point for the Daybreak plugin (FR-008, FR-009, FR-010).
 *
 * Registers the top-level Kibana application route (`public/plugin.ts`'s
 * `core.application.register` call) gated on the server-exposed
 * `xpack.daybreak.enabled` flag (FR-009, NFR-2).
 * The top-level application component, `DaybreakApp`
 * (`public/application/components/shell.tsx`), renders real PD-2 Proposal
 * data via the Daybreak HTTP API — no mocked/seeded data.
 *
 * Unlike the server-side `PluginInitializer` (which is `async` so
 * `./plugin` can be lazily imported), the browser-side `PluginInitializer`
 * type (`@kbn/core-plugins-browser`) is synchronous — core calls
 * `initializer(context)` without `await` and immediately checks
 * `instance.setup`/`instance.start` on the return value. An `async`
 * initializer here returns a `Promise`, which has no `.setup` and throws
 * `Instance of plugin "daybreak" does not define "setup" function.` at
 * runtime.
 */
export function plugin(initializerContext: PluginInitializerContext) {
  return new DaybreakPublicPlugin(initializerContext);
}
