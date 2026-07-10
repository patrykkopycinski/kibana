/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Setup contract exposed to other plugins by the Daybreak public plugin. */
export type DaybreakPublicPluginSetup = Record<string, never>;

/** Start contract exposed to other plugins by the Daybreak public plugin. */
export type DaybreakPublicPluginStart = Record<string, never>;

/** Optional plugin dependencies consumed during setup/start. Empty today — the
 * `public/` layer only talks to the daybreak HTTP API, not other plugins. */
export type DaybreakPublicPluginSetupDeps = Record<string, never>;
export type DaybreakPublicPluginStartDeps = Record<string, never>;
